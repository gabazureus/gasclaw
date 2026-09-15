// Lista fechada de tools (ADR-002): nova tool exige deploy; o frontmatter `tools:` do AGENTS só escolhe entre estas.
import type { ToolDef } from '../llm';
import { CALENDAR_TOOLS } from './calendar';
import { CONTACTS_TOOLS } from './contacts';
import { DRIVE_TOOLS } from './driveTools';
import { GMAIL_TOOLS } from './gmail';
import { TASKS_TOOLS } from './tasks';
import type { Google } from './google';
import { addEntry, RECALL_MAX, removeEntry } from './memory';

export type Approval = 'never' | 'once' | 'always';
type Prop = { type: 'string' | 'integer' | 'number' | 'boolean'; description?: string; maxLength?: number };
export type Schema = { type: 'object'; properties: Record<string, Prop>; required?: string[]; additionalProperties?: false };
/** google/timeZone/offset: ferramentas do Workspace (E6); ausentes onde o canal não as liga. offset = "-03:00" do fuso. */
export type ToolCtx = { now: () => string; ownerDm: boolean; memory: { read: () => string; write: (text: string) => void }; google?: Google; timeZone?: string; offset?: string };
export type Tool = { name: string; description: string; parameters: Schema; approval: Approval; run: (args: Record<string, unknown>, ctx: ToolCtx) => string };

const ownerOnly = (ctx: ToolCtx) => {
  if (!ctx.ownerDm) throw new Error('memória só está disponível na DM do dono');
};
const text = (description: string): Schema => ({ type: 'object', properties: { text: { type: 'string', description } }, required: ['text'], additionalProperties: false });
const none: Schema = { type: 'object', properties: {}, additionalProperties: false };

// Efeito só dentro da pasta do agente → never. Tool com efeito externo (E6) nasce com approval ≠ never.
export const TOOLS: Tool[] = [
  { name: 'now', description: 'Data, hora e dia da semana atuais no fuso do gasclaw.', parameters: none, approval: 'never', run: (_a, ctx) => ctx.now() },
  {
    name: 'memory.save',
    description: 'Salva um fato durável sobre o usuário (preferência, contexto) na memória do agente.',
    parameters: text('o fato, em uma frase curta'),
    approval: 'never',
    run: (a, ctx) => {
      ownerOnly(ctx);
      const r = addEntry(ctx.memory.read(), String(a.text));
      if (!r.ok) throw new Error(r.error);
      ctx.memory.write(r.text);
      return 'fato salvo na memória';
    },
  },
  {
    name: 'memory.remove',
    description: 'Remove da memória os fatos que contêm o trecho informado (pede aprovação do usuário).',
    parameters: text('trecho do fato a remover (mínimo 3 caracteres)'),
    approval: 'always', // apaga dados do usuário
    run: (a, ctx) => {
      ownerOnly(ctx);
      if (String(a.text).trim().length < 3) throw new Error('trecho curto demais (mínimo 3 caracteres)');
      const r = removeEntry(ctx.memory.read(), String(a.text));
      if (r.removed) ctx.memory.write(r.text);
      return `${r.removed} fato(s) removido(s)`;
    },
  },
  {
    name: 'memory.read',
    description: 'Lê a memória salva sobre o usuário.',
    parameters: none,
    approval: 'never',
    run: (_a, ctx) => {
      ownerOnly(ctx);
      return ctx.memory.read().slice(0, RECALL_MAX) || '(memória vazia)';
    },
  },
  {
    name: 'ask',
    description: 'Faz uma pergunta ao usuário e espera a resposta. Use quando faltar uma informação ou uma escolha.',
    parameters: { type: 'object', properties: { question: { type: 'string', maxLength: 500 }, options: { type: 'string', description: 'opções separadas por vírgula', maxLength: 300 } }, required: ['question'], additionalProperties: false },
    approval: 'never',
    run: () => {
      throw new Error('ask é tratado pelo motor (pendência), não executa');
    },
  },
  ...CALENDAR_TOOLS,
  ...GMAIL_TOOLS,
  ...CONTACTS_TOOLS,
  ...TASKS_TOOLS,
  ...DRIVE_TOOLS,
];

/** Grupos da allowlist: o nome antes do ponto; `drive` também cobre Docs e Sheets (arquivos do Drive). */
const GROUP_ALIASES: Record<string, string[]> = { drive: ['drive', 'docs', 'sheets'] };
export const allowedTools = (list: string[], tools = TOOLS): Tool[] =>
  tools.filter((t) => list.some((e) => t.name === e || (GROUP_ALIASES[e] ?? [e]).some((g) => t.name.startsWith(`${g}.`))));

/** O OpenRouter aceita só [a-zA-Z0-9_-] no nome da função. */
export const wireName = (name: string) => name.replace(/\./g, '_');
export const toDefs = (tools: Tool[]): ToolDef[] => tools.map((t) => ({ type: 'function', function: { name: wireName(t.name), description: t.description, parameters: t.parameters } }));
export const findTool = (tools: Tool[], name: string): Tool | undefined => tools.find((t) => t.name === name || wireName(t.name) === name);

// minimal: subconjunto de JSON Schema que as tools usam (objeto plano, tipos primitivos, required, maxLength, sem extras).
export function validateArgs(schema: Schema, raw: string): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  let args: unknown;
  try {
    args = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: 'argumentos não são JSON válido' };
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'argumentos precisam ser um objeto' };
  const obj = args as Record<string, unknown>;
  for (const k of schema.required ?? []) if (obj[k] === undefined) return { ok: false, error: `falta o argumento obrigatório "${k}"` };
  for (const [k, v] of Object.entries(obj)) {
    const p = Object.prototype.hasOwnProperty.call(schema.properties, k) ? schema.properties[k] : undefined;
    if (!p) {
      if (schema.additionalProperties === false) return { ok: false, error: `argumento desconhecido "${k}"` };
      continue;
    }
    const okType = p.type === 'integer' ? Number.isInteger(v) : typeof v === p.type;
    if (!okType) return { ok: false, error: `"${k}" precisa ser ${p.type}` };
    if (p.maxLength !== undefined && typeof v === 'string' && v.length > p.maxLength) return { ok: false, error: `"${k}" passa de ${p.maxLength} caracteres` };
  }
  return { ok: true, args: obj };
}

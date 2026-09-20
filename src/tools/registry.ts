// Lista fechada de tools (ADR-002): nova tool exige deploy; o frontmatter `tools:` do AGENTS só escolhe entre estas.
import type { ToolDef } from '../llm';
import { CALENDAR_TOOLS } from './calendar';
import { SKILL_NAME, skillBody } from '../skills';
import { CONTACTS_TOOLS } from './contacts';
import { DRIVE_TOOLS } from './driveTools';
import { GMAIL_TOOLS } from './gmail';
import { TASKS_TOOLS } from './tasks';
import type { Google } from './google';
import { addEntry, RECALL_MAX, removeEntry } from './memory';
import { SUBAGENT_NAME } from '../subagent';

export type Approval = 'never' | 'once' | 'always';
type Prop = { type: 'string' | 'integer' | 'number' | 'boolean'; description?: string; maxLength?: number };
export type Schema = { type: 'object'; properties: Record<string, Prop>; required?: string[]; additionalProperties?: false };
/** google/timeZone/offset: ferramentas do Workspace (E6); ausentes onde o canal não as liga. offset = "-03:00" do fuso. */
/** memory: MEMORY.md (read/write) + notas do dia (day/saveDay/today) + recall pronto; day/saveDay/today/recall são opcionais para contextos simples. */
export type MemoryCtx = { read: () => string; write: (text: string) => void; assertWritable?: () => void; day?: (date: string) => string; saveDay?: (date: string, text: string) => void; today?: () => string; recall?: () => string };
/** skill: corpo de uma skill sob demanda (skills/<nome>/SKILL.md); é texto, nunca executa (ADR-002). */
export type ToolCtx = { now: () => string; ownerDm: boolean; memory: MemoryCtx; google?: Google; timeZone?: string; offset?: string; isOwner?: boolean; /** Agente que originou o turno, quando ele veio por repasse (ADR-040 §A): o card precisa dizer quem pediu. */ originAgent?: string; skill?: (name: string) => string | null; /** Delega a uma PERSONA declarada em `subagents/<nome>.md` da própria pasta (ADR-039); ausente nos canais que não a montam. */ persona?: (name: string, task: string) => string; beforeEffect?: () => void };
/** ownerOnly: só o dono usa (e aprova); o motor recusa antes de qualquer card. */
export type Tool = { name: string; description: string; parameters: Schema; approval: Approval; run: (args: Record<string, unknown>, ctx: ToolCtx) => string; ownerOnly?: boolean };

const ownerOnly = (ctx: ToolCtx) => {
  if (!ctx.ownerDm) throw new Error('memória só está disponível na DM do dono');
};
const text = (description: string, maxLength = 4000): Schema => ({ type: 'object', properties: { text: { type: 'string', description, maxLength } }, required: ['text'], additionalProperties: false });
const none: Schema = { type: 'object', properties: {}, additionalProperties: false };

// Efeito só dentro da pasta do agente → never. Tool com efeito externo (E6) nasce com approval ≠ never.
export const TOOLS: Tool[] = [
  { name: 'now', description: 'Data, hora e dia da semana atuais no fuso do gasclaw.', parameters: none, approval: 'never', run: (_a, ctx) => ctx.now() },
  {
    name: 'memory.save',
    description: 'Anota um fato sobre o usuário (preferência, decisão, contexto) na memória do agente. Vira nota do dia; hoje e ontem voltam no contexto.',
    parameters: text('o fato, em uma frase curta'),
    approval: 'never',
    run: (a, ctx) => {
      ownerOnly(ctx);
      const day = ctx.memory.today?.();
      const before = day && ctx.memory.day ? ctx.memory.day(day) : ctx.memory.read();
      const r = addEntry(before, String(a.text));
      if (!r.ok) throw new Error(r.error);
      if (day && ctx.memory.saveDay) {
        ctx.beforeEffect?.();
        ctx.memory.saveDay(day, r.text);
        return `fato anotado na memória de ${day}`;
      }
      ctx.memory.assertWritable?.();
      ctx.beforeEffect?.();
      ctx.memory.write(r.text); // contexto sem notas do dia: cai na memória curada
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
      const curated = removeEntry(ctx.memory.read(), String(a.text));
      const day = ctx.memory.today?.();
      let removed = curated.removed;
      let marked = false;
      const mark = () => { if (!marked) { ctx.beforeEffect?.(); marked = true; } };
      if (curated.removed) { ctx.memory.assertWritable?.(); mark(); ctx.memory.write(curated.text); }
      if (day && ctx.memory.day && ctx.memory.saveDay) {
        const note = removeEntry(ctx.memory.day(day), String(a.text));
        if (note.removed) { mark(); ctx.memory.saveDay(day, note.text); }
        removed += note.removed;
      }
      return `${removed} fato(s) removido(s)`;
    },
  },
  {
    name: 'memory.read',
    description: 'Lê a memória salva sobre o usuário: a curada (MEMORY.md) e as notas de hoje e de ontem.',
    parameters: none,
    approval: 'never',
    run: (_a, ctx) => {
      ownerOnly(ctx);
      return (ctx.memory.recall?.() ?? ctx.memory.read()).slice(0, RECALL_MAX) || '(memória vazia)';
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
  // Workspace (E6): conta do dono → só o dono (revisão de segurança, blocker 2).
  {
    name: 'read_skill',
    description: 'Lê o passo a passo de uma skill do agente pelo nome (as disponíveis estão listadas no prompt). O conteúdo é instrução do dono, nunca código a executar.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'nome da skill', maxLength: 40 } }, required: ['name'], additionalProperties: false },
    approval: 'never',
    run: (a, ctx) => {
      const name = String(a.name ?? '').trim().toLowerCase();
      if (!SKILL_NAME.test(name)) throw new Error('nome de skill inválido');
      if (!ctx.skill) throw new Error('skills indisponíveis neste canal');
      const md = ctx.skill(name);
      if (md === null) throw new Error(`não existe a skill "${name}"`);
      return skillBody(name, md);
    },
  },
  {
    name: 'persona',
    description: 'Delegates part of the task to a persona declared in subagents/<name>.md in this folder (e.g. reviewer, writer). It answers with text and decides nothing on its own.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'the file name under subagents/, without the extension', maxLength: 40 },
        task: { type: 'string', description: 'what it should do, in one or two sentences', maxLength: 2000 },
      },
      required: ['name', 'task'],
      additionalProperties: false,
    },
    // `never` de propósito: DELEGAR não produz efeito externo por si. Cada ferramenta que a persona
    // usar passa pelo próprio crivo, e ela só recebe as que não pedem aprovação (ver `main.ts`). Um
    // card para "vou pensar com outro papel" treinaria o dono a clicar sem ler — que é como uma
    // aprovação deixa de proteger.
    approval: 'never',
    run: (a, ctx) => {
      const name = String(a.name ?? '').trim().toLowerCase();
      if (!SUBAGENT_NAME.test(name)) throw new Error('invalid persona name');
      const task = String(a.task ?? '').trim();
      if (!task) throw new Error('say what the persona should do');
      if (!ctx.persona) throw new Error('personas are not available on this channel');
      return ctx.persona(name, task);
    },
  },
  ...[...CALENDAR_TOOLS, ...GMAIL_TOOLS, ...CONTACTS_TOOLS, ...TASKS_TOOLS, ...DRIVE_TOOLS].map((t) => ({ ...t, ownerOnly: true })),
];

/** Grupos da allowlist: o nome antes do ponto; `drive` também cobre Docs e Sheets (arquivos do Drive). */
const GROUP_ALIASES: Record<string, string[]> = { drive: ['drive', 'docs', 'sheets'] };
export const allowedTools = (list: string[], tools = TOOLS): Tool[] =>
  tools.filter((t) => list.some((e) => t.name === e || (GROUP_ALIASES[e] ?? [e]).some((g) => t.name.startsWith(`${g}.`))));

/** Prefixo → grupo da allowlist (o inverso de GROUP_ALIASES): `docs.read` é do grupo `drive`, não do grupo `docs`. */
const GROUP_OF: Record<string, string> = Object.fromEntries(Object.entries(GROUP_ALIASES).flatMap(([g, prefixes]) => prefixes.map((p) => [p, g])));

/** Grupo de uma tool, como a allowlist agrupa; '' para as que não têm ponto (`now`, `ask`, `read_skill`). */
export const toolGroup = (name: string): string => {
  const prefix = name.split('.')[0];
  return name.includes('.') ? (GROUP_OF[prefix] ?? prefix) : '';
};

/** O que o painel desenha no liga/desliga por ferramenta. Vem do registry: a tela não pode listar o que o motor não conhece. */
export type ToolInfo = { name: string; group: string; description: string; approval: Approval; ownerOnly: boolean };
export const toolCatalog = (tools = TOOLS): ToolInfo[] =>
  tools.map((t) => ({ name: t.name, group: toolGroup(t.name), description: t.description, approval: t.approval, ownerOnly: t.ownerOnly === true }));

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

import { exportProject, fetchTexts, listFolder } from './drive';
import { TEMPLATES } from './templates';
import { allowedTools } from './tools/registry';

/** Acesso de um agente: e-mails além do dono e entradas da allowlist de tools ('now', 'memory' = memory.*, 'ask'). */
export type Access = { users: string[]; tools: string[] };
/** users/tools lidos da pasta, do editor ou da planilha config são SÓ sugestão (ADR-021). */
export type AgentConfig = { model: string; steps?: number; suggested: Access };
/** access = acesso EFETIVO: nasce fechado (só o dono, zero tools) até withAccess com o que o dono aprovou no painel. */
export type AgentSpec = { folderId: string; name: string; config: AgentConfig; system: string; access: Access };

export const ROLES = ['AGENTS', 'SOUL', 'IDENTITY', 'USER'] as const;
export type Role = (typeof ROLES)[number];
export const FILES = ROLES.map((r) => `${r}.md`);
export const DEFAULT_MODEL = 'openrouter/auto';
export const DOC_MIME = 'application/vnd.google-apps.document';
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const MAX_FILE = 20_000;
const MAX_TOTAL = 60_000;

/** Arquivo HTML do projeto Apps Script `agents/<nome>/<PAPEL>.md` (no editor: `<PAPEL>.md.html`), com markdown puro. */
export const EDITOR_MIME = 'application/x-gasclaw-editor';

/** Um arquivo da pasta do agente, como a listagem do Drive devolve (ou um arquivo do editor, com EDITOR_MIME). */
export type FileEntry = { id: string; name: string; mime: string; modified: number };
export type Source = { entry: FileEntry; kind: 'editor' | 'doc' | 'md' | 'sheet' };
/** Arquivo do projeto como o export `application/vnd.google-apps.script+json` devolve (conteúdo do HEAD). */
export type ProjectFile = { name: string; type: string; source: string };

/**
 * Prefixo dos papéis no editor. `agentes/` é o nome ANTIGO e continua sendo lido: já existe agente autorado
 * assim em produção, e trocar o padrão não pode apagar da tela um agente que está lá. O que muda é o que se
 * ESCREVE — agente novo nasce em `agents/`.
 */
const ROLE_FILE = /^(?:agents|agentes)\/([a-z0-9][a-z0-9-]{0,39})\/(AGENTS|SOUL|IDENTITY|USER)\.md$/;
export const validAgentName = (name: string): boolean => /^[a-z0-9][a-z0-9-]{0,39}$/.test(name);
export const agentFolderPath = (name: string): string[] => ['gasclaw', 'agents', name];

export function parseProjectExport(json: string): ProjectFile[] {
  return ((JSON.parse(json).files ?? []) as ProjectFile[]).map(({ name, type, source }) => ({ name, type, source }));
}

const roleFile = (f: ProjectFile) => (f.type === 'html' ? f.name.match(ROLE_FILE) : null);

/** Agentes que têm ao menos um papel no editor, pelo prefixo `agents/<nome>/` (ou o antigo `agentes/`). */
export function editorAgents(files: ProjectFile[]): string[] {
  return [...new Set(files.flatMap((f) => roleFile(f)?.[1] ?? []))].sort();
}

/** Papéis do agente no editor como FileEntry (id = nome do arquivo no projeto). */
export function editorEntries(files: ProjectFile[], agent: string, modified: number): FileEntry[] {
  return files.flatMap((f) => {
    const m = roleFile(f);
    return m && m[1] === agent ? [{ id: f.name, name: `${m[2]}.md`, mime: EDITOR_MIME, modified }] : [];
  });
}
export type Sources = Partial<Record<Role | 'config', Source>>;

export function extractFolderId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/folders\/([\w-]{10,})/) ?? s.match(/^([\w-]{10,})$/);
  return m ? m[1] : null;
}

// minimal: subconjunto de YAML plano (chave: valor | chave: [a, b]); chaves aninhadas entram quando F2 precisar.
export function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; body: string } {
  const md = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n'); // BOM e CRLF (Windows) não podem apagar tools/users
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: md };
  const data: Record<string, string | string[]> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].replace(/\s+#.*$/, '').trim();
    data[kv[1]] = v.startsWith('[') ? v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean) : v;
  }
  return { data, body: md.slice(m[0].length) };
}

/** Por papel (ADR-013): editor do Apps Script > Google Doc com o nome (com ou sem ".md") > arquivo <PAPEL>.md > ausente. Planilha "config" = config. */
export function resolveRoles(entries: FileEntry[]): Sources {
  const out: Sources = {};
  const isGoogle = (e: FileEntry) => e.mime.startsWith('application/vnd.google-apps.');
  for (const r of ROLES) {
    const editor = entries.find((e) => e.mime === EDITOR_MIME && e.name === `${r}.md`);
    const doc = entries.find((e) => e.mime === DOC_MIME && (e.name === r || e.name === `${r}.md`));
    const md = entries.find((e) => !isGoogle(e) && e.mime !== EDITOR_MIME && e.name === `${r}.md`);
    if (editor) out[r] = { entry: editor, kind: 'editor' };
    else if (doc) out[r] = { entry: doc, kind: 'doc' };
    else if (md) out[r] = { entry: md, kind: 'md' };
  }
  const config = entries.find((e) => e.mime === SHEET_MIME && e.name === 'config');
  if (config) out.config = { entry: config, kind: 'sheet' };
  return out;
}

/** Assinatura das fontes resolvidas: muda quando algum papel muda de arquivo, de origem ou de data. */
export function signature(folderId: string, sources: Sources): string {
  const keys = [...ROLES, 'config'] as const;
  return [folderId, ...keys.map((k) => (sources[k] ? `${k}:${sources[k].kind}:${sources[k].entry.id}@${sources[k].entry.modified}` : `${k}:-`))].join('|');
}

/**
 * Teto de passos do turno, venha da pasta ou da tela: inteiro de 1 a 50; qualquer outra coisa é `null`.
 *
 * O teto existe porque cada passo é uma chamada paga ao modelo: sem limite, um agente em laço queima o
 * orçamento do run. 50 é o máximo que ainda cabe no tempo de execução do Apps Script.
 */
export const parseSteps = (raw: string | number | null | undefined): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
};

/** Linhas `chave | valor` da planilha config sobrepõem o frontmatter (model, users, tools, steps). */
export function mergeConfig(frontmatter: Record<string, string | string[]>, rows: string[][] = []): AgentConfig {
  const data = { ...frontmatter };
  for (const [k = '', v = ''] of rows) {
    const key = k.trim();
    const val = v.trim();
    if (!val) continue;
    if (key === 'model') data.model = val;
    if (key === 'users') data.users = val.split(/[\s,;]+/).filter(Boolean);
    if (key === 'tools') data.tools = val.split(',').map((t) => t.trim()).filter(Boolean);
    if (key === 'steps') data.steps = val;
  }
  const model = typeof data.model === 'string' && data.model ? data.model : DEFAULT_MODEL;
  const users = Array.isArray(data.users) ? data.users.map((u) => u.toLowerCase()) : [];
  const tools = Array.isArray(data.tools) ? data.tools : []; // padrão seguro: agente sem tools
  const steps = parseSteps(data.steps as string | undefined);
  return { model, suggested: { users, tools }, ...(steps === null ? {} : { steps }) };
}

/**
 * Reparte o orçamento entre os papéis presentes sem deixar um papel guloso zerar o seguinte (max-min fair).
 *
 * Quem pede menos que a cota leva tudo que pediu; a sobra é redividida entre os que ainda querem mais. A
 * divisão anterior era gulosa e em ORDEM: 20 KB por arquivo × 4 papéis não cabem nos 60 KB do total, então
 * três arquivos cheios zeravam o quarto — e o quarto é o USER.md. Como a pasta é compartilhável (ADR-021),
 * bastava alguém encher o AGENTS.md para apagar do prompt quem é o usuário, sem tocar no arquivo dele.
 */
function fairShare(wants: number[], total: number): number[] {
  const alloc = wants.map(() => 0);
  let pendentes = wants.map((w, i) => ({ i, w })).filter((x) => x.w > 0);
  let restante = total;
  while (pendentes.length > 0) {
    const cota = Math.floor(restante / pendentes.length);
    const cabem = pendentes.filter((x) => x.w <= cota);
    if (cabem.length === 0) {
      pendentes.forEach((x) => (alloc[x.i] = cota));
      break;
    }
    cabem.forEach((x) => {
      alloc[x.i] = x.w;
      restante -= x.w;
    });
    pendentes = pendentes.filter((x) => x.w > cota);
  }
  return alloc;
}

export function buildSpec(folderId: string, name: string, texts: Partial<Record<Role, string>>, configRows?: string[][]): AgentSpec {
  const { data, body } = parseFrontmatter(texts.AGENTS ?? '');
  const textos = ROLES.map((r) => (r === 'AGENTS' ? (texts.AGENTS === undefined ? undefined : body) : texts[r]));
  const cotas = fairShare(textos.map((t) => (t === undefined ? 0 : Math.min(t.length, MAX_FILE))), MAX_TOTAL);
  const parts = ROLES.map((r, k) => {
    const text = textos[k];
    if (text === undefined) return `## ${r}.md\n(missing)`;
    const cut = text.slice(0, cotas[k]);
    // Cortar em silêncio era metade do defeito: nem o modelo nem o dono sabiam que faltava pedaço.
    return `## ${r}.md\n${cut}${cut.length < text.length ? '\n(cortado: o arquivo não cabe no orçamento do prompt)' : ''}`;
  });
  return { folderId, name, config: mergeConfig(data, configRows), system: parts.join('\n\n'), access: effectiveAccess(null) };
}

const uniq = (xs: string[]) => [...new Set(xs)];

/** Efetivo = só o que o dono aprovou: users minúsculos sem duplicata; tools que existem no registry (nome ou grupo). Sem aprovação: fechado. */
export function effectiveAccess(approved: Access | null | undefined): Access {
  if (!approved) return { users: [], tools: [] };
  return {
    users: uniq(approved.users.map((u) => u.trim().toLowerCase()).filter(Boolean)),
    tools: uniq(approved.tools.filter((t) => allowedTools([t]).length > 0)),
  };
}

/** Nomes das ferramentas efetivamente LIGADAS, pelo mesmo `allowedTools` que monta o toolkit do turno (grupo já expandido). */
export const enabledTools = (approved: Access | null | undefined): string[] => allowedTools(effectiveAccess(approved).tools).map((t) => t.name);

/**
 * Liga/desliga UMA ferramenta no aprovado (ADR-021: o painel decide, a pasta só sugere).
 *
 * O formato gravado não muda; o conteúdo passa a listar nomes individuais, porque um grupo (`gmail`) não sabe
 * dizer "gmail.read sim, gmail.send não". Um aprovado que ainda guarda o grupo é expandido no primeiro toque.
 * Fail closed: nome fora do registry — ou um grupo, que não é ferramenta — é recusado, nunca gravado.
 */
export function withTool(approved: Access | null | undefined, tool: string, on: boolean): Access {
  if (!allowedTools([tool]).some((t) => t.name === tool)) throw new Error(`unknown tool: ${tool}`);
  const a = effectiveAccess(approved);
  const names = new Set(enabledTools(a));
  if (on) names.add(tool);
  else names.delete(tool);
  return { users: a.users, tools: allowedTools([...names]).map((t) => t.name) }; // ordem canônica do registry, não a dos cliques
}

/** Um endereço só: sem espaço, com `@` e um domínio com ponto. Não valida se existe — só recusa o que nunca poderia ser um e-mail. */
const EMAIL = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

/**
 * Libera/revoga UMA pessoa no aprovado, sem tocar nas ferramentas (ADR-021: o painel decide, a pasta só sugere).
 *
 * Existe pelo mesmo motivo do `withTool`: antes, tirar uma pessoa só era possível removendo o acesso inteiro,
 * o que desligava junto todas as ferramentas do agente.
 *
 * Fail closed: o que não parece um e-mail é recusado ANTES de gravar — a lista de quem conversa com o agente
 * não pode virar depósito de lixo digitado na tela.
 */
export function withUser(approved: Access | null | undefined, email: string, on: boolean): Access {
  const e = String(email).trim().toLowerCase();
  if (!EMAIL.test(e)) throw new Error(`invalid e-mail: ${email}`);
  const a = effectiveAccess(approved);
  const users = new Set(a.users);
  if (on) users.add(e);
  else users.delete(e);
  return { users: [...users].sort(), tools: a.tools }; // ordem alfabética, não a ordem dos cliques
}

/** Recalcula o acesso efetivo do agente a partir do aprovado (ACCESS:<folderId>, lido pela borda). */
export const withAccess = <T extends AgentSpec>(spec: T, approved: Access | null | undefined): T => ({ ...spec, access: effectiveAccess(approved) });

/** Valor de ACCESS:<folderId> (JSON). Ausente, inválido ou com tipo errado → null (fail closed). */
export function parseAccess(raw: string | null | undefined): Access | null {
  if (!raw) return null;
  const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');
  try {
    const o = JSON.parse(raw) as { users?: unknown; tools?: unknown } | null;
    return o && strings(o.users) && strings(o.tools) ? effectiveAccess({ users: o.users, tools: o.tools }) : null;
  } catch {
    return null;
  }
}

/** O que a pasta sugere e ainda não foi aprovado (lista "sugerido pela pasta" do painel). */
export function pendingSuggestions(suggested: Access, approved: Access | null | undefined): Access {
  const a = effectiveAccess(approved);
  // Compara pelo EXPANDIDO: depois do liga/desliga por ferramenta, o aprovado guarda nomes individuais, e um
  // grupo sugerido ('gmail') só continua pendente se alguma ferramenta dele estiver desligada.
  const on = new Set(enabledTools(a));
  return {
    users: suggested.users.filter((u) => !a.users.includes(u)),
    tools: suggested.tools.filter((t) => allowedTools([t]).some((x) => !on.has(x.name))),
  };
}

/** Dono sempre pode; os outros só se estiverem no acesso efetivo. */
export function canUse(access: Access, email: string, owner: string): boolean {
  const e = email.toLowerCase();
  return e === owner.toLowerCase() || access.users.includes(e);
}

export type Origin = Source['kind'] | 'missing';
export type LoadedAgent = AgentSpec & { origem: Record<Role, Origin>; editorError?: string; cached?: boolean };

/** Fontes que precisam ser baixadas do Drive (os papéis do editor já vêm no export do projeto). */
export function driveSources(sources: Sources): Sources {
  return Object.fromEntries(Object.entries(sources).filter(([, s]) => s && s.kind !== 'editor')) as Sources;
}

/** Texto de cada papel a partir da fonte vencedora: editor (texto bruto do export) ou o que veio do Drive. */
export function roleTexts(sources: Sources, files: ProjectFile[], drive: Partial<Record<Role | 'config', string>>): Partial<Record<Role, string>> {
  const out: Partial<Record<Role, string>> = {};
  for (const r of ROLES) {
    const s = sources[r];
    if (!s) continue;
    const text = s.kind === 'editor' ? files.find((f) => f.name === s.entry.id)?.source : drive[r];
    if (text !== undefined) out[r] = text;
  }
  return out;
}

export function assembleAgent(folderId: string, name: string, sources: Sources, texts: Partial<Record<Role, string>>, configRows?: string[][]): LoadedAgent {
  const origem = Object.fromEntries(ROLES.map((r) => [r, sources[r]?.kind ?? 'missing'])) as Record<Role, Origin>;
  return { ...buildSpec(folderId, name, texts, configRows), origem };
}

const AGENT_TTL = 30; // ADR-012/013: edição no Drive ou no editor aparece em até 30 s

/**
 * Agente de produção (ADR-013): por papel, editor do Apps Script (`agents/<nome da pasta>/<PAPEL>.md`, lido pelo
 * export do HEAD, nunca por getContent) > Google Doc > `.md`. Se o export falhar, segue só com o Drive e devolve
 * `editorError` (sem cache, para tentar de novo). Sem escopo novo.
 */
export function loadAgent(folderId: string, opts: { scriptId?: string; noCache?: boolean } = {}): LoadedAgent {
  const cache = CacheService.getScriptCache();
  const key = `agent:${folderId}`;
  if (!opts.noCache) {
    const hit = cache.get(key);
    if (hit) return { ...(JSON.parse(hit) as LoadedAgent), cached: true };
  }
  const name = DriveApp.getFolderById(folderId).getName();
  let files: ProjectFile[] = [];
  let editorError: string | undefined;
  try {
    files = exportProject(opts.scriptId);
  } catch (err) {
    editorError = String((err as Error).message ?? err).slice(0, 200);
    console.warn(`loadAgent: editor indisponível, seguindo com o Drive: ${editorError}`);
  }
  const sources = resolveRoles([...editorEntries(files, name, 0), ...listFolder(folderId)]);
  const drive = fetchTexts(driveSources(sources));
  const rows = drive.config ? Utilities.parseCsv(drive.config) : undefined;
  const agent: LoadedAgent = { ...assembleAgent(folderId, name, sources, roleTexts(sources, files, drive), rows), ...(editorError ? { editorError } : {}) };
  const raw = JSON.stringify(agent);
  if (!opts.noCache && !editorError && raw.length < 95_000) cache.put(key, raw, AGENT_TTL);
  return agent;
}

/** Garante a cadeia de pastas a partir de "Meu Drive", reutilizando a primeira com o mesmo nome (nunca duplica). */
export function ensureFolderPath(path: string[]): GoogleAppsScript.Drive.Folder {
  return path.reduce((dir, name) => {
    const it = dir.getFoldersByName(name);
    return it.hasNext() ? it.next() : dir.createFolder(name);
  }, DriveApp.getRootFolder());
}

/** Cria apenas os arquivos que faltam; nunca sobrescreve. Retorna os nomes criados. */
export function seedAgent(folderId: string, ownerEmail: string): string[] {
  const folder = DriveApp.getFolderById(folderId);
  const created: string[] = [];
  for (const f of FILES) {
    if (folder.getFilesByName(f).hasNext()) continue;
    folder.createFile(f, TEMPLATES[f].replace('{{OWNER}}', ownerEmail), 'text/markdown');
    created.push(f);
  }
  return created;
}

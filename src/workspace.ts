import { exportProject, fetchTexts, listFolder } from './drive';
import { TEMPLATES } from './templates';

export type AgentConfig = { model: string; users: string[]; tools: string[]; steps?: number };
export type AgentSpec = { folderId: string; name: string; config: AgentConfig; system: string };

export const ROLES = ['AGENTS', 'SOUL', 'IDENTITY', 'USER'] as const;
export type Role = (typeof ROLES)[number];
export const FILES = ROLES.map((r) => `${r}.md`);
export const DEFAULT_MODEL = 'openrouter/auto';
export const DOC_MIME = 'application/vnd.google-apps.document';
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const MAX_FILE = 20_000;
const MAX_TOTAL = 60_000;

/** Arquivo HTML do projeto Apps Script `agentes/<nome>/<PAPEL>.md` (no editor: `<PAPEL>.md.html`), com markdown puro. */
export const EDITOR_MIME = 'application/x-gasclaw-editor';

/** Um arquivo da pasta do agente, como a listagem do Drive devolve (ou um arquivo do editor, com EDITOR_MIME). */
export type FileEntry = { id: string; name: string; mime: string; modified: number };
export type Source = { entry: FileEntry; kind: 'editor' | 'doc' | 'md' | 'sheet' };
/** Arquivo do projeto como o export `application/vnd.google-apps.script+json` devolve (conteúdo do HEAD). */
export type ProjectFile = { name: string; type: string; source: string };

const ROLE_FILE = /^agentes\/([a-z0-9][a-z0-9-]{0,39})\/(AGENTS|SOUL|IDENTITY|USER)\.md$/;
export const validAgentName = (name: string): boolean => /^[a-z0-9][a-z0-9-]{0,39}$/.test(name);
export const agentFolderPath = (name: string): string[] => ['gasclaw', 'agentes', name];

export function parseProjectExport(json: string): ProjectFile[] {
  return ((JSON.parse(json).files ?? []) as ProjectFile[]).map(({ name, type, source }) => ({ name, type, source }));
}

const roleFile = (f: ProjectFile) => (f.type === 'html' ? f.name.match(ROLE_FILE) : null);

/** Agentes que têm ao menos um papel no editor, pelo prefixo `agentes/<nome>/`. */
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
export function parseFrontmatter(md: string): { data: Record<string, string | string[]>; body: string } {
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
  const n = Number(data.steps);
  const steps = Number.isInteger(n) && n >= 1 && n <= 50 ? n : undefined;
  return { model, users, tools, ...(steps === undefined ? {} : { steps }) };
}

export function buildSpec(folderId: string, name: string, texts: Partial<Record<Role, string>>, configRows?: string[][]): AgentSpec {
  const { data, body } = parseFrontmatter(texts.AGENTS ?? '');
  let total = 0;
  const parts = ROLES.map((r) => {
    const text = r === 'AGENTS' ? (texts.AGENTS === undefined ? undefined : body) : texts[r];
    if (text === undefined) return `## ${r}.md\n(missing)`;
    const cut = text.slice(0, Math.max(0, Math.min(MAX_FILE, MAX_TOTAL - total)));
    total += cut.length;
    return `## ${r}.md\n${cut}`;
  });
  return { folderId, name, config: mergeConfig(data, configRows), system: parts.join('\n\n') };
}

export function canUse(config: AgentConfig, email: string, owner: string): boolean {
  const e = email.toLowerCase();
  return e === owner.toLowerCase() || config.users.includes(e);
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
 * Agente de produção (ADR-013): por papel, editor do Apps Script (`agentes/<nome da pasta>/<PAPEL>.md`, lido pelo
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

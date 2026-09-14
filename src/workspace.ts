import { TEMPLATES } from './templates';

export type AgentConfig = { model: string; users: string[] };
export type AgentSpec = { folderId: string; name: string; config: AgentConfig; system: string };

export const ROLES = ['AGENTS', 'SOUL', 'IDENTITY', 'USER'] as const;
export type Role = (typeof ROLES)[number];
export const FILES = ROLES.map((r) => `${r}.md`);
export const DEFAULT_MODEL = 'openrouter/auto';
export const DOC_MIME = 'application/vnd.google-apps.document';
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const MAX_FILE = 20_000;
const MAX_TOTAL = 60_000;

/** Um arquivo da pasta do agente, como a listagem do Drive devolve. */
export type FileEntry = { id: string; name: string; mime: string; modified: number };
export type Source = { entry: FileEntry; kind: 'doc' | 'md' | 'sheet' };
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

/** Por papel: Google Doc com o nome (com ou sem ".md") > arquivo <PAPEL>.md > ausente. Planilha "config" = config. */
export function resolveRoles(entries: FileEntry[]): Sources {
  const out: Sources = {};
  const isGoogle = (e: FileEntry) => e.mime.startsWith('application/vnd.google-apps.');
  for (const r of ROLES) {
    const doc = entries.find((e) => e.mime === DOC_MIME && (e.name === r || e.name === `${r}.md`));
    const md = entries.find((e) => !isGoogle(e) && e.name === `${r}.md`);
    if (doc) out[r] = { entry: doc, kind: 'doc' };
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

/** Linhas `chave | valor` da planilha config sobrepõem o frontmatter (só model e users). */
export function mergeConfig(frontmatter: Record<string, string | string[]>, rows: string[][] = []): AgentConfig {
  const data = { ...frontmatter };
  for (const [k = '', v = ''] of rows) {
    const key = k.trim();
    const val = v.trim();
    if (!val) continue;
    if (key === 'model') data.model = val;
    if (key === 'users') data.users = val.split(/[\s,;]+/).filter(Boolean);
  }
  const model = typeof data.model === 'string' && data.model ? data.model : DEFAULT_MODEL;
  const users = Array.isArray(data.users) ? data.users.map((u) => u.toLowerCase()) : [];
  return { model, users };
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

// minimal: produção segue lendo só .md; a leitura híbrida (Doc/Sheets) entra após a POC P6 + ADR-012.
export function loadAgent(folderId: string): AgentSpec {
  const folder = DriveApp.getFolderById(folderId);
  const texts: Partial<Record<Role, string>> = {};
  for (const r of ROLES) {
    const it = folder.getFilesByName(`${r}.md`);
    if (it.hasNext()) texts[r] = it.next().getBlob().getDataAsString();
  }
  return buildSpec(folderId, folder.getName(), texts);
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

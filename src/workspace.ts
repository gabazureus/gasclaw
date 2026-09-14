import { TEMPLATES } from './templates';

export type AgentConfig = { model: string; users: string[] };
export type AgentSpec = { folderId: string; name: string; config: AgentConfig; system: string };

export const FILES = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md'] as const;
export const DEFAULT_MODEL = 'openrouter/auto';
const MAX_FILE = 20_000;
const MAX_TOTAL = 60_000;

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

export function buildSpec(folderId: string, name: string, files: Partial<Record<string, string>>): AgentSpec {
  const { data, body } = parseFrontmatter(files['AGENTS.md'] ?? '');
  let total = 0;
  const parts = FILES.map((f) => {
    const text = f === 'AGENTS.md' ? (files[f] === undefined ? undefined : body) : files[f];
    if (text === undefined) return `## ${f}\n(missing)`;
    const cut = text.slice(0, Math.max(0, Math.min(MAX_FILE, MAX_TOTAL - total)));
    total += cut.length;
    return `## ${f}\n${cut}`;
  });
  const model = typeof data.model === 'string' && data.model ? data.model : DEFAULT_MODEL;
  const users = Array.isArray(data.users) ? data.users.map((u) => u.toLowerCase()) : [];
  return { folderId, name, config: { model, users }, system: parts.join('\n\n') };
}

export function canUse(config: AgentConfig, email: string, owner: string): boolean {
  const e = email.toLowerCase();
  return e === owner.toLowerCase() || config.users.includes(e);
}

export function loadAgent(folderId: string): AgentSpec {
  const folder = DriveApp.getFolderById(folderId);
  const files: Record<string, string> = {};
  for (const f of FILES) {
    const it = folder.getFilesByName(f);
    if (it.hasNext()) files[f] = it.next().getBlob().getDataAsString();
  }
  return buildSpec(folderId, folder.getName(), files);
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

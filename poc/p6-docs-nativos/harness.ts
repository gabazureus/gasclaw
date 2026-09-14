// POC P6 (descartável): mede a leitura de agentes em Google Docs/Sheets nativos. Sai do código após o ADR-012.
// Export e listagem pela Drive API v3 via UrlFetch com o token do script: o escopo `drive` do manifesto já cobre
// (files.export aceita drive/drive.readonly/drive.file); nada de SpreadsheetApp/DocumentApp, que pediriam escopos novos.
import { buildSpec, resolveRoles, ROLES, signature, type AgentSpec, type FileEntry, type Role, type Source, type Sources } from '../../src/workspace';

const API = 'https://www.googleapis.com/drive/v3/files';
const RUNS = 5;
const C1_MS = 3000;
const C2_MS = 200;

/** Puro — C4: estrutura mínima que o export precisa preservar. */
export function checkMarkdown(md: string) {
  const r = {
    h1: /^# \S/m.test(md),
    h2: /^## \S/m.test(md),
    h3: /^### \S/m.test(md),
    bullets: /^[*+-] \S/m.test(md),
    nested: /^[ \t]{2,}[*+-] \S/m.test(md),
    numbered: /^\s*1\. \S/m.test(md),
    bold: /\*\*\S[^*]*\*\*/.test(md),
  };
  return { ...r, pass: r.h1 && r.h2 && r.h3 && r.bullets && r.nested && r.numbered };
}

const auth = () => ({ Authorization: `Bearer ${ScriptApp.getOAuthToken()}` });
const max = (xs: number[]) => Math.max(...xs);

function timed<T>(fn: () => T): { ms: number; value: T } {
  const t0 = Date.now();
  const value = fn();
  return { ms: Date.now() - t0, value };
}

/** V1: listagem pelo DriveApp. */
function listV1(folderId: string): FileEntry[] {
  const out: FileEntry[] = [];
  const it = DriveApp.getFolderById(folderId).getFiles();
  while (it.hasNext()) {
    const f = it.next();
    out.push({ id: f.getId(), name: f.getName(), mime: f.getMimeType(), modified: f.getLastUpdated().getTime() });
  }
  return out;
}

/** V2: uma chamada files.list da Drive API v3. */
function listV2(folderId: string): FileEntry[] {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`); // folderId já validado por extractFolderId
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime)');
  const res = UrlFetchApp.fetch(`${API}?q=${q}&fields=${fields}&pageSize=1000`, { headers: auth(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`Drive files.list ${res.getResponseCode()}: ${res.getContentText().slice(0, 200)}`);
  const files: { id: string; name: string; mimeType: string; modifiedTime: string }[] = JSON.parse(res.getContentText()).files ?? [];
  return files.map((f) => ({ id: f.id, name: f.name, mime: f.mimeType, modified: Date.parse(f.modifiedTime) }));
}

function urlFor(s: Source): string {
  if (s.kind === 'md') return `${API}/${s.entry.id}?alt=media`;
  return `${API}/${s.entry.id}/export?mimeType=${encodeURIComponent(s.kind === 'doc' ? 'text/markdown' : 'text/csv')}`;
}

/** Lê todas as fontes em paralelo (fetchAll) e monta o AgentSpec. */
function read(folderId: string, name: string, sources: Sources): { spec: AgentSpec; texts: Partial<Record<Role, string>> } {
  const keys = Object.keys(sources) as (Role | 'config')[];
  const headers = auth();
  const res = UrlFetchApp.fetchAll(keys.map((k) => ({ url: urlFor(sources[k]!), headers, muteHttpExceptions: true })));
  const texts: Partial<Record<Role, string>> = {};
  let rows: string[][] | undefined;
  res.forEach((r, i) => {
    const k = keys[i];
    if (r.getResponseCode() !== 200) throw new Error(`Drive ${k} ${r.getResponseCode()}: ${r.getContentText().slice(0, 200)}`);
    const body = r.getContentText('UTF-8');
    if (k === 'config') rows = Utilities.parseCsv(body);
    else texts[k] = body;
  });
  return { spec: buildSpec(folderId, name, texts, rows), texts };
}

function tryPut(cache: GoogleAppsScript.Cache.Cache, key: string, value: string, seconds: number): string | null {
  try {
    cache.put(key, value, seconds);
    return null;
  } catch (err) {
    return (err as Error).message; // ex.: valor acima de 100 KB
  }
}

export function runP6(folderId: string) {
  const cache = CacheService.getScriptCache();
  const name = DriveApp.getFolderById(folderId).getName();
  const lastKey = `p6:last:${folderId}`;
  const previous = cache.get(lastKey);

  // C1 — sem cache: listar (V2) + resolver papéis + exportar/baixar em paralelo + montar o prompt.
  const cold: number[] = [];
  let run!: { sources: Sources; spec: AgentSpec; texts: Partial<Record<Role, string>> };
  for (let i = 0; i < RUNS; i++) {
    const t = timed(() => {
      const sources = resolveRoles(listV2(folderId));
      return { sources, ...read(folderId, name, sources) };
    });
    cold.push(t.ms);
    run = t.value;
  }
  const sig = signature(folderId, run.sources);
  const entry = JSON.stringify({ sig, spec: run.spec });

  // C3 — comparação com o clique anterior (rode de novo depois de editar um Doc).
  let c3: { previous: 'hit' | 'miss'; textChanged: boolean; invalidated: boolean; pass: boolean } | { previous: 'none'; hint: string };
  if (previous) {
    const p = JSON.parse(previous) as { sig: string; spec: AgentSpec };
    const hit = p.sig === sig;
    const textChanged = p.spec.system !== run.spec.system;
    c3 = { previous: hit ? 'hit' : 'miss', textChanged, invalidated: !hit && textChanged, pass: !(hit && textChanged) };
  } else {
    c3 = { previous: 'none', hint: 'edite um Doc e rode de novo para medir a invalidação' };
  }

  // C2 — com cache: listar pela variante + assinatura + cache.get; acerto só se a assinatura bater.
  const cacheError = tryPut(cache, lastKey, entry, 21_600);
  const variants = { V1: listV1, V2: listV2 };
  const warm: Record<string, { maxMs: number; runsMs: number[]; hits: number; pass: boolean }> = {};
  for (const [v, list] of Object.entries(variants)) {
    const key = `p6:${v}:${folderId}`;
    tryPut(cache, key, entry, 600);
    const runsMs: number[] = [];
    let hits = 0;
    for (let i = 0; i < RUNS; i++) {
      const t = timed(() => {
        const s = signature(folderId, resolveRoles(list(folderId)));
        const raw = cache.get(key);
        return raw !== null && (JSON.parse(raw) as { sig: string }).sig === s;
      });
      runsMs.push(t.ms);
      if (t.value) hits++;
    }
    warm[v] = { maxMs: max(runsMs), runsMs, hits, pass: hits === RUNS && max(runsMs) < C2_MS };
  }
  const ttl = Array.from({ length: RUNS }, () => timed(() => JSON.parse(cache.get(lastKey) ?? 'null')).ms);
  const winner = Object.entries(warm).filter(([, w]) => w.pass).sort((a, b) => a[1].maxMs - b[1].maxMs)[0];
  const decision = winner ? winner[0] : 'TTL30';

  const origem = Object.fromEntries(ROLES.map((r) => [r, run.sources[r]?.kind ?? 'missing']));
  const kinds = Object.values(origem);
  const soul = run.sources.SOUL?.kind === 'doc' ? run.texts.SOUL ?? '' : null;
  const result = {
    poc: 'P6',
    folder: name,
    runs: RUNS,
    c1: { pass: max(cold) < C1_MS, maxMs: max(cold), runsMs: cold },
    c2: { pass: decision !== 'TTL30', decision, V1: warm.V1, V2: warm.V2, ttl30MaxMs: max(ttl), cacheError },
    c3,
    c4: soul === null ? { skipped: 'SOUL não é Google Doc nesta pasta' } : checkMarkdown(soul),
    c5: { origem, mixed: kinds.includes('doc') && kinds.includes('md') },
    config: { ...run.spec.config, source: run.sources.config ? 'planilha config' : 'frontmatter' },
    promptChars: run.spec.system.length,
    soulMarkdown: soul?.slice(0, 1500) ?? null,
  };
  console.log(JSON.stringify({ ...result, soulMarkdown: undefined, config: { source: result.config.source } }));
  return result;
}

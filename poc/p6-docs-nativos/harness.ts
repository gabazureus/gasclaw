// POC P6 (descartável): mede a leitura de agentes em Google Docs/Sheets nativos. Sai do código após o ADR-012.
// Tudo pela Drive API v3 via UrlFetch com o token do script; o escopo `drive` do manifesto cobre export, list,
// upload com conversão (markdown → Doc, csv → Sheet) e update de conteúdo. Nada de SpreadsheetApp/DocumentApp.
import { buildSpec, DOC_MIME, resolveRoles, ROLES, SHEET_MIME, signature, type AgentSpec, type FileEntry, type Role, type Source, type Sources } from '../../src/workspace';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const RUNS = 5;
const C1_MS = 3000;
const C2_MS = 200;

// ---------- núcleo puro ----------

// minimal: fixtures só com ASCII, para não depender do charset do payload do UrlFetch.
export const SOUL_MD = '# Alma\n\n## Tom\n\n### Exemplos\n\n- item A\n  - item A.1\n- item B\n\n1. primeiro\n2. segundo\n\nTexto com **negrito**.\n';
const FIXTURE: Record<Exclude<Role, 'SOUL'>, string> = {
  AGENTS: '# Regras\n\nResponda curto. Agente de teste da POC P6.\n',
  IDENTITY: '# Identidade\n\n- Name: gasclaw p6\n',
  USER: '# Usuario\n\nTeste automatico da POC P6.\n',
};
const MIXED_EXPECTED: Record<Role, string> = { AGENTS: 'doc', SOUL: 'doc', IDENTITY: 'md', USER: 'md' };

/** C4: estrutura mínima que o export precisa preservar. */
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

/** Corpo multipart/related (metadados JSON + conteúdo) do upload da Drive API. */
export function multipartBody(meta: object, content: string, mime: string, boundary: string): string {
  return (
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`
  );
}

export type RunLike = {
  c1: { pass: boolean; maxMs: number; runsMs: number[] };
  c2: { decision: string; V1: { maxMs: number; pass: boolean }; V2: { maxMs: number; pass: boolean }; ttl30MaxMs: number };
  c3: { previous: string; textChanged?: boolean; invalidated?: boolean };
  c4: { pass?: boolean };
  c5: { origem: Record<string, string>; mixed: boolean };
  config: { model: string; users: string[]; source: string };
};

/** Junta os 3 runs: C1, C2, C4 do run 1; C3 do run 2 (após editar o SOUL); C5 da pasta mista. */
export function summarizeP6(run1: RunLike, run2: RunLike, misto: RunLike, ms: { setupMs: number; totalMs: number }) {
  const c1 = { pass: run1.c1.pass, maxMs: run1.c1.maxMs, runsMs: run1.c1.runsMs };
  const c2 = {
    pass: run1.c2.decision !== 'TTL30' || run1.c2.ttl30MaxMs < C2_MS,
    decision: run1.c2.decision,
    V1maxMs: run1.c2.V1.maxMs,
    V2maxMs: run1.c2.V2.maxMs,
    ttl30MaxMs: run1.c2.ttl30MaxMs,
  };
  const c3 = { pass: run2.c3.previous === 'miss' && run2.c3.invalidated === true, previous: run2.c3.previous, textChanged: run2.c3.textChanged ?? null };
  const c4 = { pass: run1.c4.pass === true };
  const c5 = { pass: misto.c5.mixed && ROLES.every((r) => misto.c5.origem[r] === MIXED_EXPECTED[r]), origem: misto.c5.origem };
  const pass = c1.pass && c2.pass && c3.pass && c4.pass && c5.pass;
  return { poc: 'P6', pass, c1, c2, c3, c4, c5, config: { model: run1.config.model, source: run1.config.source }, ...ms };
}

// ---------- casca (Apps Script) ----------

const auth = () => ({ Authorization: `Bearer ${ScriptApp.getOAuthToken()}` });
const max = (xs: number[]) => Math.max(...xs);
const isGoogle = (mime: string) => mime.startsWith('application/vnd.google-apps.');

function timed<T>(fn: () => T): { ms: number; value: T } {
  const t0 = Date.now();
  const value = fn();
  return { ms: Date.now() - t0, value };
}

function ok(res: GoogleAppsScript.URL_Fetch.HTTPResponse, what: string): string {
  const body = res.getContentText('UTF-8');
  if (res.getResponseCode() !== 200) throw new Error(`Drive ${what} ${res.getResponseCode()}: ${body.slice(0, 200)}`);
  return body;
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
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`); // folderId vem do DriveApp ou de extractFolderId
  const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime)');
  const body = ok(UrlFetchApp.fetch(`${API}?q=${q}&fields=${fields}&pageSize=1000`, { headers: auth(), muteHttpExceptions: true }), 'files.list');
  const files: { id: string; name: string; mimeType: string; modifiedTime: string }[] = JSON.parse(body).files ?? [];
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
    const body = ok(r, `export ${k}`);
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

  // C3 — comparação com a leitura anterior desta pasta.
  let c3: { previous: 'hit' | 'miss'; textChanged: boolean; invalidated: boolean } | { previous: 'none' };
  if (previous) {
    const p = JSON.parse(previous) as { sig: string; spec: AgentSpec };
    const hit = p.sig === sig;
    const textChanged = p.spec.system !== run.spec.system;
    c3 = { previous: hit ? 'hit' : 'miss', textChanged, invalidated: !hit && textChanged };
  } else {
    c3 = { previous: 'none' };
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

  const origem = Object.fromEntries(ROLES.map((r) => [r, run.sources[r]?.kind ?? 'missing']));
  const kinds = Object.values(origem);
  const soul = run.sources.SOUL?.kind === 'doc' ? (run.texts.SOUL ?? '') : null;
  return {
    folder: name,
    c1: { pass: max(cold) < C1_MS, maxMs: max(cold), runsMs: cold },
    c2: { decision: winner ? winner[0] : 'TTL30', V1: warm.V1, V2: warm.V2, ttl30MaxMs: max(ttl), cacheError },
    c3,
    c4: soul === null ? { pass: false, skipped: 'SOUL não é Google Doc nesta pasta' } : checkMarkdown(soul),
    c5: { origem, mixed: kinds.includes('doc') && kinds.includes('md') },
    config: { ...run.spec.config, source: run.sources.config ? 'planilha config' : 'frontmatter' },
    soulMarkdown: soul?.slice(0, 1500) ?? null,
  };
}

// ---------- fixtures automáticas (idempotentes; nunca apagam nada) ----------

function childFolder(parent: GoogleAppsScript.Drive.Folder, name: string): GoogleAppsScript.Drive.Folder {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** Cria (upload com conversão) ou sobrescreve o conteúdo (files.update media) de um arquivo da pasta. */
function upsert(folderId: string, existing: FileEntry[], name: string, content: string, srcMime: string, targetMime: string): void {
  const found = existing.find((e) => e.name === name && (e.mime === targetMime || (!isGoogle(targetMime) && !isGoogle(e.mime))));
  const headers = auth();
  if (found) {
    ok(UrlFetchApp.fetch(`${UPLOAD}/${found.id}?uploadType=media`, { method: 'patch', contentType: `${srcMime}; charset=UTF-8`, payload: content, headers, muteHttpExceptions: true }), `update ${name}`);
    return;
  }
  const boundary = `gasclaw${Date.now()}`;
  const payload = multipartBody({ name, parents: [folderId], mimeType: targetMime }, content, srcMime, boundary);
  ok(UrlFetchApp.fetch(`${UPLOAD}?uploadType=multipart`, { method: 'post', contentType: `multipart/related; boundary=${boundary}`, payload, headers, muteHttpExceptions: true }), `create ${name}`);
}

function p6Folders(): { teste: string; misto: string } {
  const root = childFolder(DriveApp.getRootFolder(), 'gasclaw-poc');
  return { teste: childFolder(root, 'p6-teste').getId(), misto: childFolder(root, 'p6-misto').getId() };
}

function setupP6(owner: string): { teste: string; misto: string } {
  const ids = p6Folders();
  const t = listV2(ids.teste);
  for (const r of ROLES) upsert(ids.teste, t, r, r === 'SOUL' ? SOUL_MD : FIXTURE[r], 'text/markdown', DOC_MIME);
  upsert(ids.teste, t, 'config', `model,openrouter/auto\nusers,${owner}\n`, 'text/csv', SHEET_MIME);
  const m = listV2(ids.misto);
  upsert(ids.misto, m, 'AGENTS', FIXTURE.AGENTS, 'text/markdown', DOC_MIME);
  upsert(ids.misto, m, 'SOUL', SOUL_MD, 'text/markdown', DOC_MIME);
  upsert(ids.misto, m, 'IDENTITY.md', FIXTURE.IDENTITY, 'text/markdown', 'text/markdown');
  upsert(ids.misto, m, 'USER.md', FIXTURE.USER, 'text/markdown', 'text/markdown');
  return ids;
}

/** `./gasclaw poc p6 [setup|run]`: sem etapa = setup → run 1 → editar SOUL → run 2 (C3) → misto (C5). */
export function pocP6(step: string | undefined, owner: string) {
  if (step && step !== 'setup' && step !== 'run') throw new Error(`etapa desconhecida: ${step} (use setup ou run)`);
  const t0 = Date.now();
  const ids = step === 'run' ? p6Folders() : setupP6(owner);
  const setupMs = Date.now() - t0;
  if (step === 'setup') return { poc: 'P6', step, pass: true, setupMs };
  const run1 = runP6(ids.teste);
  upsert(ids.teste, listV2(ids.teste), 'SOUL', `${SOUL_MD}\nEditado em ${new Date().toISOString()}.\n`, 'text/markdown', DOC_MIME);
  Utilities.sleep(2000);
  const run2 = runP6(ids.teste);
  const misto = runP6(ids.misto);
  const summary = summarizeP6(run1, run2, misto, { setupMs, totalMs: Date.now() - t0 });
  console.log(JSON.stringify(summary));
  return { ...summary, soulMarkdown: run1.soulMarkdown };
}

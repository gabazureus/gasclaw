// Trace do agente (ADR-014), borda: cache ao vivo, planilha "gasclaw — execuções" (1 linha por run) e
// gasclaw/runs/<id>.json (completo, 90 dias). NUNCA lança: falha de gravação vira console.warn e a resposta segue.
// Sem escopo novo: Sheets API e Drive API via UrlFetch com o escopo `drive` do manifesto.
import { multipartBody } from './drive';
import { expired, finish, HEADER, redact, renderTree, setStep, span, startRun, summaryRow, type Run, type RunKind, type RunMeta } from './trace';
import { ensureFolderPath, SHEET_MIME } from './workspace';

const SHEET_NAME = 'gasclaw — execuções';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const LIVE_KEY = 'runs:ids';
const LIVE_MAX = 20;
const SIX_HOURS = 21_600;

const props = () => PropertiesService.getScriptProperties();
const cache = () => CacheService.getScriptCache();
const auth = () => ({ Authorization: `Bearer ${ScriptApp.getOAuthToken()}` });

function warn(what: string, err: unknown) {
  console.warn(`runlog ${what}: ${redact(String((err as Error)?.message ?? err)).slice(0, 300)}`);
}

function api(url: string, method: 'get' | 'post' | 'put' | 'patch', body?: unknown): any {
  const res = UrlFetchApp.fetch(url, { method, headers: auth(), muteHttpExceptions: true, ...(body === undefined ? {} : { contentType: 'application/json', payload: JSON.stringify(body) }) });
  if (res.getResponseCode() >= 300) throw new Error(`${method} ${url.split('?')[0]} ${res.getResponseCode()}: ${res.getContentText().slice(0, 200)}`);
  return JSON.parse(res.getContentText() || '{}');
}

/** JSON só com ASCII (\uXXXX): o upload não depende do charset do UrlFetch. */
const asciiJson = (o: unknown) => JSON.stringify(o, null, 1).replace(/[-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

// ---------- armazenamento (criado sozinho, ids em Script Properties) ----------

export function ensureRunStore(): { sheetId: string; folderId: string } {
  let folderId = props().getProperty('RUNS_FOLDER_ID');
  if (!folderId) {
    folderId = ensureFolderPath(['gasclaw', 'runs']).getId();
    props().setProperty('RUNS_FOLDER_ID', folderId);
  }
  let sheetId = props().getProperty('RUNS_SHEET_ID');
  if (!sheetId) {
    const home = ensureFolderPath(['gasclaw']);
    const found = home.getFilesByName(SHEET_NAME);
    sheetId = found.hasNext() ? found.next().getId() : String(api(`${DRIVE}?fields=id`, 'post', { name: SHEET_NAME, mimeType: SHEET_MIME, parents: [home.getId()] }).id);
    api(`${SHEETS}/${sheetId}/values/A1:M1?valueInputOption=RAW`, 'put', { values: [[...HEADER]] });
    props().setProperty('RUNS_SHEET_ID', sheetId);
  }
  return { sheetId, folderId };
}

export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

// ---------- cache ao vivo ----------

type Summary = Pick<Run, 'id' | 'kind' | 'status' | 'step' | 'startedAt' | 'ms' | 'agent' | 'model' | 'tokens' | 'cost'> & { question: string };

/** Run sem os textos grandes (prompt) para caber nos 100 KB do CacheService; o JSON no Drive guarda tudo. */
function slim(run: Run): Run {
  return { ...run, spans: run.spans.map((s) => (s.data && 'messages' in s.data ? { ...s, data: { ...s.data, messages: `(${(s.data.messages as unknown[]).length} mensagens no JSON completo)` } } : s)) };
}

/** Checkpoint ao vivo: 1 put (~60 ms). Só o begin (`listed`) mexe na lista de ids, com trava (~140 ms, medido). */
function toCache(run: Run, listed = false) {
  try {
    const r = redact(slim(run));
    const raw = JSON.stringify(r);
    if (raw.length <= 95_000) cache().put(`run:${r.id}`, raw, SIX_HOURS);
    if (!listed) return;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(3000)) return;
    try {
      const ids: string[] = JSON.parse(cache().get(LIVE_KEY) ?? '[]');
      cache().put(LIVE_KEY, JSON.stringify([r.id, ...ids.filter((x) => x !== r.id)].slice(0, LIVE_MAX)), SIX_HOURS);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    warn('cache', err);
  }
}

const summarize = (r: Run): Summary => ({ id: r.id, kind: r.kind, status: r.status, step: r.step, startedAt: r.startedAt, ms: r.ms, agent: r.agent, model: r.model, tokens: r.tokens, cost: r.cost, question: (r.question ?? '').slice(0, 80) });

// ---------- tracer ----------

export type Tracer = {
  readonly run: Run;
  step<T>(name: string, fn: () => T, info?: (v: T) => Record<string, unknown>, slow?: boolean): T;
  mark(name: string, data?: Record<string, unknown>): void;
  end(out: { answer?: string; error?: string }): Run;
};

export type TracerOptions = { sheetId?: string; now?: () => number };

export function newRunId(): string {
  return `${Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmmss')}-${Utilities.getUuid().slice(0, 4)}`;
}

export function begin(kind: RunKind, meta: RunMeta, opts: TracerOptions = {}): Tracer {
  const now = opts.now ?? Date.now;
  let run = startRun(newRunId(), kind, now(), meta);
  let range: string | null = null;
  let lastEnd = run.startedAt;
  let memo: { sheetId: string; folderId: string } | null | undefined;
  toCache(run, true);

  const store = (): { sheetId: string; folderId: string } | null => {
    if (memo !== undefined) return memo;
    try {
      const s = ensureRunStore();
      memo = opts.sheetId ? { ...s, sheetId: opts.sheetId } : s;
    } catch (err) {
      warn('store', err);
      memo = null;
    }
    return memo;
  };
  /** Pedido da linha do run: append na 1ª vez (guarda o range), update depois. */
  const rowRequest = (sheetId: string): GoogleAppsScript.URL_Fetch.URLFetchRequest => {
    const payload = JSON.stringify({ values: [summaryRow(run)] });
    const url = range
      ? `${SHEETS}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`
      : `${SHEETS}/${sheetId}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    return { url, method: range ? 'put' : 'post', contentType: 'application/json', payload, headers: auth(), muteHttpExceptions: true };
  };
  const rowResult = (res: GoogleAppsScript.URL_Fetch.HTTPResponse) => {
    if (res.getResponseCode() >= 300) throw new Error(`planilha ${res.getResponseCode()}: ${res.getContentText().slice(0, 200)}`);
    if (!range) range = String(JSON.parse(res.getContentText()).updates?.updatedRange ?? '') || null;
  };
  const writeRow = () => {
    try {
      const s = store();
      if (s) rowResult(UrlFetchApp.fetch(rowRequest(s.sheetId).url, rowRequest(s.sheetId)));
    } catch (err) {
      warn('planilha', err);
    }
  };

  return {
    get run() {
      return run;
    },
    step(name, fn, info, slow = false) {
      const t0 = now();
      run = setStep(run, name);
      toCache(run); // ao vivo na tela: passo atual
      if (slow) writeRow(); // ao vivo na planilha antes do passo lento
      try {
        const v = fn();
        const data = info?.(v);
        run = span(run, name, t0, now(), data);
        if (typeof data?.agent === 'string') run = { ...run, agent: data.agent };
        return v;
      } catch (err) {
        run = span(run, name, t0, now(), { error: String((err as Error).message ?? err) }, 'error');
        throw err;
      } finally {
        lastEnd = now();
      }
    },
    mark(name, data) {
      const t = now();
      run = span(run, name, lastEnd, t, data);
      lastEnd = t;
    },
    end(out) {
      const failed = run.spans.find((s) => s.status === 'error');
      run = finish(run, now(), failed && !out.error ? { ...out, error: String(failed.data?.error ?? failed.name) } : out);
      toCache(run);
      try {
        const s = store();
        if (s) {
          // linha da planilha e JSON completo em paralelo (fetchAll): o flush custa a mais lenta, não a soma
          const boundary = `gasclaw${Date.now()}`;
          const payload = multipartBody({ name: `${run.id}.json`, parents: [s.folderId], mimeType: 'application/json' }, asciiJson(redact(run)), 'application/json', boundary);
          const [row, file] = UrlFetchApp.fetchAll([
            rowRequest(s.sheetId),
            { url: UPLOAD, method: 'post', contentType: `multipart/related; boundary=${boundary}`, payload, headers: auth(), muteHttpExceptions: true },
          ]);
          try {
            rowResult(row);
          } catch (err) {
            warn('planilha', err);
          }
          if (file.getResponseCode() >= 300) warn('json', `${file.getResponseCode()}: ${file.getContentText().slice(0, 200)}`);
          cleanupRunsDaily();
        }
      } catch (err) {
        warn('flush', err);
      }
      return run;
    },
  };
}

// ---------- leitura (tela e CLI) ----------

/** Linhas da planilha de runs (cabeçalho incluso). */
export function sheetRows(): string[][] {
  const { sheetId } = ensureRunStore();
  return api(`${SHEETS}/${sheetId}/values/A:M`, 'get').values ?? [];
}

export function liveRuns(): { running: Summary[]; recent: Summary[]; sheetUrl: string | null } {
  const ids: string[] = JSON.parse(cache().get(LIVE_KEY) ?? '[]');
  const all = cache().getAll(ids.map((i) => `run:${i}`));
  const list = ids.flatMap((i) => (all[`run:${i}`] ? [summarize(JSON.parse(all[`run:${i}`]) as Run)] : []));
  const id = props().getProperty('RUNS_SHEET_ID');
  return { running: list.filter((r) => r.status === 'running'), recent: list.filter((r) => r.status !== 'running').slice(0, 10), sheetUrl: id ? sheetUrl(id) : null };
}

export function runDetail(id?: string): { run: Run | null; tree: string } {
  const runId = id || (JSON.parse(cache().get(LIVE_KEY) ?? '[]') as string[])[0];
  if (!runId) return { run: null, tree: '(nenhum run ainda)' };
  let raw = cache().get(`run:${runId}`);
  if (!raw) {
    const folderId = props().getProperty('RUNS_FOLDER_ID');
    const it = folderId ? DriveApp.getFolderById(folderId).getFilesByName(`${runId}.json`) : null;
    raw = it && it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : null;
  }
  if (!raw) return { run: null, tree: `(run ${runId} não encontrado)` };
  const run = redact(JSON.parse(raw) as Run);
  return { run, tree: renderTree(run) };
}

// ---------- limpeza de 90 dias (sem trigger: no máximo 1 vez por dia, no fim de um run) ----------

export function cleanupRuns(now = Date.now()): number {
  const folderId = props().getProperty('RUNS_FOLDER_ID');
  if (!folderId) return 0;
  const limit = new Date(now - 90 * 86_400_000).toISOString();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and modifiedTime < '${limit}'`);
  const files: { id: string; modifiedTime: string }[] = api(`${DRIVE}?q=${q}&fields=files(id,modifiedTime)&pageSize=200`, 'get').files ?? [];
  const old = files.filter((f) => expired(Date.parse(f.modifiedTime), now));
  for (const f of old) api(`${DRIVE}/${f.id}`, 'patch', { trashed: true });
  return old.length;
}

function cleanupRunsDaily() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (props().getProperty('RUNS_CLEANUP_DAY') === today) return;
    props().setProperty('RUNS_CLEANUP_DAY', today);
    cleanupRuns();
  } catch (err) {
    warn('limpeza', err);
  }
}

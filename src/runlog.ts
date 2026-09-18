// Trace do agente (ADR-014), borda: cache ao vivo no turno; a planilha "gasclaw — execuções" (1 linha por run) e
// gasclaw/runs/<id>.json (completo, 90 dias) são gravados em lote pelo observe.drain (gatilho de 1 min ou fallback).
// NUNCA lança: falha de gravação vira console.warn e a resposta segue.
import { enqueue, enqueueOnce, RUNNING_PREFIX, TERMINAL_PREFIX } from './observe';
import { closeStale, expired, finish, HEADER, redact, renderTree, setStep, span, startRun, type Run, type RunKind, type RunMeta } from './trace';
import { ensureFolderPath, SHEET_MIME } from './workspace';

const SHEET_NAME = 'gasclaw — execuções';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const LIVE_KEY = 'runs:ids';
const LIVE_MAX = 20;
const SIX_HOURS = 21_600;
const STALE_PREFIX = 'STALE:';
const STALE_MARKER_MS = 86_400_000;

const props = () => PropertiesService.getScriptProperties();
const cache = () => CacheService.getScriptCache();
const auth = () => ({ Authorization: `Bearer ${ScriptApp.getOAuthToken()}` });

/**
 * O cache e as Properties guardam ESTADO, não entrada validada — e estado pode vir quebrado.
 *
 * Um valor é truncado quando passa dos limites (100 KB por chave no cache, 9 KB por valor nas Properties) e
 * fica meio-escrito quando a execução é cortada aos 6 min. Um `JSON.parse` cru sobre isso lançava dentro do
 * `reconcileStaleRuns`, que o gatilho de 1 min chama ANTES de drenar e de avançar os runs: um único valor
 * podre parava a entrega de todos os agentes, todo minuto, para sempre e sem sinal na tela.
 */
function parseOr<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Lista de ids ao vivo, sempre um array de string: tipo errado no cache vale o mesmo que lista vazia. */
function liveIds(): string[] {
  const v = parseOr<unknown>(cache().get(LIVE_KEY), []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function warn(what: string, err: unknown) {
  console.warn(`runlog ${what}: ${redact(String((err as Error)?.message ?? err)).slice(0, 300)}`);
}

function api(url: string, method: 'get' | 'post' | 'put' | 'patch', body?: unknown): any {
  const res = UrlFetchApp.fetch(url, { method, headers: auth(), muteHttpExceptions: true, ...(body === undefined ? {} : { contentType: 'application/json', payload: JSON.stringify(body) }) });
  if (res.getResponseCode() >= 300) throw new Error(`${method} ${url.split('?')[0]} ${res.getResponseCode()}: ${res.getContentText().slice(0, 200)}`);
  return JSON.parse(res.getContentText() || '{}');
}


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
      const ids = liveIds();
      cache().put(LIVE_KEY, JSON.stringify([r.id, ...ids.filter((x) => x !== r.id)].slice(0, LIVE_MAX)), SIX_HOURS);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    warn('cache', err);
  }
}

/** Snapshot pequeno e durável: o CacheService pode expulsar entradas antes do TTL prometido. */
function runningSnapshot(run: Run): Run {
  return redact({
    ...run,
    spans: [],
    question: run.question?.slice(0, 200),
    answer: undefined,
    error: undefined,
  });
}

function persistRunning(run: Run) {
  try {
    props().setProperty(`${RUNNING_PREFIX}${run.id}`, JSON.stringify(runningSnapshot(run)));
  } catch (err) {
    warn('marcador running', err);
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

export type TracerOptions = { now?: () => number; sheetId?: string }; // sheetId: sem uso desde o lote (P14 antiga)

export function newRunId(): string {
  return `${Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd-HHmmss')}-${Utilities.getUuid().slice(0, 4)}`;
}

export function begin(kind: RunKind, meta: RunMeta, opts: TracerOptions = {}): Tracer {
  const now = opts.now ?? Date.now;
  let run = startRun(newRunId(), kind, now(), meta);
  persistRunning(run);
  toCache(run, true);
  // C8 (P14, v25): a trava + o cache da lista ao vivo levaram até 1.087 ms antes do 1º passo, fora de qualquer span;
  // agora esse custo do próprio trace aparece como o passo trace_begin e a soma dos passos cobre a duração do run
  const started = now();
  run = span(run, 'trace_begin', run.startedAt, started);
  let lastEnd = started;

  return {
    get run() {
      return run;
    },
    step(name, fn, info, _slow = false) {
      const t0 = now();
      run = setStep(run, name);
      persistRunning(run);
      toCache(run); // ao vivo na tela: passo atual (a planilha vem no lote, ≤ 70 s)
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
      enqueue(run); // lote: sem planilha e sem JSON dentro do turno
      toCache(run);
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
  const ids = liveIds();
  const all = cache().getAll(ids.map((i) => `run:${i}`));
  const now = Date.now();
  const list = ids.flatMap((i) => {
    const run = parseOr<Run | null>(all[`run:${i}`], null);
    return run ? [summarize(closeStale(run, now))] : []; // checkpoint podre some da tela, não derruba a tela
  });
  const id = props().getProperty('RUNS_SHEET_ID');
  return { running: list.filter((r) => r.status === 'running'), recent: list.filter((r) => r.status !== 'running').slice(0, 10), sheetUrl: id ? sheetUrl(id) : null };
}

/** Worker de 1 min: fecha sob trava os processos que o runtime matou antes de `end()` e os envia ao lote uma vez. */
export function reconcileStaleRuns(now = Date.now()): number {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3_000)) return 0;
  try {
    const properties = props().getProperties();
    for (const [key, value] of Object.entries(properties)) {
      if (key.startsWith(STALE_PREFIX) || key.startsWith(TERMINAL_PREFIX)) {
        try {
          const terminal = JSON.parse(value) as Run;
          const runningKey = `${RUNNING_PREFIX}${terminal.id}`;
          if (properties[runningKey]) {
            try {
              props().deleteProperty(runningKey);
              delete properties[runningKey];
            } catch {
              continue; // o terminal protege contra ressurreição até a remoção do RUNNING funcionar
            }
          }
          if (now - (terminal.endedAt ?? terminal.startedAt) > STALE_MARKER_MS) {
            props().deleteProperty(key);
            delete properties[key];
          }
        } catch {
          props().deleteProperty(key);
          delete properties[key];
        }
      }
    }
    const cachedIds = liveIds();
    const runningIds = Object.keys(properties).filter((key) => key.startsWith(RUNNING_PREFIX)).map((key) => key.slice(RUNNING_PREFIX.length));
    const durableIds = Object.entries(properties)
      .filter(([key]) => key.startsWith(TERMINAL_PREFIX) || key.startsWith(STALE_PREFIX))
      .flatMap(([key, value]) => {
        try {
          return [{ id: key.slice(key.indexOf(':') + 1), startedAt: (JSON.parse(value) as Run).startedAt }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, LIVE_MAX)
      .map((x) => x.id);
    const ids = [...new Set([...cachedIds, ...runningIds, ...durableIds])];
    const all = cache().getAll(ids.map((i) => `run:${i}`));
    let closed = 0;
    const visible: Run[] = [];
    const repairs: Record<string, string> = {};
    const repairCache = (run: Run) => {
      const r = redact(slim(run));
      const raw = JSON.stringify(r);
      if (raw.length <= 95_000) repairs[`run:${r.id}`] = raw;
    };
    for (const id of ids) {
      const terminal = properties[`${TERMINAL_PREFIX}${id}`];
      if (terminal) {
        const full = cache().get(`qjson:${id}`) ?? terminal;
        try {
          const run = JSON.parse(full) as Run;
          const cached = parseOr<Run | null>(all[`run:${id}`], null); // corrompido conta como ausente: repara
          if (!cached || cached.status === 'running') repairCache(run);
          visible.push(run);
        } catch {
          // marcador inválido é removido pela varredura acima na próxima rodada
        }
        continue;
      }
      const stale = properties[`${STALE_PREFIX}${id}`];
      if (stale) {
        try {
          const run = JSON.parse(cache().get(`qjson:${id}`) ?? stale) as Run;
          const cachedStale = parseOr<Run | null>(all[`run:${id}`], null);
          if (!cachedStale || cachedStale.status === 'running') repairCache(run);
          visible.push(run);
        } catch {
          // marcador inválido é removido pela varredura acima na próxima rodada
        }
        continue;
      }
      // Os dois ramos irmãos acima já eram protegidos; estes dois não eram. Era assimetria, não decisão.
      const cachedRun = parseOr<Run | null>(all[`run:${id}`], null);
      const durableRunning = parseOr<Run | null>(properties[`${RUNNING_PREFIX}${id}`], null);
      const run = cachedRun && durableRunning ? { ...cachedRun, step: durableRunning.step } : (cachedRun ?? durableRunning);
      if (!run) continue;
      if (run.status !== 'running' && durableRunning) {
        enqueue(run); // a persistência terminal anterior falhou; refaz fila + marcador juntos
        repairCache(run);
        visible.push(run);
        continue;
      }
      if (run.status !== 'running') {
        visible.push(run);
        continue;
      }
      const next = closeStale(run, now);
      if (next === run) {
        if (!all[`run:${id}`]) repairCache(run);
        visible.push(run);
        continue;
      }
      const marker = `${STALE_PREFIX}${id}`;
      if (!enqueueOnce(next, marker, JSON.stringify(runningSnapshot(next)))) {
        visible.push(run);
        continue;
      }
      repairCache(next);
      visible.push(next);
      closed += 1;
    }
    const nextIds = visible.sort((a, b) => b.startedAt - a.startedAt).slice(0, LIVE_MAX).map((run) => run.id);
    try {
      if (Object.keys(repairs).length) cache().putAll(repairs, SIX_HOURS);
      if (JSON.stringify(nextIds) !== JSON.stringify(cachedIds)) cache().put(LIVE_KEY, JSON.stringify(nextIds), SIX_HOURS);
    } catch (err) {
      warn('reparo do cache', err);
    }
    return closed;
  } finally {
    lock.releaseLock();
  }
}

export function runDetail(id?: string): { run: Run | null; tree: string } {
  const runId = id || liveIds()[0];
  if (!runId) return { run: null, tree: '(nenhum run ainda)' };
  let raw = cache().get(`run:${runId}`);
  if (!raw) {
    const folderId = props().getProperty('RUNS_FOLDER_ID');
    const it = folderId ? DriveApp.getFolderById(folderId).getFilesByName(`${runId}.json`) : null;
    raw = it && it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : null;
  }
  if (!raw) return { run: null, tree: `(run ${runId} não encontrado)` };
  const run = redact(closeStale(JSON.parse(raw) as Run, Date.now()));
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

export function cleanupRunsDaily() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (props().getProperty('RUNS_CLEANUP_DAY') === today) return;
    props().setProperty('RUNS_CLEANUP_DAY', today);
    cleanupRuns();
  } catch (err) {
    warn('limpeza', err);
  }
}

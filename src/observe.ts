// Observabilidade (ADR-014 lote, ADR-016 limites, ADR-018 uso), borda. Leituras NUNCA lançam: cada fonte vira {ok|erro}.
// Sem escopo novo nesta etapa: gatilho, processes, MailApp e Monitoring só funcionam depois da reautorização (ADR-015).
import { multipartBody } from './drive';
import { drainBody, QUEUE_PREFIX, queueEntry, settle, shouldDrain, splitQueue } from './batch';
import { accountKind, buildLimits, type LimitItem, type Read } from './limits';
import { getOwner } from './store';
import { keyInfo } from './models';
import { cleanupRunsDaily, ensureRunStore, reconcileStaleRuns } from './runlog';
import { redact, type Run } from './trace';
import { chart, dayKey, dayTotals, fold, freePerMinuteMax, loadUsage, prune, totalCost, totalReq, usageProps, type Range, type RunsOfDay, type Usage } from './usage';

declare const __GCP_NUMBER__: string; // embutido pelo build (gasclaw.env → GCP_NUMBER)

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const props = () => PropertiesService.getScriptProperties();
const cache = () => CacheService.getScriptCache();
const auth = () => ({ Authorization: `Bearer ${ScriptApp.getOAuthToken()}` });
export const TERMINAL_PREFIX = 'TERMINAL:';
export const RUNNING_PREFIX = 'RUNNING:';
const msg = (err: unknown) => redact(String((err as Error)?.message ?? err)).slice(0, 200);
const read = <T>(fn: () => T): Read<T> => {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
};

// ---------- fila (turno) ----------

const terminalSnapshot = (run: Run): Run => redact({
  ...run,
  spans: [],
  question: run.question?.slice(0, 200),
  answer: run.answer?.slice(0, 200),
  error: run.error?.slice(0, 200),
});

/** No turno: fila + marcador terminal numa escrita, e o JSON completo no cache. Nunca lança. */
export function enqueue(run: Run): void {
  try {
    const e = queueEntry(run);
    props().setProperties({ [`${QUEUE_PREFIX}${e.id}`]: JSON.stringify(e), [`${TERMINAL_PREFIX}${e.id}`]: JSON.stringify(terminalSnapshot(run)) });
    props().deleteProperty(`${RUNNING_PREFIX}${e.id}`);
    cache().removeAll(['obs:props', EMPTY_KEY]);
    const full = JSON.stringify(redact(run));
    if (full.length < 95_000) cache().put(`qjson:${run.id}`, full, 21_600);
  } catch (err) {
    console.warn(`observe enqueue: ${msg(err)}`);
  }
}

/** Reconciliação de morte forçada: fila e marcador durável entram na mesma escrita; caches podem ser refeitos depois. */
export function enqueueOnce(run: Run, markerKey: string, markerValue: string): boolean {
  try {
    const p = props();
    if (p.getProperty(markerKey)) return false;
    const e = queueEntry(run);
    p.setProperties({ [`${QUEUE_PREFIX}${e.id}`]: JSON.stringify(e), [markerKey]: markerValue });
    p.deleteProperty(`${RUNNING_PREFIX}${e.id}`);
  } catch (err) {
    console.warn(`observe enqueueOnce: ${msg(err)}`);
    return false;
  }
  try {
    cache().removeAll(['obs:props', EMPTY_KEY]);
    const full = JSON.stringify(redact(run));
    if (full.length < 95_000) cache().put(`qjson:${run.id}`, full, 21_600);
  } catch (err) {
    console.warn(`observe enqueueOnce cache: ${msg(err)}`);
  }
  return true;
}

// ---------- Properties com cache de 60 s (1 getProperties por leitura; a chave nunca vai para o cache) ----------

function obsProps(fresh = false): Record<string, string> {
  if (!fresh) {
    const hit = cache().get('obs:props');
    if (hit) return JSON.parse(hit);
  }
  const all = props().getProperties();
  const mine = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(QUEUE_PREFIX) || k.startsWith('USAGE:')));
  const bytes = Object.entries(all).reduce((t, [k, v]) => t + k.length + v.length, 0);
  const out = { ...mine, 'OBS:bytes': String(bytes) };
  const raw = JSON.stringify(out);
  if (raw.length < 95_000) cache().put('obs:props', raw, 60);
  return out;
}

export { loadUsage }; // a P16 lê daqui

/** Uso (partes ≤ 8 KB, ver usageProps) e `extra` (fila marcada) numa escrita só; depois apaga as partes que sobraram. */
function saveUsage(prev: Record<string, string>, u: Usage, runsByDay: Record<string, RunsOfDay>, extra: Record<string, string>) {
  const out = usageProps(u, runsByDay, Date.now(), prev);
  const stale = Object.keys(prev).filter((k) => /^USAGE:[hdr]:/.test(k) && !(k in out));
  props().setProperties({ ...out, ...extra });
  for (const k of stale) props().deleteProperty(k);
}

// ---------- drenagem (gatilho de 1 min ou fallback) ----------

export type DrainResult = { drained: number; ms: number; rows: boolean; json: number; skipped?: string };

/**
 * `inline`: fallback dentro de um turno ou da tela; menos entradas e sem a limpeza de 90 dias (cabe nos 30 s do Chat).
 *
 * A limpeza roda FORA do lock, de propósito. Ela faz até 200 PATCH em série e não mexe na fila, mas o
 * ScriptLock do Apps Script é GLOBAL: é o mesmo que a aprovação toma (`approvalStore`/`runStore`, 10 s de
 * paciência). Segurando o lock durante os 200 PATCH, quem clicasse "Aprovar" naquela janela levava
 * "aprovação ocupada" — erro na cara do usuário, vindo de uma faxina que nada tem a ver com aprovar.
 *
 * `cleanupRunsDaily` já tem guarda de uma vez por dia e try/catch próprios, então chamá-la aqui não a
 * repete nem derruba a drenagem. De quebra, ela passa a rodar também quando a fila está vazia: antes ficava
 * depois do `return` do caminho sem entradas, ou seja, uma instalação parada nunca limpava os arquivos.
 */
/**
 * Marca de FILA VAZIA (5 min). O tique de 1 min cai aqui sempre, e com a fila vazia tudo o que a drenagem
 * fazia era tomar o ScriptLock **global** — o mesmo que a aprovação toma — e ler as Properties inteiras
 * para achar zero entradas. Medido no dev (2026-09-22, N=13): o tique ocioso levava 577–1616 ms, 5 delas
 * acima do critério de 1000 ms da ADR-027, e a drenagem era 285–652 ms disso.
 *
 * Quem enfileira apaga a marca na MESMA execução (`enqueue`, `enqueueOnce`, e a própria drenagem quando
 * devolve entradas à fila), então ela nunca esconde trabalho novo. O prazo curto é o limite do estrago se
 * uma dessas remoções falhar: no pior caso a linha sai cinco tiques depois, e nada se perde — a fila mora
 * nas Properties, não no cache.
 */
const EMPTY_KEY = 'obs:empty';

export function drain(max = 200, inline = false): DrainResult {
  const t0 = Date.now();
  if (cache().get(EMPTY_KEY)) {
    if (!inline) cleanupRunsDaily();
    return record({ drained: 0, ms: Date.now() - t0, rows: true, json: 0 });
  }
  const out = drainLocked(max);
  if (!inline && !out.skipped) cleanupRunsDaily();
  return out;
}

function drainLocked(max: number): DrainResult {
  const t0 = Date.now();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5_000)) return { drained: 0, ms: Date.now() - t0, rows: false, json: 0, skipped: 'outra drenagem em andamento' };
  try {
    const entries = splitQueue(props().getProperties()).slice(0, max);
    if (!entries.length) {
      cache().put(EMPTY_KEY, '1', 300); // nada a drenar: o próximo tique ocioso sai sem lock e sem leitura
      return record({ drained: 0, ms: Date.now() - t0, rows: true, json: 0 });
    }
    const store = ensureRunStore();
    const fresh = entries.filter((e) => !e.rowDone); // quem só espera o JSON não repete linha nem uso
    // 1) todas as linhas numa chamada só
    if (fresh.length) {
      const rowsRes = UrlFetchApp.fetch(`${SHEETS}/${store.sheetId}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'post', contentType: 'application/json', payload: JSON.stringify({ values: fresh.map((e) => e.row) }), headers: auth(), muteHttpExceptions: true,
      });
      if (rowsRes.getResponseCode() === 404) {
        // planilha (ou pasta) apagada: esquece os ids para ensureRunStore recriar na próxima drenagem, em vez de travar a fila
        props().deleteProperty('RUNS_SHEET_ID');
        props().deleteProperty('RUNS_FOLDER_ID');
      }
      if (rowsRes.getResponseCode() >= 300) throw new Error(`planilha ${rowsRes.getResponseCode()}: ${rowsRes.getContentText().slice(0, 200)}`); // fila fica para a próxima vez
    }
    const rows = true;
    // 2) uso por modelo e runs por dia, com a fila marcada "linha feita" na MESMA escrita:
    //    se algo falhar depois daqui, a próxima drenagem não duplica linha nem uso.
    if (fresh.length) {
      const p = props().getProperties();
      const u = prune(fold(loadUsage(p), fresh.flatMap((e) => e.recs)), Date.now());
      const runs: Record<string, RunsOfDay> = {};
      for (const e of fresh) {
        const day = dayKey(e.at);
        const r = (runs[day] ??= JSON.parse(p[`USAGE:r:${day}`] ?? '{"n":0,"longest":0}'));
        r.n += 1;
        r.longest = Math.max(r.longest, Number(e.row[6]) || 0);
      }
      saveUsage(p, u, runs, Object.fromEntries(fresh.map((e) => [`${QUEUE_PREFIX}${e.id}`, JSON.stringify({ ...e, rowDone: true, recs: [] })])));
    }
    // 3) JSON completos em paralelo (o do cache; se expirou, a entrada da fila)
    const fulls = cache().getAll(entries.map((e) => `qjson:${e.id}`));
    const res = UrlFetchApp.fetchAll(entries.map((e) => {
      const boundary = `gasclaw${e.id}`;
      const body = drainBody(e, fulls[`qjson:${e.id}`]);
      return { url: UPLOAD, method: 'post', contentType: `multipart/related; boundary=${boundary}`, payload: multipartBody({ name: `${e.id}.json`, parents: [store.folderId], mimeType: 'application/json' }, body.replace(/[-￿]/g, (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`), 'application/json', boundary), headers: auth(), muteHttpExceptions: true };
    }));
    const done = settle(entries, res.map((r) => r.getResponseCode()));
    for (const id of done.remove) props().deleteProperty(`${QUEUE_PREFIX}${id}`);
    for (const e of done.retry) props().setProperty(`${QUEUE_PREFIX}${e.id}`, JSON.stringify(e)); // o JSON volta na próxima drenagem
    cache().removeAll(['obs:props', EMPTY_KEY, ...done.remove.map((id) => `qjson:${id}`)]);
    dailyLimitsRow(store.sheetId);
    return record({ drained: entries.length, ms: Date.now() - t0, rows, json: entries.length - done.retry.length });
  } catch (err) {
    console.warn(`observe drain: ${msg(err)}`);
    return record({ drained: 0, ms: Date.now() - t0, rows: false, json: 0, skipped: msg(err) });
  } finally {
    lock.releaseLock();
  }
}

function record(r: DrainResult): DrainResult {
  try {
    const list = JSON.parse(cache().get('obs:drains') ?? '[]') as (DrainResult & { at: number })[];
    cache().put('obs:drains', JSON.stringify([{ ...r, at: Date.now() }, ...list].slice(0, 60)), 21_600);
  } catch {
    /* só métrica */
  }
  return r;
}

export const drainHistory = (): (DrainResult & { at: number })[] => JSON.parse(cache().get('obs:drains') ?? '[]');

export function oldestQueued(): number | null {
  const e = splitQueue(obsProps(true))[0];
  return e ? e.at : null;
}

// ---------- gatilho de 1 min (script.scriptapp) ----------

export type TriggerStatus = 'active' | 'inactive' | 'awaiting authorization';

export function triggerStatus(fresh = false): TriggerStatus {
  if (!fresh) {
    const hit = cache().get('obs:trigger') as TriggerStatus | null;
    if (hit) return hit;
  }
  let s: TriggerStatus;
  try {
    s = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'drainRuns') ? 'active' : 'inactive';
  } catch {
    s = 'awaiting authorization';
  }
  cache().put('obs:trigger', s, 60); // 60 s: com 600 s a tela mostrou "awaiting authorization" depois de autorizado
  return s;
}

/** Idempotente: cria o gatilho só se não existir (com trava); sem autorização, não faz nada. */
export function ensureTrigger(): TriggerStatus {
  const s = triggerStatus(true);
  if (s !== 'inactive') return s;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5_000)) return s;
  try {
    if (!ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'drainRuns')) ScriptApp.newTrigger('drainRuns').timeBased().everyMinutes(1).create();
    return triggerStatus(true);
  } catch {
    return 'awaiting authorization';
  } finally {
    lock.releaseLock();
  }
}

/** Fallback sem gatilho: drena se a fila tiver mais de 1 min (no turno ou ao abrir a tela). */
export function maybeDrain(): DrainResult | null {
  try {
    reconcileStaleRuns();
    if (!shouldDrain(oldestQueued(), Date.now(), triggerStatus() === 'active')) return null;
    return drain(20, true);
  } catch (err) {
    console.warn(`observe maybeDrain: ${msg(err)}`);
    return null;
  }
}

// ---------- uso por modelo ----------

const RANGES: Range[] = ['7d', '30d', 'months'];

export function usageView(apiKey: string | null, day?: string, range?: string) {
  const now = Date.now();
  const p = obsProps();
  const u = loadUsage(p);
  const today = dayKey(now, 'utc');
  const measured = totalCost(dayTotals(u, today, 'utc'));
  const or = apiKey ? read(() => keyInfo(apiKey)) : ({ ok: false, error: 'no OpenRouter key saved' } as Read<never>);
  const informed = or.ok ? or.value.usage_daily : null;
  if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('invalid day: use YYYY-MM-DD');
  // Faixa desconhecida volta para 7 dias em vez de derrubar a tela: a faixa e so o recorte do grafico, e
  // uma tela em branco ensina menos do que o recorte padrao.
  const faixa = RANGES.indexOf(range as Range) >= 0 ? (range as Range) : '7d';
  const shownDay = day ?? dayKey(now, 'sp');
  const table = Object.entries(dayTotals(u, shownDay, 'sp')).map(([model, c]) => ({ model, ...c })).sort((a, b) => b.cost - a.cost);
  return {
    chart: chart(u, now, 'sp', day, faixa),
    table,
    day: shownDay,
    queue: splitQueue(p).length,
    check: { dayUtc: today, measured, informed, diffPct: informed ? Math.round(((measured - informed) / informed) * 1000) / 10 : null, error: or.ok ? null : or.error, nota: CROSS_CHECK_NOTE },
  };
}

/**
 * Ressalva da conferência cruzada. **Não apague, e não "limpe" por ser longa.**
 *
 * O número do OpenRouter vem de `/api/v1/key`, que é POR CHAVE — não por projeto. Qualquer outra
 * coisa que use a mesma chave (outro script, prod junto com dev, um teste no terminal) entra ali e
 * NÃO entra na contagem do gasclaw. A diferença, então, pode ser outro consumidor e não erro de
 * medição, e o painel mostrava um sinal de menos como se fosse defeito.
 *
 * Medido em 2026-09-19 com um experimento controlado: em duas leituras separadas, o gasclaw subiu
 * US$ 0,000618840 e o OpenRouter subiu US$ 0,000618840 — diferença ZERO até a 12ª casa —, com um
 * offset constante de US$ 0,053229 que nunca se moveu. Ou seja: **a contabilidade por requisição
 * do gasclaw está exata**, e a diferença é gasto da mesma chave que ele nunca viu.
 */
export const CROSS_CHECK_NOTE =
  "OpenRouter's number is PER KEY, not per project: anything else using this key (prod, another script, a terminal test) counts there and not here. A gap can be another consumer, not a measurement error. Both sides use the same UTC day.";

// ---------- limites ----------

/**
 * Execuções de hoje quebradas por tipo (TIME_DRIVEN, WEBAPP, EDITOR…), **sem cache**.
 *
 * É o instrumento da POC P3 (ADR-026): a pergunta que derruba ou sustenta o desenho do pump é se o trabalho disparado
 * por `doPost` conta como execução de gatilho. Sem a quebra por tipo só dá para medir o total, e o total não responde.
 */
export function processesByType(): Record<string, { n: number; ms: number }> {
  const start = new Date(Date.parse(`${dayKey(Date.now())}T00:00:00Z`)).toISOString();
  const base = `https://script.googleapis.com/v1/processes:listScriptProcesses?scriptId=${ScriptApp.getScriptId()}&scriptProcessFilter.startTime=${encodeURIComponent(start)}&pageSize=200`;
  const ms = (d?: string) => Math.round(parseFloat(d ?? '0') * 1000);
  const by: Record<string, { n: number; ms: number }> = {};
  let token = '';
  for (let page = 0; page < 10; page++) {
    // o gatilho de 1 min gera ~1.440 execuções por dia: sem paginar, só as ~3 primeiras horas contavam
    const res = UrlFetchApp.fetch(`${base}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, { headers: auth(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error(`processes ${res.getResponseCode()}: ${res.getContentText().slice(0, 160)}`);
    const body: { processes?: { processType?: string; duration?: string }[]; nextPageToken?: string } = JSON.parse(res.getContentText());
    for (const x of body.processes ?? []) {
      const k = x.processType ?? 'DESCONHECIDO';
      by[k] = { n: (by[k]?.n ?? 0) + 1, ms: (by[k]?.ms ?? 0) + ms(x.duration) };
    }
    token = body.nextPageToken ?? '';
    if (!token) break;
  }
  return by;
}

function processesToday(): { triggerMsToday: number; count: number } {
  const by = processesByType();
  return { triggerMsToday: by.TIME_DRIVEN?.ms ?? 0, count: Object.values(by).reduce((t, v) => t + v.n, 0) };
}

function monitoringToday(): { requests: number } {
  if (!__GCP_NUMBER__) throw new Error('the GCP project number is not embedded in this build');
  const start = new Date(Date.parse(`${dayKey(Date.now())}T00:00:00Z`)).toISOString();
  const q = [
    `filter=${encodeURIComponent('metric.type="serviceruntime.googleapis.com/api/request_count"')}`,
    `interval.startTime=${encodeURIComponent(start)}`,
    `interval.endTime=${encodeURIComponent(new Date().toISOString())}`,
    'aggregation.alignmentPeriod=86400s',
    'aggregation.perSeriesAligner=ALIGN_SUM',
    'aggregation.crossSeriesReducer=REDUCE_SUM',
  ].join('&');
  const res = UrlFetchApp.fetch(`https://monitoring.googleapis.com/v3/projects/${__GCP_NUMBER__}/timeSeries?${q}`, { headers: auth(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`monitoring ${res.getResponseCode()}: ${res.getContentText().slice(0, 160)}`);
  const series: { points?: { value?: { int64Value?: string } }[] }[] = JSON.parse(res.getContentText()).timeSeries ?? [];
  return { requests: series.reduce((t, s) => t + (s.points ?? []).reduce((a, pt) => a + Number(pt.value?.int64Value ?? 0), 0), 0) };
}

/** Todas as fontes, com cache de 10 min (`fresh` ignora o cache). */
export function limitsNow(apiKey: string | null, fresh = false): { items: LimitItem[]; at: number; cached: boolean; trigger: TriggerStatus } {
  if (!fresh) {
    const hit = cache().get('obs:limits');
    if (hit) return { ...JSON.parse(hit), cached: true };
  }
  const now = Date.now();
  const p = obsProps(fresh);
  const u = loadUsage(p);
  const today = dayTotals(u, dayKey(now), 'utc');
  const runs = JSON.parse(p[`USAGE:r:${dayKey(now)}`] ?? '{"n":0,"longest":0}') as { n: number; longest: number };
  const items = buildLimits({
    now,
    account: accountKind(getOwner()), // cotas de Workspace × conta pessoal, pela conta dona do script
    drive: read(() => {
      const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', { headers: auth(), muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) throw new Error(`Drive about ${r.getResponseCode()}`);
      const q = JSON.parse(r.getContentText()).storageQuota ?? {};
      return { limit: q.limit ? Number(q.limit) : null, usage: Number(q.usage ?? 0) };
    }),
    key: apiKey ? read(() => keyInfo(apiKey)) : { ok: false, error: 'no OpenRouter key saved' },
    measured: {
      freeToday: totalReq(today, (m) => m.endsWith(':free')),
      freePerMinuteMax: freePerMinuteMax(u),
      urlFetchToday: totalReq(today) + runs.n * 2, // estimado: 1 por chamada ao modelo + linha e JSON por run
      tokensToday: Object.values(today).reduce((t, c) => t + c.tok, 0),
      costToday: totalCost(today),
      longestMs: runs.longest,
      propsBytes: Number(p['OBS:bytes'] ?? 0),
    },
    processes: read(processesToday),
    mail: read(() => MailApp.getRemainingDailyQuota()),
    monitoring: read(monitoringToday),
    triggers: read(() => ScriptApp.getProjectTriggers().length),
  });
  const out = { items, at: now, trigger: triggerStatus(fresh) }; // "ler de novo agora" também relê o gatilho
  cache().put('obs:limits', JSON.stringify(out), 600);
  return { ...out, cached: false };
}

/** Uma linha por dia na aba "limites" da planilha de runs (idempotente). */
function dailyLimitsRow(sheetId: string) {
  const today = dayKey(Date.now(), 'sp');
  if (props().getProperty('LIMITS_ROW_DAY') === today) return;
  try {
    const meta = JSON.parse(UrlFetchApp.fetch(`${SHEETS}/${sheetId}?fields=sheets.properties.title`, { headers: auth(), muteHttpExceptions: true }).getContentText());
    const has = (meta.sheets ?? []).some((s: { properties: { title: string } }) => s.properties.title === 'limites');
    if (!has) {
      UrlFetchApp.fetch(`${SHEETS}/${sheetId}:batchUpdate`, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'limites' } } }] }), headers: auth(), muteHttpExceptions: true });
      // O cabeçalho da planilha fica em pt-BR DE PROPÓSITO, e a catraca de idioma conta isso como
      // dívida que não vai baixar aqui: renomear coluna numa planilha que o dono já tem desalinha o
      // que ele já leu e já filtrou. O idioma da tela é decisão nossa (ADR-033); o de um arquivo que
      // vive na conta dele, não.
      UrlFetchApp.fetch(`${SHEETS}/${sheetId}/values/limites!A1:append?valueInputOption=RAW`, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ values: [['dia', 'item', 'usado', 'total', 'unidade', 'nível', 'fonte', 'status', 'nota']] }), headers: auth(), muteHttpExceptions: true });
    }
    const { items } = limitsNow(PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY'));
    const values = items.map((i) => [today, i.label, i.used ?? '', i.total ?? '', i.unit, i.level, i.source, i.status, i.note ?? '']);
    const res = UrlFetchApp.fetch(`${SHEETS}/${sheetId}/values/limites!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ values }), headers: auth(), muteHttpExceptions: true });
    if (res.getResponseCode() >= 300) throw new Error(`aba limites ${res.getResponseCode()}: ${res.getContentText().slice(0, 160)}`); // não marca o dia: tenta de novo
    props().setProperty('LIMITS_ROW_DAY', today);
  } catch (err) {
    console.warn(`observe limites: ${msg(err)}`);
  }
}

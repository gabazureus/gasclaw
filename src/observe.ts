// Observabilidade (ADR-014 lote, ADR-016 limites, ADR-018 uso), borda. Leituras NUNCA lançam: cada fonte vira {ok|erro}.
// Sem escopo novo nesta etapa: gatilho, processes, MailApp e Monitoring só funcionam depois da reautorização (ADR-015).
import { multipartBody } from './drive';
import { drainBody, QUEUE_PREFIX, queueEntry, shouldDrain, splitQueue, type QueueEntry } from './batch';
import { buildLimits, type LimitItem, type Read } from './limits';
import { keyInfo, keyCallsLast30min } from './models';
import { cleanupRunsDaily, ensureRunStore } from './runlog';
import { redact, type Run } from './trace';
import { chart, dayKey, dayTotals, emptyUsage, fold, freePerMinuteMax, prune, totalCost, totalReq, type Bucket, type Usage } from './usage';

declare const __GCP_NUMBER__: string; // embutido pelo build (gasclaw.env → GCP_NUMBER)

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const props = () => PropertiesService.getScriptProperties();
const cache = () => CacheService.getScriptCache();
const auth = () => ({ Authorization: `Bearer ${ScriptApp.getOAuthToken()}` });
const msg = (err: unknown) => redact(String((err as Error)?.message ?? err)).slice(0, 200);
const read = <T>(fn: () => T): Read<T> => {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
};

// ---------- fila (turno) ----------

/** No turno: 1 setProperty (entrada ≤ 9 KB) + 1 put do run redigido para o JSON completo. Nunca lança. */
export function enqueue(run: Run): void {
  try {
    const e = queueEntry(run);
    props().setProperty(`${QUEUE_PREFIX}${e.id}`, JSON.stringify(e));
    cache().remove('obs:props');
    const full = JSON.stringify(redact(run));
    if (full.length < 95_000) cache().put(`qjson:${run.id}`, full, 21_600);
  } catch (err) {
    console.warn(`observe enqueue: ${msg(err)}`);
  }
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

export function loadUsage(p: Record<string, string>): Usage {
  const u = emptyUsage();
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith('USAGE:h:')) Object.assign(u.h, JSON.parse(v));
    if (k.startsWith('USAGE:d:')) Object.assign(u.d, JSON.parse(v));
    if (k === 'USAGE:m') Object.assign(u.m, JSON.parse(v));
  }
  return u;
}

/** Uma Property por dia UTC (horas) e por mês (dias): cada valor fica bem abaixo dos 9 KB. */
function saveUsage(u: Usage, runsByDay: Record<string, { n: number; longest: number }>) {
  const out: Record<string, string> = { 'USAGE:m': JSON.stringify(u.m) };
  const group = (src: Record<string, Bucket>, prefix: string, cut: number) => {
    const g: Record<string, Record<string, Bucket>> = {};
    for (const [k, b] of Object.entries(src)) (g[k.slice(0, cut)] ??= {})[k] = b;
    for (const [gk, v] of Object.entries(g)) out[`${prefix}${gk}`] = JSON.stringify(v);
  };
  group(u.h, 'USAGE:h:', 10);
  group(u.d, 'USAGE:d:', 7);
  for (const [day, r] of Object.entries(runsByDay)) out[`USAGE:r:${day}`] = JSON.stringify(r);
  const p = props();
  const stale = Object.keys(p.getProperties()).filter((k) => (k.startsWith('USAGE:h:') || k.startsWith('USAGE:d:')) && !(k in out));
  p.setProperties(out);
  for (const k of stale) p.deleteProperty(k);
}

// ---------- drenagem (gatilho de 1 min ou fallback) ----------

export type DrainResult = { drained: number; ms: number; rows: boolean; json: number; skipped?: string };

export function drain(max = 200): DrainResult {
  const t0 = Date.now();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5_000)) return { drained: 0, ms: Date.now() - t0, rows: false, json: 0, skipped: 'outra drenagem em andamento' };
  try {
    const entries = splitQueue(props().getProperties()).slice(0, max);
    if (!entries.length) return record({ drained: 0, ms: Date.now() - t0, rows: true, json: 0 });
    const store = ensureRunStore();
    // 1) todas as linhas numa chamada só
    const rowsRes = UrlFetchApp.fetch(`${SHEETS}/${store.sheetId}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ values: entries.map((e) => e.row) }), headers: auth(), muteHttpExceptions: true,
    });
    const rows = rowsRes.getResponseCode() < 300;
    if (!rows) throw new Error(`planilha ${rowsRes.getResponseCode()}: ${rowsRes.getContentText().slice(0, 200)}`); // fila fica para a próxima vez
    // 2) JSON completos em paralelo (o do cache; se expirou, a entrada da fila)
    const fulls = cache().getAll(entries.map((e) => `qjson:${e.id}`));
    const res = UrlFetchApp.fetchAll(entries.map((e) => {
      const boundary = `gasclaw${e.id}`;
      const body = drainBody(e, fulls[`qjson:${e.id}`]);
      return { url: UPLOAD, method: 'post', contentType: `multipart/related; boundary=${boundary}`, payload: multipartBody({ name: `${e.id}.json`, parents: [store.folderId], mimeType: 'application/json' }, body.replace(/[-￿]/g, (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`), 'application/json', boundary), headers: auth(), muteHttpExceptions: true };
    }));
    // 3) uso por modelo + contagem de runs por dia
    const p = props().getProperties();
    let u = loadUsage(p);
    u = prune(fold(u, entries.flatMap((e) => e.recs)), Date.now());
    const runs: Record<string, { n: number; longest: number }> = {};
    for (const e of entries) {
      const day = dayKey(e.at);
      const r = (runs[day] ??= JSON.parse(p[`USAGE:r:${day}`] ?? '{"n":0,"longest":0}'));
      r.n += 1;
      r.longest = Math.max(r.longest, Number(e.row[6]) || 0);
    }
    saveUsage(u, runs);
    for (const e of entries) props().deleteProperty(`${QUEUE_PREFIX}${e.id}`);
    cache().removeAll(['obs:props', ...entries.map((e) => `qjson:${e.id}`)]);
    dailyLimitsRow(store.sheetId);
    cleanupRunsDaily();
    return record({ drained: entries.length, ms: Date.now() - t0, rows, json: res.filter((r) => r.getResponseCode() < 300).length });
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

export type TriggerStatus = 'ativo' | 'inativo' | 'aguardando autorização';

export function triggerStatus(fresh = false): TriggerStatus {
  if (!fresh) {
    const hit = cache().get('obs:trigger') as TriggerStatus | null;
    if (hit) return hit;
  }
  let s: TriggerStatus;
  try {
    s = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'drainRuns') ? 'ativo' : 'inativo';
  } catch {
    s = 'aguardando autorização';
  }
  cache().put('obs:trigger', s, 600);
  return s;
}

/** Idempotente: cria o gatilho só se não existir (com trava); sem autorização, não faz nada. */
export function ensureTrigger(): TriggerStatus {
  const s = triggerStatus(true);
  if (s !== 'inativo') return s;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5_000)) return s;
  try {
    if (!ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'drainRuns')) ScriptApp.newTrigger('drainRuns').timeBased().everyMinutes(1).create();
    return triggerStatus(true);
  } catch {
    return 'aguardando autorização';
  } finally {
    lock.releaseLock();
  }
}

/** Fallback sem gatilho: drena se a fila tiver mais de 1 min (no turno ou ao abrir a tela). */
export function maybeDrain(): DrainResult | null {
  try {
    if (!shouldDrain(oldestQueued(), Date.now(), triggerStatus() === 'ativo')) return null;
    return drain();
  } catch (err) {
    console.warn(`observe maybeDrain: ${msg(err)}`);
    return null;
  }
}

// ---------- uso por modelo ----------

export function usageView(apiKey: string | null, day?: string) {
  const now = Date.now();
  const p = obsProps();
  const u = loadUsage(p);
  const today = dayKey(now, 'utc');
  const measured = totalCost(dayTotals(u, today, 'utc'));
  const or = apiKey ? read(() => keyInfo(apiKey)) : ({ ok: false, error: 'sem chave do OpenRouter' } as Read<never>);
  const informed = or.ok ? or.value.usage_daily : null;
  const shownDay = day ?? dayKey(now, 'sp');
  const table = Object.entries(dayTotals(u, shownDay, 'sp')).map(([model, c]) => ({ model, ...c })).sort((a, b) => b.cost - a.cost);
  return {
    chart: chart(u, now, 'sp', day),
    table,
    day: shownDay,
    queue: splitQueue(p).length,
    check: { dayUtc: today, measured, informed, diffPct: informed ? Math.round(((measured - informed) / informed) * 1000) / 10 : null, error: or.ok ? null : or.error, nota: 'o dia do OpenRouter é UTC: vira às 21:00 em São Paulo' },
  };
}

// ---------- limites ----------

function processesToday(): { triggerMsToday: number; count: number } {
  const start = new Date(Date.parse(`${dayKey(Date.now())}T00:00:00Z`)).toISOString();
  const url = `https://script.googleapis.com/v1/processes:listScriptProcesses?scriptId=${ScriptApp.getScriptId()}&scriptProcessFilter.startTime=${encodeURIComponent(start)}&pageSize=200`;
  const res = UrlFetchApp.fetch(url, { headers: auth(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`processes ${res.getResponseCode()}: ${res.getContentText().slice(0, 160)}`);
  const list: { processType?: string; duration?: string }[] = JSON.parse(res.getContentText()).processes ?? [];
  const ms = (d?: string) => Math.round(parseFloat(d ?? '0') * 1000);
  return { triggerMsToday: list.filter((x) => x.processType === 'TIME_DRIVEN').reduce((t, x) => t + ms(x.duration), 0), count: list.length };
}

function monitoringToday(): { requests: number } {
  if (!__GCP_NUMBER__) throw new Error('número do projeto GCP não embutido no build');
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
    drive: read(() => {
      const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', { headers: auth(), muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) throw new Error(`Drive about ${r.getResponseCode()}`);
      const q = JSON.parse(r.getContentText()).storageQuota ?? {};
      return { limit: q.limit ? Number(q.limit) : null, usage: Number(q.usage ?? 0) };
    }),
    key: apiKey ? read(() => keyInfo(apiKey)) : { ok: false, error: 'sem chave do OpenRouter' },
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
  const out = { items, at: now, trigger: triggerStatus() };
  cache().put('obs:limits', JSON.stringify(out), 600);
  return { ...out, cached: false };
}

export { keyCallsLast30min };

/** Uma linha por dia na aba "limites" da planilha de runs (idempotente). */
function dailyLimitsRow(sheetId: string) {
  const today = dayKey(Date.now(), 'sp');
  if (props().getProperty('LIMITS_ROW_DAY') === today) return;
  try {
    const meta = JSON.parse(UrlFetchApp.fetch(`${SHEETS}/${sheetId}?fields=sheets.properties.title`, { headers: auth(), muteHttpExceptions: true }).getContentText());
    const has = (meta.sheets ?? []).some((s: { properties: { title: string } }) => s.properties.title === 'limites');
    if (!has) {
      UrlFetchApp.fetch(`${SHEETS}/${sheetId}:batchUpdate`, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'limites' } } }] }), headers: auth(), muteHttpExceptions: true });
      UrlFetchApp.fetch(`${SHEETS}/${sheetId}/values/limites!A1:append?valueInputOption=RAW`, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ values: [['dia', 'item', 'usado', 'total', 'unidade', 'nível', 'fonte', 'status', 'nota']] }), headers: auth(), muteHttpExceptions: true });
    }
    const { items } = limitsNow(PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY'));
    const values = items.map((i) => [today, i.label, i.used ?? '', i.total ?? '', i.unit, i.level, i.source, i.status, i.note ?? '']);
    UrlFetchApp.fetch(`${SHEETS}/${sheetId}/values/limites!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ values }), headers: auth(), muteHttpExceptions: true });
    props().setProperty('LIMITS_ROW_DAY', today);
  } catch (err) {
    console.warn(`observe limites: ${msg(err)}`);
  }
}

export type { QueueEntry };

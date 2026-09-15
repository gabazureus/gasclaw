// Uso por modelo (ADR-018), núcleo puro: horas UTC × modelo (7 dias), dias UTC (90 dias), minutos :free (1 h).
// Gravado pelo lote do trace; lido pela tela (gráfico 7 dias / 24 h), pelo CLI e pelo painel de limites.

export type Cell = { req: number; tok: number; cost: number };
export type Bucket = Record<string, Cell>;
export type Usage = { h: Record<string, Bucket>; d: Record<string, Bucket>; m: Record<string, number> };
export type Rec = { at: number; model: string; tokens: number; cost: number };
export type Tz = 'utc' | 'sp';

const H = 3_600_000;
const D = 24 * H;
const SP = -3 * H; // America/Sao_Paulo: UTC−3, sem horário de verão desde 2019
const iso = (ms: number) => new Date(ms).toISOString();
const r8 = (x: number) => Math.round(x * 1e8) / 1e8;
const num = (x: unknown) => (typeof x === 'number' ? x : 0);
const offset = (tz: Tz) => (tz === 'sp' ? SP : 0);

export const hourKey = (ms: number) => iso(ms).slice(0, 13);
export const dayKey = (ms: number, tz: Tz = 'utc') => iso(ms + offset(tz)).slice(0, 10);
const dayStart = (day: string, tz: Tz) => Date.parse(`${day}T00:00:00Z`) - offset(tz);

export const emptyUsage = (): Usage => ({ h: {}, d: {}, m: {} });

type SpanLike = { name: string; startMs: number; data?: Record<string, unknown> };

/** Um registro por chamada ao modelo (span llm_call) de um run. */
export function recordsOf(run: { startedAt: number; spans: SpanLike[] }): Rec[] {
  return run.spans
    .filter((s) => s.name === 'llm_call' && s.data)
    .map((s) => ({ at: run.startedAt + s.startMs, model: String(s.data?.model ?? ''), tokens: num(s.data?.prompt_tokens) + num(s.data?.completion_tokens), cost: num(s.data?.cost) }));
}

function add(bucket: Bucket, model: string, c: Cell): Bucket {
  const o = bucket[model] ?? { req: 0, tok: 0, cost: 0 };
  return { ...bucket, [model]: { req: o.req + c.req, tok: o.tok + c.tok, cost: r8(o.cost + c.cost) } };
}

const merge = (a: Bucket, b: Bucket): Bucket => Object.entries(b).reduce((acc, [m, c]) => add(acc, m, c), a);

export function fold(u: Usage, recs: Rec[]): Usage {
  const out: Usage = { h: { ...u.h }, d: { ...u.d }, m: { ...u.m } };
  for (const r of recs) {
    const k = hourKey(r.at);
    out.h[k] = add(out.h[k] ?? {}, r.model, { req: 1, tok: r.tokens, cost: r.cost });
    if (r.model.endsWith(':free')) {
      const mk = iso(r.at).slice(0, 16);
      out.m[mk] = (out.m[mk] ?? 0) + 1;
    }
  }
  return out;
}

/** C6: horas com mais de 7 dias viram dia UTC; dias com mais de 90 somem; minutos com mais de 1 h somem. */
export function prune(u: Usage, now: number): Usage {
  const h: Usage['h'] = {};
  let d: Usage['d'] = { ...u.d };
  for (const [k, b] of Object.entries(u.h)) {
    if (Date.parse(`${k}:00:00Z`) < now - 7 * D) d = { ...d, [k.slice(0, 10)]: merge(d[k.slice(0, 10)] ?? {}, b) };
    else h[k] = b;
  }
  d = Object.fromEntries(Object.entries(d).filter(([k]) => Date.parse(`${k}T00:00:00Z`) >= now - 90 * D));
  const m = Object.fromEntries(Object.entries(u.m).filter(([k]) => Date.parse(`${k}:00Z`) >= now - H));
  return { h, d, m };
}

/** C3: o dia é a soma das 24 horas. `utc` vira à meia-noite UTC (21:00 em São Paulo), como o usage_daily do OpenRouter. */
export function dayTotals(u: Usage, day: string, tz: Tz): Bucket {
  const start = dayStart(day, tz);
  let out: Bucket = {};
  for (let i = 0; i < 24; i++) out = merge(out, u.h[hourKey(start + i * H)] ?? {});
  return Object.keys(out).length ? out : (u.d[day] ?? {}); // dia já dobrado: só existe em UTC
}

export const totalCost = (b: Bucket) => r8(Object.values(b).reduce((t, c) => t + c.cost, 0));
export const totalReq = (b: Bucket, pred: (model: string) => boolean = () => true) => Object.entries(b).reduce((t, [m, c]) => t + (pred(m) ? c.req : 0), 0);

/** Os 5 modelos mais caros com nome; o resto vira "outros". */
export function topModels(totals: Bucket): string[] {
  const names = Object.entries(totals).sort((a, b) => b[1].cost - a[1].cost || b[1].req - a[1].req).map(([m]) => m);
  return names.length > 5 ? [...names.slice(0, 5), 'outros'] : names;
}

export const freePerMinuteMax = (u: Usage) => Math.max(0, ...Object.values(u.m));

export type Bar = { key: string; total: number; parts: Record<string, number>; day?: string };

/** Gráfico: 7 dias (hoje por último) ou, com `day`, as 24 horas locais daquele dia. */
export function chart(u: Usage, now: number, tz: Tz, day?: string): { bars: Bar[]; series: string[]; tz: Tz; day: string | null } {
  const buckets: { key: string; b: Bucket; day?: string }[] = day
    ? Array.from({ length: 24 }, (_, i) => ({ key: `${String(i).padStart(2, '0')}h`, b: u.h[hourKey(dayStart(day, tz) + i * H)] ?? {} }))
    : Array.from({ length: 7 }, (_, i) => {
        const k = dayKey(now - (6 - i) * D, tz);
        return { key: k, day: k, b: dayTotals(u, k, tz) };
      });
  const all = buckets.reduce((acc, x) => merge(acc, x.b), {} as Bucket);
  const series = topModels(all);
  const named = new Set(series.filter((s) => s !== 'outros'));
  const bars = buckets.map(({ key, b, day: dk }) => {
    const parts: Record<string, number> = {};
    for (const [m, c] of Object.entries(b)) {
      const s = named.has(m) ? m : 'outros';
      parts[s] = r8((parts[s] ?? 0) + c.cost);
    }
    return { key, total: totalCost(b), parts, ...(dk ? { day: dk } : {}) };
  });
  return { bars, series, tz, day: day ?? null };
}

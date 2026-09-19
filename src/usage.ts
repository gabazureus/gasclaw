// Uso por modelo (ADR-018), núcleo puro: horas UTC × modelo (7 dias), dias UTC (90 dias), minutos :free (1 h).
// Gravado pelo lote do trace; lido pela tela (gráfico 7 dias / 24 h), pelo CLI e pelo painel de limites.

export type Cell = { req: number; tok: number; cost: number };
export type Bucket = Record<string, Cell>;
export type Usage = { h: Record<string, Bucket>; d: Record<string, Bucket>; m: Record<string, number>; mo: Record<string, Bucket> };
export type Range = '7d' | '30d' | 'months';
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
export const monthKey = (ms: number) => iso(ms).slice(0, 7);
/** O mes `back` meses atras, sem depender de quantos dias tem cada um. */
const monthBack = (ms: number, back: number) => {
  const d0 = new Date(ms);
  return monthKey(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - back, 1));
};
export const dayKey = (ms: number, tz: Tz = 'utc') => iso(ms + offset(tz)).slice(0, 10);
const dayStart = (day: string, tz: Tz) => Date.parse(`${day}T00:00:00Z`) - offset(tz);

export const emptyUsage = (): Usage => ({ h: {}, d: {}, m: {}, mo: {} });

export type RunsOfDay = { n: number; longest: number };
const PROP_MAX = 8_000; // Script Properties: 9 KB por valor

/** Lê as Properties USAGE:* (inclusive as partes `#n` de um grupo grande). */
export function loadUsage(p: Record<string, string>): Usage {
  const u = emptyUsage();
  for (const [k, v] of Object.entries(p)) {
    const target = k.startsWith('USAGE:h:') ? u.h : k.startsWith('USAGE:d:') ? u.d : k.startsWith('USAGE:mo:') ? u.mo : k === 'USAGE:m' ? u.m : null;
    if (!target) continue;
    try {
      Object.assign(target, JSON.parse(v));
    } catch {
      console.warn(`uso: Property ${k} corrompida, ignorada`); // não trava o lote nem o painel
    }
  }
  return u;
}

/** Properties do uso: horas por dia UTC, dias por mês (em partes `#n` de até 8 KB) e runs por dia (90 dias, vindos de `prev`). */
export function usageProps(u: Usage, runsByDay: Record<string, RunsOfDay>, now: number, prev: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = { 'USAGE:m': JSON.stringify(u.m) };
  const group = (src: Record<string, Bucket>, prefix: string, cut: number) => {
    const g: Record<string, [string, Bucket][]> = {};
    for (const [k, b] of Object.entries(src)) (g[k.slice(0, cut)] ??= []).push([k, b]);
    for (const [gk, items] of Object.entries(g)) {
      let part: Record<string, Bucket> = {};
      let n = 0;
      const flush = () => {
        out[`${prefix}${gk}${n ? `#${n}` : ''}`] = JSON.stringify(part);
        n++;
        part = {};
      };
      for (const [k, b] of items) {
        if (Object.keys(part).length && JSON.stringify({ ...part, [k]: b }).length > PROP_MAX) flush();
        part[k] = b;
      }
      flush();
    }
  };
  group(u.h, 'USAGE:h:', 10);
  group(u.d, 'USAGE:d:', 7);
  group(u.mo, 'USAGE:mo:', 4); // agrupado por ano: 24 meses x N modelos nao cabem num valor de 9 KB
  const oldest = dayKey(now - 90 * D);
  for (const [k, v] of Object.entries(prev)) if (k.startsWith('USAGE:r:') && k.slice(8) >= oldest) out[k] = v;
  for (const [day, r] of Object.entries(runsByDay)) out[`USAGE:r:${day}`] = JSON.stringify(r);
  return out;
}

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
  const out: Usage = { h: { ...u.h }, d: { ...u.d }, m: { ...u.m }, mo: { ...u.mo } };
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
  // O dia com mais de 90 dias nao some mais: ele e dobrado no mes. Sem isto o grafico por meses so teria
  // como mostrar tres meses PARA SEMPRE — e o quarto mes desapareceria sem aviso, o que e pior que nao ter
  // o grafico. O mes guarda so o agregado (modelo x req/tok/custo), que e o que o grafico precisa.
  const corte = dayKey(now - 90 * D);
  let mo = { ...u.mo };
  for (const [k, b] of Object.entries(d)) if (k < corte) mo = { ...mo, [k.slice(0, 7)]: merge(mo[k.slice(0, 7)] ?? {}, b) };
  d = Object.fromEntries(Object.entries(d).filter(([k]) => k >= corte));
  const mesCorte = monthKey(now - 730 * D); // 24 meses
  mo = Object.fromEntries(Object.entries(mo).filter(([k]) => k >= mesCorte));
  const m = Object.fromEntries(Object.entries(u.m).filter(([k]) => Date.parse(`${k}:00Z`) >= now - H));
  return { h, d, m, mo };
}

/** C3: o dia é a soma das 24 horas. `utc` vira à meia-noite UTC (21:00 em São Paulo), como o usage_daily do OpenRouter. */
export function dayTotals(u: Usage, day: string, tz: Tz): Bucket {
  const start = dayStart(day, tz);
  let out: Bucket = {};
  for (let i = 0; i < 24; i++) out = merge(out, u.h[hourKey(start + i * H)] ?? {});
  return Object.keys(out).length ? out : (u.d[day] ?? {}); // dia já dobrado: só existe em UTC
}

/**
 * Totais de um mes: os dias que ainda existem (somados hora a hora) mais o que ja foi dobrado em `mo`.
 *
 * Os dois nunca se sobrepoem — `prune` dobra o dia no mes NO MESMO passo em que o tira de `d` —, entao somar
 * os dois nao conta duas vezes. O dia dobrado tem chave UTC e o dia somado respeita o fuso pedido; a
 * diferenca fica na virada do mes, e so para dado com mais de 90 dias.
 */
export function monthTotals(u: Usage, month: string, tz: Tz): Bucket {
  let out: Bucket = { ...(u.mo[month] ?? {}) };
  for (let i = 1; i <= 31; i++) {
    const day = `${month}-${String(i).padStart(2, '0')}`;
    if (Number.isNaN(Date.parse(`${day}T00:00:00Z`))) continue; // 31 de fevereiro nao existe
    out = merge(out, dayTotals(u, day, tz));
  }
  return out;
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

const DIAS: Record<Range, number> = { '7d': 7, '30d': 30, months: 0 };

/**
 * Grafico: 7 ou 30 dias (hoje por ultimo), 12 meses, ou — com `day` — as 24 horas locais daquele dia.
 *
 * A serie e escolhida sobre a FAIXA INTEIRA, nao barra a barra: assim uma cor significa o mesmo modelo em
 * todas as barras, que e o que faz a legenda e o passar do mouse serem lidos juntos.
 */
export function chart(u: Usage, now: number, tz: Tz, day?: string, range: Range = '7d'): { bars: Bar[]; series: string[]; tz: Tz; day: string | null; range: Range } {
  const dias = DIAS[range] ?? 7;
  const buckets: { key: string; b: Bucket; day?: string }[] = day
    ? Array.from({ length: 24 }, (_, i) => ({ key: `${String(i).padStart(2, '0')}h`, b: u.h[hourKey(dayStart(day, tz) + i * H)] ?? {} }))
    : range === 'months'
      ? Array.from({ length: 12 }, (_, i) => {
          const k = monthBack(now, 11 - i);
          return { key: k, b: monthTotals(u, k, tz) };
        })
      : Array.from({ length: dias }, (_, i) => {
          const k = dayKey(now - (dias - 1 - i) * D, tz);
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
  return { bars, series, tz, day: day ?? null, range: day ? '7d' : range };
}

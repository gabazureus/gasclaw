import { describe, expect, test } from 'vitest';
import { chart, dayTotals, fold, freePerMinuteMax, prune, recordsOf, topModels, type Usage } from '../src/usage';

const H = 3_600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 8, 15, 12, 30); // 2026-09-15 12:30 UTC = 09:30 em São Paulo
const rec = (at: number, model: string, cost = 0.01, tokens = 100) => ({ at, model, cost, tokens });

describe('recordsOf (spans llm_call de um run)', () => {
  test('um registro por chamada ao modelo, com início absoluto', () => {
    const run = { startedAt: T0, spans: [{ name: 'resolve_agent', startMs: 0, ms: 5 }, { name: 'llm_call', startMs: 10, ms: 900, data: { model: 'a/x', prompt_tokens: 7, completion_tokens: 3, cost: 0.002 } }] };
    expect(recordsOf(run)).toEqual([{ at: T0 + 10, model: 'a/x', tokens: 10, cost: 0.002 }]);
  });
});

describe('fold', () => {
  test('agrega por hora UTC × modelo: requisições, tokens e custo', () => {
    const u = fold({ h: {}, d: {}, m: {} }, [rec(T0, 'a'), rec(T0 + 60_000, 'a'), rec(T0, 'b:free', 0, 5)]);
    expect(u.h['2026-09-15T12']).toEqual({ a: { req: 2, tok: 200, cost: 0.02 }, 'b:free': { req: 1, tok: 5, cost: 0 } });
  });
  test('não muta a entrada e soma em cima do que já existia', () => {
    const base: Usage = { h: { '2026-09-15T12': { a: { req: 1, tok: 1, cost: 1 } } }, d: {}, m: {} };
    const u = fold(base, [rec(T0, 'a', 1, 1)]);
    expect(base.h['2026-09-15T12'].a.req).toBe(1);
    expect(u.h['2026-09-15T12'].a).toEqual({ req: 2, tok: 2, cost: 2 });
  });
  test('conta requisições :free por minuto (para o limite de 20/min)', () => {
    const u = fold({ h: {}, d: {}, m: {} }, [rec(T0, 'x:free'), rec(T0 + 1000, 'x:free'), rec(T0 + 61_000, 'x:free'), rec(T0, 'pago')]);
    expect(freePerMinuteMax(u)).toBe(2);
  });
});

describe('prune (C6)', () => {
  test('horas com mais de 7 dias viram dia; dias com mais de 90 somem; minutos com mais de 1 h somem', () => {
    const old = T0 - 8 * D;
    let u = fold({ h: {}, d: {}, m: {} }, [rec(old, 'a'), rec(old + H, 'a'), rec(T0, 'a'), rec(T0 - 91 * D, 'z'), rec(T0 - 2 * H, 'y:free')]);
    u = prune(u, T0);
    expect(Object.keys(u.h)).toEqual(['2026-09-15T12', '2026-09-15T10']);
    expect(u.d['2026-09-07']).toEqual({ a: { req: 2, tok: 200, cost: 0.02 } });
    expect(Object.keys(u.d)).not.toContain('2026-06-16');
    expect(Object.keys(u.m)).toEqual([]);
  });
});

describe('dayTotals (C3: o dia é a soma das 24 horas)', () => {
  const recs = Array.from({ length: 48 }, (_, i) => rec(Date.UTC(2026, 8, 14, 0) + i * H, i % 2 ? 'a' : 'b', 0.01, 10));
  const u = fold({ h: {}, d: {}, m: {} }, recs);
  test('dia UTC (vira às 21:00 em São Paulo, como o usage_daily do OpenRouter) = soma das horas UTC', () => {
    expect(dayTotals(u, '2026-09-14', 'utc')).toEqual({ a: { req: 12, tok: 120, cost: 0.12 }, b: { req: 12, tok: 120, cost: 0.12 } });
  });
  test('dia de São Paulo vai das 03:00 UTC às 02:59 UTC do dia seguinte', () => {
    const t = dayTotals(u, '2026-09-14', 'sp');
    expect((t.a?.req ?? 0) + (t.b?.req ?? 0)).toBe(24);
  });
  test('dia antigo (já dobrado em d) continua somando igual', () => {
    expect(dayTotals({ h: {}, d: { '2026-09-01': { a: { req: 3, tok: 3, cost: 3 } } }, m: {} }, '2026-09-01', 'utc')).toEqual({ a: { req: 3, tok: 3, cost: 3 } });
  });
});

describe('topModels e chart', () => {
  test('5 modelos mais caros com nome; o resto vira "outros"', () => {
    const totals = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((m, i) => [m, { req: 1, tok: 1, cost: i + 1 }]));
    expect(topModels(totals)).toEqual(['g', 'f', 'e', 'd', 'c', 'outros']);
  });
  test('7 dias: uma barra por dia (hoje por último) com segmentos por modelo', () => {
    const u = fold({ h: {}, d: {}, m: {} }, [rec(T0, 'a', 0.5), rec(T0 - D, 'b', 0.25)]);
    const c = chart(u, T0, 'sp');
    expect(c.bars).toHaveLength(7);
    expect(c.bars[6]).toMatchObject({ key: '2026-09-15', total: 0.5 });
    expect(c.bars[5]).toMatchObject({ key: '2026-09-14', total: 0.25 });
    expect(c.series).toEqual(['a', 'b']);
  });
  test('zoom de um dia: 24 barras por hora local', () => {
    const u = fold({ h: {}, d: {}, m: {} }, [rec(T0, 'a', 0.5)]);
    const c = chart(u, T0, 'sp', '2026-09-15');
    expect(c.bars).toHaveLength(24);
    expect(c.bars[9]).toMatchObject({ key: '09h', total: 0.5 });
  });
});

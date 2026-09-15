import { describe, expect, test } from 'vitest';
import { buildLimits, level, nextUtcMidnight, type LimitsInput } from '../src/limits';

const NOW = Date.UTC(2026, 8, 15, 12, 0);

describe('level', () => {
  test('verde < 70%, amarelo < 90%, vermelho ≥ 90%; sem total = sem limite', () => {
    expect([level(0, 100), level(69, 100), level(70, 100), level(89, 100), level(90, 100), level(150, 100), level(5, null)]).toEqual(['verde', 'verde', 'amarelo', 'amarelo', 'vermelho', 'vermelho', 'sem limite']);
  });
});

test('nextUtcMidnight: o dia do OpenRouter vira à meia-noite UTC (21:00 em São Paulo)', () => {
  expect(new Date(nextUtcMidnight(NOW)).toISOString()).toBe('2026-09-16T00:00:00.000Z');
});

const input = (over: Partial<LimitsInput> = {}): LimitsInput => ({
  now: NOW,
  drive: { ok: true, value: { limit: 100, usage: 75 } },
  key: { ok: true, value: { limit: null, usage: 3.2, usage_daily: 0.4, is_free_tier: false } },
  measured: { freeToday: 800, freePerMinuteMax: 4, urlFetchToday: 1200, tokensToday: 5000, costToday: 0.39, longestMs: 42_000, propsBytes: 50_000 },
  processes: { ok: false, error: 'aguardando autorização' },
  mail: { ok: false, error: 'aguardando autorização' },
  monitoring: { ok: false, error: 'aguardando autorização' },
  triggers: { ok: false, error: 'aguardando autorização' },
  ...over,
});
const byId = (items: ReturnType<typeof buildLimits>) => Object.fromEntries(items.map((i) => [i.id, i]));

describe('buildLimits', () => {
  test('selo por fonte: informado pelo Google/OpenRouter × medido pelo gasclaw', () => {
    const l = byId(buildLimits(input()));
    expect(l.drive).toMatchObject({ used: 75, total: 100, level: 'amarelo', source: 'google', status: 'ok' });
    expect(l.urlfetch).toMatchObject({ used: 1200, total: 100_000, source: 'gasclaw', level: 'verde' });
    expect(l.props).toMatchObject({ used: 50_000, total: 500_000, source: 'gasclaw' });
    expect(l.runtime).toMatchObject({ used: 42_000, total: 360_000, source: 'gasclaw' });
  });
  test('requisições :free: 1000/dia com créditos, 50/dia sem; 20/min; reset à meia-noite UTC', () => {
    expect(byId(buildLimits(input())).freeDay).toMatchObject({ used: 800, total: 1000, level: 'amarelo', source: 'gasclaw', reset: '2026-09-16T00:00:00.000Z' });
    const semCredito = byId(buildLimits(input({ key: { ok: true, value: { limit: null, usage: 0, usage_daily: 0, is_free_tier: true } } })));
    expect(semCredito.freeDay).toMatchObject({ total: 50, level: 'vermelho' });
    expect(semCredito.freeMin).toMatchObject({ used: 4, total: 20 });
  });
  test('gasto do dia informado pelo OpenRouter, com o medido ao lado', () => {
    expect(byId(buildLimits(input())).orDaily).toMatchObject({ used: 0.4, total: null, source: 'openrouter', level: 'sem limite', note: 'medido pelo gasclaw: US$ 0.39' });
  });
  test('fontes que dependem da reautorização aparecem como pendentes, sem quebrar', () => {
    const l = byId(buildLimits(input()));
    for (const id of ['processes', 'mail', 'monitoring', 'triggers']) expect(l[id]).toMatchObject({ status: 'pendente', level: 'sem limite' });
  });
  test('falha de uma fonte que já funcionava vira erro só nela', () => {
    const l = byId(buildLimits(input({ drive: { ok: false, error: 'Drive 500' } })));
    expect(l.drive).toMatchObject({ status: 'erro', note: 'Drive 500' });
    expect(l.urlfetch.status).toBe('ok');
  });
  test('e-mails restantes do Google viram usados = 1500 − restantes', () => {
    expect(byId(buildLimits(input({ mail: { ok: true, value: 1400 } }))).mail).toMatchObject({ used: 100, total: 1500, source: 'google', status: 'ok' });
  });
});

import { describe, expect, test } from 'vitest';
import { dayKey, loadUsage, usageProps, type Bucket, type Usage } from '../src/usage';

const NOW = Date.UTC(2026, 8, 30, 12);
const bucket = (n: number): Bucket => Object.fromEntries(Array.from({ length: n }, (_, i) => [`provedor-${i}/modelo-bem-comprido-${i}:free`, { req: 123, tok: 456789, cost: 0.12345678 }]));

function month(models: number): Usage {
  const u: Usage = { h: {}, d: {}, m: {} };
  for (let d = 1; d <= 31; d++) u.d[`2026-08-${String(d).padStart(2, '0')}`] = bucket(models);
  for (let h = 0; h < 24; h++) u.h[`2026-09-30T${String(h).padStart(2, '0')}`] = bucket(models);
  return u;
}

describe('usageProps: uso em Script Properties sem estourar 9 KB por valor', () => {
  test('31 dias e 24 horas com 8 modelos: nenhum valor passa de 9 KB e a leitura devolve o mesmo uso', () => {
    const u = month(8);
    const out = usageProps(u, {}, NOW);
    for (const [k, v] of Object.entries(out)) expect(k.length + v.length, k).toBeLessThan(9000);
    expect(loadUsage(out)).toEqual(u);
  });

  test('contagem de runs por dia entra e a de mais de 90 dias sai (as antigas viram chaves a apagar)', () => {
    const old = { 'USAGE:r:2026-01-01': '{"n":1,"longest":1}', 'USAGE:d:2026-01': '{}' };
    const out = usageProps({ h: {}, d: {}, m: {} }, { '2026-09-30': { n: 2, longest: 9 } }, NOW, old);
    expect(out['USAGE:r:2026-09-30']).toBe('{"n":2,"longest":9}');
    expect(Object.keys(old).filter((k) => !(k in out))).toEqual(['USAGE:r:2026-01-01', 'USAGE:d:2026-01']);
  });

  test('uma parte corrompida não derruba a leitura do resto do uso', () => {
    const u = loadUsage({ 'USAGE:h:2026-09-15': '{quebrado', 'USAGE:m': '{"2026-09-15T10:00":2}' });
    expect(u.m).toEqual({ '2026-09-15T10:00': 2 });
    expect(u.h).toEqual({});
  });
});

test('dia de São Paulo vira às 03:00 UTC (01:30 UTC ainda é o dia anterior em SP)', () => {
  expect(dayKey(Date.UTC(2026, 8, 15, 1, 30), 'sp')).toBe('2026-09-14');
  expect(dayKey(Date.UTC(2026, 8, 15, 3, 0), 'sp')).toBe('2026-09-15');
  expect(dayKey(Date.UTC(2026, 8, 15, 1, 30), 'utc')).toBe('2026-09-15');
});

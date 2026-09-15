import { afterEach, beforeEach, expect, test, vi } from 'vitest';

let props: Record<string, string>;

beforeEach(() => {
  props = {};
  const store = {
    getProperty: (k: string) => props[k] ?? null,
    setProperty: (k: string, v: string) => void (props[k] = v),
    getProperties: () => ({ ...props }),
    deleteProperty: (k: string) => void delete props[k],
  };
  const cache = { get: () => null, put: () => undefined, remove: () => undefined, removeAll: () => undefined, getAll: () => ({}) };
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => store });
  vi.stubGlobal('CacheService', { getScriptCache: () => cache });
  vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) });
  vi.stubGlobal('Utilities', { formatDate: () => '20260915-120000', getUuid: () => 'abcd-efgh' });
});
afterEach(() => vi.unstubAllGlobals());

test('C8: o custo do begin (trava + cache da lista ao vivo) vira o passo trace_begin, sem buraco antes do 1º passo', async () => {
  // relógio falso: startRun em 1000; o toCache(listed) com trava termina em 2087 (medido na v25: 1.087 ms de buraco).
  // cada step lê o relógio 3 vezes (início, fim do span, lastEnd); mark 1; end 1.
  const clock = [1000, 2087, 2087, 2427, 2427, 2427, 6733, 6733, 6733, 6733];
  let i = 0;
  const now = () => clock[Math.min(i++, clock.length - 1)];
  const { begin } = await import('../src/runlog');
  const t = begin('test', { question: 'oi' }, { now });
  t.step('resolve_agent', () => 'ok');
  t.step('llm_call', () => 'ok');
  t.mark('reply');
  const run = t.end({ answer: 'ok' });
  expect(run.spans[0]).toMatchObject({ name: 'trace_begin', startMs: 0, ms: 1087 });
  expect(run.spans.map((s) => s.name)).toEqual(['trace_begin', 'resolve_agent', 'llm_call', 'reply']);
  const sum = run.spans.reduce((a, s) => a + s.ms, 0);
  expect(sum / (run.ms ?? 1)).toBeGreaterThanOrEqual(0.9);
});

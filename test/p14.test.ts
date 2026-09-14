import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { SHEET_NAME, summarizeP14, type P14Obs } from '../poc/p14-trace/summary';

const obs = (): P14Obs => ({
  bench: { c1: { runs: 50, p95Ms: 1200, maxMs: 1400 }, c3: { answered: true, threw: null }, c4: { idempotent: true, sheet: SHEET_NAME, folder: 'runs' }, c9: { leaks: 0, rowFound: true, fileFound: true } },
  verify: { pass: true, per: [1, 2, 3, 4, 5].map((i) => ({ tag: `t${i}`, rows: 1, own: true, status: 'ok' })) },
  c6: { liveS: 3.1, sheetS: 4.2 },
  poll: { calls: 60, avgMs: 20, maxMs: 80, urlFetchPerCall: 0 },
  hidesOnHidden: true,
  real: [{ runId: 'r1', spans: ['resolve_agent', 'llm_call', 'reply'], coverage: 0.97 }],
  traceText: 'r1 · test · ok\n├─ resolve_agent 10 ms\n├─ llm_call 900 ms\n└─ reply 5 ms',
});

describe('summarizeP14', () => {
  test('tudo dentro dos limites passa', () => expect(summarizeP14(obs()).pass).toBe(true));
  test('C1 falha com p95 ≥ 1,5 s', () => {
    const o = obs();
    o.bench.c1.p95Ms = 1500;
    expect(summarizeP14(o).c1.pass).toBe(false);
  });
  test('C6 falha se a planilha demorar mais de 5 s', () => {
    const o = obs();
    o.c6.sheetS = 6;
    expect(summarizeP14(o).c6.pass).toBe(false);
  });
  test('C8 falha sem o passo reply ou com cobertura fora de ±10%', () => {
    const o = obs();
    o.real = [{ runId: 'r', spans: ['resolve_agent', 'llm_call'], coverage: 1 }];
    expect(summarizeP14(o).c8.pass).toBe(false);
    o.real = [{ runId: 'r', spans: ['resolve_agent', 'llm_call', 'reply'], coverage: 0.85 }];
    expect(summarizeP14(o).c8.pass).toBe(false);
  });
  test('C9 falha com qualquer vazamento do canário', () => {
    const o = obs();
    o.bench.c9.leaks = 1;
    expect(summarizeP14(o).c9.pass).toBe(false);
  });
});

test('a tela para o polling quando a aba fica oculta (C7)', () => {
  const html = readFileSync('src/settings.html', 'utf8');
  expect(html).toContain("addEventListener('visibilitychange'");
  expect(html).toMatch(/if \(document\.hidden\) return;/);
  expect(html).toContain('setInterval(poll, 5000)');
});

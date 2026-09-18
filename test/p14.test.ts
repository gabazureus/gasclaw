import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { SHEET_NAME, summarizeP14, type P14Obs } from '../poc/p14-trace/summary';

const obs = (): P14Obs => ({
  bench: { c1: { runs: 50, p95Ms: 400, maxMs: 700 }, c4: { idempotent: true, sheet: SHEET_NAME, folder: 'runs' }, c9: { leaks: 0, rowFound: true, fileFound: true } },
  failsafe: { answered: true, drainFailed: true, queueKept: true, drainedAfterRestore: true },
  verify: { pass: true, per: [1, 2, 3, 4, 5].map((i) => ({ tag: `t${i}`, rows: 1, own: true, status: 'ok' })) },
  c6: { liveS: 3.1, sheetS: 64, via: 'gatilho' },
  poll: { calls: 60, avgMs: 20, maxMs: 80, urlFetchPerCall: 0 },
  hidesOnHidden: true,
  real: [{ runId: 'r1', spans: ['resolve_agent', 'llm_call', 'reply'], coverage: 0.97 }],
  traceText: 'r1 · test · ok\n├─ resolve_agent 10 ms\n├─ llm_call 900 ms\n└─ reply 5 ms',
  burst: { runs: 20, runsMs: 9000, enfileirados: 20, drained: 20, drainMs: 6000, linhas: 20, sobraNaFila: 0 },
  drainbench: { vazioMaxMs: 400, gatilho: 'active' },
});

describe('summarizeP14 (lote de 1 min)', () => {
  test('tudo dentro dos limites passa', () => expect(summarizeP14(obs()).pass).toBe(true));
  test('C1 falha com p95 ≥ 1,5 s no turno', () => {
    const o = obs();
    o.bench.c1.p95Ms = 1500;
    expect(summarizeP14(o).c1.pass).toBe(false);
  });
  test('C3 falha se a fila se perder quando a planilha falha', () => {
    const o = obs();
    o.failsafe.queueKept = false;
    expect(summarizeP14(o).c3.pass).toBe(false);
  });
  test('C6: tela ≤ 5 s e planilha ≤ 70 s', () => {
    const o = obs();
    o.c6.sheetS = 70;
    expect(summarizeP14(o).c6.pass).toBe(true);
    o.c6.sheetS = 71;
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
  test('C11 falha se sobrar run na fila ou faltar linha', () => {
    const o = obs();
    o.burst.sobraNaFila = 1;
    expect(summarizeP14(o).c11.pass).toBe(false);
  });
  test('C12: projeção diária do gatilho (1440 lotes vazios + 200 runs) dentro das 6 h', () => {
    expect(summarizeP14(obs()).c12).toMatchObject({ pass: true, projecaoMinPorDia: 11 });
    const o = obs();
    o.drainbench.vazioMaxMs = 15_500;
    expect(summarizeP14(o).c12.pass).toBe(false);
  });
});

// C7 continua valendo, agora mais forte: com o menu (P21) a Observabilidade também pode estar
// fora da tela sem a aba estar oculta, e nesse caso o polling não deve sair do lugar.
test('a tela para o polling quando a aba fica oculta ou a Observabilidade sai da vista (C7)', () => {
  const html = readFileSync('src/settings.html', 'utf8');
  expect(html).toContain("addEventListener('visibilitychange'");
  expect(html).toMatch(/document\.hidden[\s\S]{0,60}pg-observability/); // as duas condições, em qualquer ordem
  expect(html).toMatch(/if \(!\w+\(\)\) return;/); // nada de polling com a seção fora da vista
  expect(html).toContain('EVERY = { live: 5000, cost: 60000, limits: 60000, batch: 60000 }');
  expect(html).toMatch(/setInterval\(\(\) => \{ if \(\w+\(\)\) LOADERS\[tab\]\(\); \}/);
});

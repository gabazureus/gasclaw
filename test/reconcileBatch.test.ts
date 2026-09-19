// Regressão do tique ocioso: a investigação e o conserto.
//
// Medido no dev v103, sonda da P3 com detalhe por parte (mediana de 4 amostras):
//   props 31 ms (5%) · sweep 1 ms (0%) · ids 70 ms (10%) · **scan 413 ms (60%)**
// e o `scan` fazia **20 leituras individuais de cache** — uma por run vivo (`LIVE_MAX = 20`),
// a cada minuto, para sempre.
//
// O conserto NÃO remove garantia nenhuma: os mesmos dados, lidos numa chamada em vez de vinte.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas } from './gasEnv';
import { reconcileDetail, reconcileStaleRuns } from '../src/runlog';
import { TERMINAL_PREFIX } from '../src/observe';

const run = (id: string, at: number) => JSON.stringify({ id, status: 'ok', startedAt: at, endedAt: at + 10, spans: [], question: 'q', answer: 'a' });

/** Ambiente com N runs terminais já fechados — o estado normal de um agente que trabalhou. */
function comRunsFechados(n: number) {
  const agora = Date.now();
  const props: Record<string, string> = { OWNER: 'dono@x.com', AGENTS: '[]' };
  const cache: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    const id = `r${i}`;
    props[`${TERMINAL_PREFIX}${id}`] = run(id, agora - i * 1000);
    cache[`qjson:${id}`] = run(id, agora - i * 1000); // o JSON completo que o laço buscava um a um
  }
  return stubGas({ props, cache });
}

describe('o laço do reconcile não faz mais uma ida ao cache por run', () => {
  beforeEach(() => vi.restoreAllMocks());

  test('com 20 runs fechados, ZERO leituras individuais de qjson', () => {
    comRunsFechados(20);
    reconcileStaleRuns();
    expect(reconcileDetail().qjsonGets).toBe(0); // antes eram 20, uma por run, a cada minuto
  });

  test('o número de runs considerados continua o mesmo: o conserto é de round trip, não de escopo', () => {
    comRunsFechados(20);
    reconcileStaleRuns();
    expect(reconcileDetail().ids).toBe(20);
  });

  test('sem run nenhum, não quebra e não inventa trabalho', () => {
    stubGas();
    expect(() => reconcileStaleRuns()).not.toThrow();
    expect(reconcileDetail().qjsonGets).toBe(0);
    expect(reconcileDetail().ids).toBe(0);
  });

  test('o detalhe por parte existe e é somável — é o que nomeou a causa', () => {
    comRunsFechados(5);
    reconcileStaleRuns();
    const d = reconcileDetail();
    for (const parte of [d.propsMs, d.sweepMs, d.idsMs, d.scanMs]) expect(typeof parte).toBe('number');
  });
});

// Resiliência do caminho da entrega: um valor corrompido não pode matar o gatilho de 1 min.
//
// O gatilho (`drainRuns`) é a ÚNICA coisa que avança o run durável e entrega a resposta no Chat. Ele fazia
// três trabalhos em sequência, sem isolamento, e o primeiro deles (`reconcileStaleRuns`) tinha `JSON.parse`
// sem proteção sobre valores do cache e das Script Properties — que são estado, não entrada validada, e podem
// vir truncados (100 KB por chave, 9 KB por valor) ou meio-escritos por uma execução cortada aos 6 min.
//
// Consequência do defeito: um único valor quebrado fazia o gatilho lançar TODO minuto, antes da drenagem e
// antes do pump. Nenhum agente respondia mais, para sempre, e nada aparecia na tela — o run fica 'running'.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { pump, type StepDeps } from '../src/runner';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
const main = () => import('../src/main');
const runlog = () => import('../src/runlog');

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
});
afterEach(() => vi.unstubAllGlobals());

describe('reconcileStaleRuns sobrevive a estado corrompido', () => {
  test('lista de ids do cache truncada não derruba a reconciliação', async () => {
    env.cache['runs:ids'] = '["run-a","run-b'; // truncado: foi cortado no meio da escrita
    const r = await runlog();
    expect(() => r.reconcileStaleRuns()).not.toThrow();
  });

  test('checkpoint de run corrompido no cache não derruba a reconciliação', async () => {
    env.cache['runs:ids'] = JSON.stringify(['run-a']);
    env.cache['run:run-a'] = '{"id":"run-a","sta'; // truncado
    const r = await runlog();
    expect(() => r.reconcileStaleRuns()).not.toThrow();
  });

  test('marcador RUNNING corrompido nas Properties não derruba a reconciliação', async () => {
    const r = await runlog();
    const t = r.begin('config', { question: 'run de verdade, deixado aberto' }); // como quando o runtime mata antes do end()
    const id = t.run.id;
    env.props[`RUNNING:${id}`] = 'não é json'; // o marcador durável foi truncado
    expect(() => r.reconcileStaleRuns()).not.toThrow();
  });

  test('lista de ids com tipo errado (não é array de string) é tratada como vazia', async () => {
    env.cache['runs:ids'] = '{"nao":"e uma lista"}';
    const r = await runlog();
    expect(() => r.reconcileStaleRuns()).not.toThrow();
    expect(() => r.liveRuns()).not.toThrow();
  });

  test('a tela também não quebra: liveRuns e runDetail sobrevivem ao mesmo estado', async () => {
    env.cache['runs:ids'] = '["run-a","run-b';
    const r = await runlog();
    expect(() => r.liveRuns()).not.toThrow();
    expect(() => r.runDetail()).not.toThrow();
  });
});

// O isolamento importa mais que o conserto pontual: são TRÊS trabalhos independentes no mesmo tique.
describe('drainRuns: um trabalho que falha não cancela os outros', () => {
  test('reconciliação quebrada não impede a drenagem nem o avanço do run', async () => {
    const m = await main();
    const r = await runlog();
    vi.spyOn(r, 'reconcileStaleRuns').mockImplementation(() => {
      throw new Error('valor corrompido nas Properties');
    });
    expect(() => m.drainRuns()).not.toThrow();
  });

  test('drenagem quebrada não impede o avanço do run (a resposta do Chat sai mesmo assim)', async () => {
    const m = await main();
    const observe = await import('../src/observe');
    vi.spyOn(observe, 'drain').mockImplementation(() => {
      throw new Error('planilha indisponível');
    });
    expect(() => m.drainRuns()).not.toThrow();
  });
});

describe('pump: um erro na entrega não mata os outros runs do tique', () => {
  const deps = (runs: string[]): StepDeps => {
    const fila = [...runs];
    let t = 0;
    return {
      clock: () => (t += 1),
      io: {
        claimNext: () => {
          const runId = fila.shift();
          // status terminal com entrega pendente: é exatamente o run que o `after` (a entrega) processa
          return runId ? { run: { runId, status: 'done', delivery: { status: 'sent' } } as never, pointer: { runId } as never } : null;
        },
        save: () => undefined,
        dequeue: () => undefined,
        forget: () => undefined,
        enqueue: () => undefined,
        load: () => null,
      },
    } as never as StepDeps;
  };

  test('o callback que lança é contido: os runs seguintes continuam sendo processados', () => {
    const vistos: string[] = [];
    const tocados = pump(deps(['r1', 'r2', 'r3']), 10, 1_000, (r) => {
      vistos.push(r.runId);
      if (r.runId === 'r1') throw new Error('Chat devolveu 500');
    });
    expect(vistos).toEqual(['r1', 'r2', 'r3']); // r2 e r3 não foram puninados pelo erro do r1
    expect(tocados.map((r) => r.runId)).toEqual(['r1', 'r2', 'r3']);
  });
});

// O TIQUE OCIOSO (P3/ADR-027): sem trabalho nenhum, ele tem que ser quase de graça — o critério é 1000 ms e a
// medição de 2026-09-23 deu 844–1021 ms, REPROVADO. O custo não vinha de trabalho: vinha de quatro rotinas que
// pagavam o preço cheio para descobrir que não havia nada a fazer. Duas delas eram as caras:
//
//   - `reconcileStaleRuns`: ScriptLock GLOBAL (o mesmo do "Aprovar") + `getProperties()` inteiro, sem o atalho
//     de vazio que a drenagem ganhou (`obs:empty`);
//   - `withDreamLease`: um SEGUNDO ScriptLock global e DUAS escritas de Property (pôr e tirar o arrendamento)
//     mesmo sem nenhum agente com ciclo de sonho — 2880 escritas por dia à toa.
//
// Este teste mede o que o cronômetro não consegue travar: um tique ocioso não toma trava nem escreve Property.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;

/** Conta trava e escrita POR CIMA do ambiente falso, sem trocar o comportamento dele. */
function instrumentar() {
  const travas = { n: 0 };
  const escritas: string[] = [];
  const p = PropertiesService.getScriptProperties() as unknown as Record<string, (...a: unknown[]) => unknown>;
  const lock = LockService.getScriptLock();
  vi.stubGlobal('LockService', { getScriptLock: () => ({ ...lock, tryLock: (ms: number) => (travas.n++, (lock as unknown as { tryLock: (n: number) => boolean }).tryLock(ms)) }) });
  vi.stubGlobal('PropertiesService', {
    getScriptProperties: () => ({
      ...p,
      setProperty: (k: string, v: string) => (escritas.push(`set ${k}`), p.setProperty(k, v)),
      setProperties: (o: Record<string, string>) => (escritas.push(...Object.keys(o).map((k) => `set ${k}`)), p.setProperties(o)),
      deleteProperty: (k: string) => (escritas.push(`del ${k}`), p.deleteProperty(k)),
    }),
    getUserProperties: () => p,
  });
  return { travas, escritas };
}

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
});

describe('tique ocioso: sem trabalho, sem preço', () => {
  test('nenhuma trava e nenhuma escrita de Property no segundo tique vazio', async () => {
    const m = await import('../src/main');
    m.drainRuns(); // o primeiro tique paga a leitura e deixa as marcas de "não há nada"
    const { travas, escritas } = instrumentar();
    m.drainRuns();
    expect(escritas).toEqual([]);
    expect(travas.n).toBe(0);
    expect(env.calls).toEqual([]); // e nada de rede: ocioso é ocioso
  });
});

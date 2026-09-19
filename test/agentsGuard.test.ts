// Guarda de tamanho da Property `AGENTS` (ADR-038 §8, decisão D15).
//
// A lista inteira de agentes mora num ÚNICO valor de Script Property, que tem teto de 9 KB.
// Sem guarda, passar do teto lança exceção crua do runtime e quebra o painel. Enquanto criar
// agente era ato manual do dono isso era hipótese; com um agente criador montando squad é caminho normal.
//
// O `usage.ts` já tem `PROP_MAX` de propósito; a ausência em `store.ts` era inconsistência.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas } from './gasEnv';
import * as store from '../src/store';

const agents = (n: number) => Array.from({ length: n }, (_, i) => ({ folderId: `folder-id-com-tamanho-realista-${i}`, name: `agente-${i}` }));

describe('saveAgents não deixa a lista de agentes estourar a Property', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('lista normal grava sem reclamar', () => {
    const env = stubGas();
    store.saveAgents(agents(10));
    expect(store.listAgents()).toHaveLength(10);
    expect(env.props.AGENTS.length).toBeLessThan(8_000);
  });

  test('estouro vira recusa honesta, NÃO exceção crua do runtime', () => {
    stubGas();
    let thrown: unknown;
    try {
      store.saveAgents(agents(400));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    // A mensagem tem que dizer o que aconteceu e o que fazer — não "Argument too large".
    expect(String((thrown as Error).message).toLowerCase()).toContain('too many agents');
  });

  test('recusar NÃO corrompe a lista que já estava gravada', () => {
    const env = stubGas();
    store.saveAgents(agents(5));
    const before = env.props.AGENTS;
    expect(() => store.saveAgents(agents(400))).toThrow();
    expect(env.props.AGENTS).toBe(before); // o estado anterior sobrevive à recusa
    expect(store.listAgents()).toHaveLength(5);
  });
});

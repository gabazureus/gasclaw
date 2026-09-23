// A tela de ARQUIVADOS, que sobreviveu à saída dos projetos filhos.
//
// `listChildren` servia três coisas — sucessores, projetos filhos e arquivados — e só a terceira
// continua existindo nesta branch. `archivedAgents` herdou o lugar dela, e este teste existe porque
// código novo sem teste é exatamente o que uma remoção não pode deixar para trás.
//
// RESSALVA HONESTA, e ela é o motivo de este comentário existir: nesta branch **nada grava**
// `archived`. O único escritor era o `passBaton` da sucessão. O estado continua sendo LIDO pelos
// portões que valem (`mayAct`, `defaultAgent`, `claimable`) porque um ambiente vindo da branch
// anterior tem `STATUS:<pasta>` gravado — e desonrá-lo ressuscitaria um agente aposentado. Num
// ambiente novo esta lista vem vazia; é o primeiro caso abaixo, e ele é resultado, não defeito.
//
// O que ele protege: arquivar NÃO APAGA. O agente some da lista de agentes, e sumir da tela é
// diferente de deixar de existir — a pasta do Drive continua lá, e o dono precisa enxergá-la.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  env.props['OWNER'] = 'dono@x.com';
  env.props['AGENTS'] = JSON.stringify([
    { name: 'alpha', folderId: 'fa' },
    { name: 'beta', folderId: 'fb' },
  ]);
});
afterEach(() => vi.unstubAllGlobals());

describe('archivedAgents: arquivar tira da lista, não da existência', () => {
  test('sem ninguém arquivado, a lista é vazia — e a tela não desenha seção nenhuma', async () => {
    const m = await import('../src/main');
    expect(m.archivedAgents().archived).toEqual([]);
  });

  test('só o arquivado aparece, com o caminho para a pasta dele no Drive', async () => {
    env.props['STATUS:fa'] = 'archived';
    env.props['STATUS:fb'] = 'active';
    const m = await import('../src/main');
    expect(m.archivedAgents().archived).toEqual([{ name: 'alpha', folderId: 'fa', driveUrl: 'https://drive.google.com/drive/folders/fa' }]);
  });

  // Estado ausente ou ilegível é ATIVO (`parseStatus`), nunca arquivado: arquivar é ato explícito, e
  // uma Property corrompida não pode aposentar um agente sem ninguém ter decidido isso.
  test('estado ausente ou lixo não conta como arquivado', async () => {
    env.props['STATUS:fb'] = 'lixo';
    const m = await import('../src/main');
    expect(m.archivedAgents().archived).toEqual([]);
  });

  test('quem não é o dono não lê a lista', async () => {
    env.props['STATUS:fa'] = 'archived';
    env.activeUser = 'estranho@x.com';
    const m = await import('../src/main');
    expect(() => m.archivedAgents()).toThrow(/owner/i);
  });
});

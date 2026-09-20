// `bornAgent` e a transferência do bastão, por COMPORTAMENTO (ciclo 1 da revisão de 2026-09-20).
//
// `bornAgent` é o ato que MULTIPLICA e ganhou quatro consertos nesta rodada sem nenhum teste próprio.
// `passBaton` ganhou três. Testar por grep no fonte foi o que já falhou uma vez aqui; estes leem a
// Property DEPOIS da ação, que é a única coisa que não se deixa enganar.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  env.props['OWNER'] = 'dono@x.com';
});
afterEach(() => vi.unstubAllGlobals());

const dois = () => {
  env.props['AGENTS'] = JSON.stringify([
    { name: 'alpha', folderId: 'fa' },
    { name: 'beta', folderId: 'fb' },
  ]);
  env.props['STATUS:fa'] = 'active';
  env.props['STATUS:fb'] = 'active';
};
const caps = (f: string) => JSON.parse(env.props[`CAP:${f}`] ?? '[]') as string[];

describe('o singleton do criador vale nos DOIS lados do dado', () => {
  test('passar `create` para outro agente LIMPA a lista do anterior', async () => {
    dois();
    env.props['CAP:fa'] = JSON.stringify(['create', 'dream']);
    env.props['CREATOR'] = 'fa';
    const m = await import('../src/main');
    m.setAgentCapability('fb', 'create', true);
    expect(env.props['CREATOR']).toBe('fb');
    expect(caps('fb')).toContain('create');
    // O ANTECESSOR perde `create` e SÓ ela: `dream` continua, porque não foi disso que se tratou.
    expect(caps('fa')).not.toContain('create');
    expect(caps('fa')).toContain('dream');
  });

  // A invariante que o comentário do código afirma. Uma afirmação em comentário não é uma invariante;
  // esta asserção é.
  test('depois de qualquer sequência, no máximo UM agente tem `create`, e ele é o CREATOR', async () => {
    dois();
    const m = await import('../src/main');
    m.setAgentCapability('fa', 'create', true);
    m.setAgentCapability('fb', 'create', true);
    m.setAgentCapability('fa', 'create', true);
    const comCreate = ['fa', 'fb'].filter((f) => caps(f).includes('create'));
    expect(comCreate).toHaveLength(1);
    expect(env.props['CREATOR']).toBe(comCreate[0]);
  });

  test('desligar `create` em quem NÃO é o criador não mexe no CREATOR', async () => {
    dois();
    env.props['CREATOR'] = 'fb';
    env.props['CAP:fb'] = JSON.stringify(['create']);
    const m = await import('../src/main');
    m.setAgentCapability('fa', 'create', false);
    expect(env.props['CREATOR']).toBe('fb');
  });
});

describe('passar o bastão DESLIGA o antecessor de verdade', () => {
  const passar = async () => {
    dois();
    env.props['CAP:fa'] = JSON.stringify(['succeed', 'create']);
    env.props['CREATOR'] = 'fa';
    env.props['ACCESS:fa'] = JSON.stringify({ users: ['outra@x.com'], tools: ['gmail.send', 'now'] });
    env.props['CAP:fb'] = JSON.stringify(['succeed', 'create']);
    const m = await import('../src/main');
    m.passBaton('fa', 'fb', 5);
    return m;
  };

  test('o antecessor fica arquivado e SEM ferramentas', async () => {
    await passar();
    expect(env.props['STATUS:fa']).toBe('archived');
    // Um agente que não roda não precisa de ferramenta aprovada — e deixá-las é deixar poder
    // concedido para um alvo que ninguém mais vigia.
    expect(JSON.parse(env.props['ACCESS:fa']).tools).toEqual([]);
  });

  // O defeito que a revisão pegou: `capsAfterSuccession` é interseção e `create` passava, então o
  // sucessor nascia com a caixinha ligada e o motor recusando — e o ARQUIVADO seguia sendo o único
  // do ambiente que podia multiplicar.
  test('o bastão de CRIAR não desce pela sucessão', async () => {
    await passar();
    expect(caps('fb')).not.toContain('create');
    expect(caps('fa')).not.toContain('create');
    expect(env.props['CREATOR']).toBeUndefined();
  });

  test('o sucessor mantém o que NÃO é `create`', async () => {
    await passar();
    expect(caps('fb')).toContain('succeed');
  });

  // ESTE TESTE ERA VACUAMENTE VERDE, e a mutação provou: `runAsk` devolve
  // `{ok,runId,status,text,spent,waiting}` — NÃO HÁ chave `folderId` na resposta. A asserção
  // `not.toContain('"folderId":"fa"')` era verdadeira para toda implementação possível, inclusive
  // para o bug original. O revisor reverteu `defaultAgent` ao estado com defeito e os 13 testes
  // continuaram passando.
  //
  // O oráculo certo é onde o run REALMENTE nasce: a pasta gravada no Drive, não o DTO da tela.
  test('o arquivado deixa de ser o agente PADRÃO da tela', async () => {
    const m = await passar();
    m.runAsk('oi');
    const runs = [...env.drive.keys()].filter((k) => k.includes('/.gasclaw/runs/'));
    expect(runs.length).toBeGreaterThan(0); // controle positivo: o run existe em algum lugar
    expect(runs.every((k) => k.startsWith('fb/'))).toBe(true); // e nasceu no SUCESSOR, não no arquivado
  });
});

// A OUTRA METADE da invariante do singleton, e ela veio de um defeito que o revisor MEDIU rodando:
// "se `CREATOR` existe, aquele agente tem `create` efetivo". Testar só 'no máximo um' deixava passar
// o estado em que sobra ZERO — que é pior, porque ninguém mais pode criar e nada avisa.
describe('a sucessão não pode deixar NINGUÉM podendo criar', () => {
  const cenario = (creator: string) => {
    env.props['AGENTS'] = JSON.stringify([
      { name: 'alpha', folderId: 'fa' },
      { name: 'beta', folderId: 'fb' },
    ]);
    env.props['STATUS:fa'] = 'active';
    env.props['STATUS:fb'] = 'active';
    env.props['CAP:fa'] = JSON.stringify(['succeed']);
    env.props['CAP:fb'] = JSON.stringify(['succeed', 'create']);
    env.props['CREATOR'] = creator;
  };
  const temCreate = (f: string) => (JSON.parse(env.props[`CAP:${f}`] ?? '[]') as string[]).includes('create');

  // O defeito: passar o bastão PARA quem já era o criador o deixava sem `create` na lista, com
  // `CREATOR` ainda apontando para ele — e o portão exige as duas coisas.
  test('passar o bastão para quem JÁ É o criador não tira a capacidade dele', async () => {
    cenario('fb');
    const m = await import('../src/main');
    m.passBaton('fa', 'fb', 5);
    expect(env.props['CREATOR']).toBe('fb');
    expect(temCreate('fb')).toBe(true); // o portão exige lista E ponteiro
  });

  // A invariante inteira, nas duas direções, depois de uma sucessão.
  test('se CREATOR existe, aquele agente tem `create`; se não existe, ninguém tem', async () => {
    for (const quem of ['fa', 'fb']) {
      vi.resetModules();
      env = stubGas();
      env.props['OWNER'] = 'dono@x.com';
      cenario(quem);
      const m = await import('../src/main');
      m.passBaton('fa', 'fb', 5);
      const c = env.props['CREATOR'];
      if (c) expect(temCreate(c), `CREATOR=${c} sem create na lista`).toBe(true);
      else expect(['fa', 'fb'].filter(temCreate)).toEqual([]);
    }
  });

  test('um agente não sucede a si mesmo', async () => {
    cenario('fb');
    const m = await import('../src/main');
    expect(() => m.passBaton('fa', 'fa', 5)).toThrow(/cannot succeed itself/);
  });

  test('o sucessor precisa ser um agente registrado', async () => {
    cenario('fb');
    const m = await import('../src/main');
    expect(() => m.passBaton('fa', 'nao-existe', 5)).toThrow(/not a registered agent/);
  });
});

// ADR-038 §F: arquivar precisa ENCERRAR O QUE ESTÁ EM VOO, não só impedir o que vem depois.
//
// `claimable` existia em `agentCaps.ts` com um docstring dizendo que valia para `claimNext` e
// `claimById` — e tinha ZERO importadores. Era cosmético: o antecessor arquivado continuava dono de
// lease, o pump retomava os runs dele, e ele agia em paralelo com o sucessor.
describe('arquivar tira os runs da fila', () => {
  test('um run de agente arquivado não é reivindicado — e sai da fila', async () => {
    env.props['AGENTS'] = JSON.stringify([{ name: 'alpha', folderId: 'fa' }]);
    env.props['STATUS:fa'] = 'archived';
    const { newRun } = await import('../src/run');
    const { runIO } = await import('../src/runStore');
    const r = newRun({ runId: 'r-morto', session: 'fa:x', folderId: 'fa', user: 'dono@x.com', text: 'oi', now: 1000 });
    runIO().enqueue(r, 1000);
    expect(runIO().claimNext(9_999_999)).toBeNull();
    // E não fica girando: o ponteiro some, senão o pump tentaria de novo a cada minuto para sempre.
    expect(Object.keys(env.props).some((k) => k.includes('r-morto'))).toBe(false);
  });

  // CONTROLE POSITIVO: sem ele, o teste acima ficaria verde com `claimNext` devolvendo null sempre.
  test('controle positivo: o run de um agente ATIVO continua sendo reivindicado', async () => {
    env.props['AGENTS'] = JSON.stringify([{ name: 'alpha', folderId: 'fa' }]);
    env.props['STATUS:fa'] = 'active';
    const { newRun } = await import('../src/run');
    const { runIO } = await import('../src/runStore');
    runIO().enqueue(newRun({ runId: 'r-vivo', session: 'fa:x', folderId: 'fa', user: 'dono@x.com', text: 'oi', now: 1000 }), 1000);
    expect(runIO().claimNext(9_999_999)?.run.runId).toBe('r-vivo');
  });
});

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

  // A outra ponta do mesmo defeito: arquivar tem de significar a mesma coisa no painel e no motor.
  test('o arquivado deixa de ser o agente PADRÃO da tela', async () => {
    const m = await passar();
    const r = m.runAsk('oi');
    // Se ele ainda fosse o padrão, o run nasceria em `fa`. O que importa aqui é não ser `fa`.
    expect(JSON.stringify(r)).not.toContain('"folderId":"fa"');
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

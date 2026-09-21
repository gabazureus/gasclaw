// P33 — o arquivo-semente com que o pai prepara o agente sucessor. NÚCLEO PURO.
//
// DUAS ARMADILHAS de um projeto recém-criado, achadas antes de implantar:
// 1. `isEnabled = RUNTIME_ENABLED !== 'false'`: com as Properties vazias, o sucessor nasce LIGADO — o
//    oposto do que a spec pede. Dois motores respondendo pelo mesmo agente ao mesmo tempo é briga.
// 2. O agente mora nas Script Properties do PAI, e a API do Apps Script não dá acesso a elas. Um
//    sucessor recém-implantado é código melhorado num projeto VAZIO, que nem sabe qual agente servir.
//
// O canal é o mesmo pelo qual o código chega: o pai escreve pela API um arquivo com a semente. NADA
// SECRETO vai nele — nem a chave, nem o segredo da CLI (ADR-040, opção 4): o dono cola a chave.
import { describe, expect, test } from 'vitest';
import { agentsWith, enabledWith, parseSeed, seedSource, type Seed } from '../src/seed';

const semente: Seed = { bornDisabled: true, parent: 'pai123', agents: [{ name: 'gasclaw-assistente', folderId: 'pasta1' }], at: 1 };

describe('enabledWith: o sucessor nasce PARADO e só liga por ato explícito', () => {
  test('sem semente, vale a regra de sempre: ligado a menos que alguém tenha desligado', () => {
    expect(enabledWith(null, null)).toBe(true);
    expect(enabledWith('false', null)).toBe(false);
  });

  // A ARMADILHA 1: Properties vazias. Com a semente, vazio quer dizer PARADO.
  test('com semente e nada gravado, o sucessor está PARADO', () => {
    expect(enabledWith(null, semente)).toBe(false);
  });

  // Só `true` explícito liga — é a coroa. Qualquer outra coisa segue parado.
  test('só um "true" explícito liga o sucessor', () => {
    expect(enabledWith('true', semente)).toBe(true);
    for (const v of ['', 'sim', 'TRUE ', 'false', 'yes']) expect(enabledWith(v, semente)).toBe(false);
  });
});

describe('agentsWith: o sucessor sabe qual agente servir', () => {
  test('sem nada gravado, os agentes vêm da semente', () => {
    expect(agentsWith(null, semente)).toEqual(semente.agents);
  });

  // O que o dono gravou no painel do sucessor VENCE a semente: ela é o ponto de partida, não uma trava.
  test('uma lista gravada vence a semente', () => {
    expect(agentsWith(JSON.stringify([{ name: 'outro', folderId: 'p2' }]), semente)).toEqual([{ name: 'outro', folderId: 'p2' }]);
  });

  // Lista VAZIA gravada é uma decisão do dono ("removi tudo"), e vence a semente. Se não vencesse, o
  // agente que ele apagou reapareceria no próximo carregamento.
  test('lista vazia gravada vence a semente: o dono removeu tudo, e tudo fica removido', () => {
    expect(agentsWith('[]', semente)).toEqual([]);
  });

  test('sem semente e sem nada gravado, nenhum agente', () => {
    expect(agentsWith(null, null)).toEqual([]);
  });

  test('lista gravada ilegível cai na semente, não quebra o motor', () => {
    expect(agentsWith('não é json', semente)).toEqual(semente.agents);
  });
});

describe('parseSeed: a semente é conferida, não confiada', () => {
  test('uma semente válida é lida', () => {
    expect(parseSeed(semente)).toEqual(semente);
  });

  test('ausente ou malformada → null, e o motor segue a regra de sempre', () => {
    for (const x of [undefined, null, 'x', {}, { bornDisabled: true }, { ...semente, agents: 'nope' }, { ...semente, parent: '' }]) expect(parseSeed(x)).toBeNull();
  });

  // Só nome e pasta de cada agente atravessam. Campo a mais é descartado, não obedecido.
  test('campos desconhecidos num agente são descartados', () => {
    const s = parseSeed({ ...semente, agents: [{ name: 'a', folderId: 'p', apiKey: 'sk-or-v1-x', owner: 'x@y' }] });
    expect(s?.agents).toEqual([{ name: 'a', folderId: 'p' }]);
  });
});

describe('seedSource: o arquivo que o pai escreve no sucessor', () => {
  test('define a variável global que o motor lê', () => {
    expect(seedSource(semente)).toMatch(/^var GASCLAW_SEED = /);
  });

  test('o que ele declara volta intacto por parseSeed', () => {
    const src = seedSource(semente);
    const valor = JSON.parse(src.replace(/^var GASCLAW_SEED = /, '').replace(/;\s*$/, ''));
    expect(parseSeed(valor)).toEqual(semente);
  });

  // A GUARDA QUE MAIS IMPORTA: a semente vai para o CÓDIGO de outro projeto. Uma chave aqui iria junto
  // com o projeto se ele fosse compartilhado — exatamente o que a opção 4 da ADR-040 recusou.
  test('nada que pareça segredo entra na semente, mesmo que alguém tente', () => {
    const src = seedSource({ ...semente, agents: [{ name: 'a', folderId: 'p', apiKey: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz' } as never] });
    expect(src).not.toMatch(/sk-or-v1-|apiKey|CLI_SECRET|OPENROUTER/i);
  });
});

// A FIAÇÃO. O núcleo acima pode estar certo e o `store.ts` seguir lendo `RUNTIME_ENABLED !== 'false'`
// direto — e aí o sucessor nasceria ligado com todos os testes do núcleo verdes. Foi o padrão das
// mutações que sobreviveram na F6 (a M4 do D8, a M2 do corte): núcleo certo, casca ignorando.
import { readFileSync } from 'node:fs';
describe('fiação: o store consulta a semente', () => {
  const store = readFileSync('src/store.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  test('isEnabled passa pela semente, e não lê RUNTIME_ENABLED cru', () => {
    expect(store).toMatch(/isEnabled = \(\): boolean => enabledWith\(/);
    expect(store).not.toMatch(/getProperty\('RUNTIME_ENABLED'\) !== 'false'/);
  });
  test('listAgents passa pela semente', () => {
    expect(store).toMatch(/listAgents = \(\): AgentEntry\[\] => agentsWith\(/);
  });
});

// O SUCESSOR PRECISA DO ENDEREÇO DO PAI para o hub levar de um para o outro. O id não basta: a URL de
// um web app não se deduz do scriptId. Não é segredo — é uma URL que só abre com o login do dono.
describe('a semente leva o endereço do pai', () => {
  test('um endereço do Apps Script atravessa', () => {
    expect(parseSeed({ ...semente, parentUrl: 'https://script.google.com/a/macros/x/s/P/exec' })?.parentUrl).toBe('https://script.google.com/a/macros/x/s/P/exec');
  });
  test('um endereço de fora é descartado, não obedecido', () => {
    expect(parseSeed({ ...semente, parentUrl: 'https://evil.example/x' })?.parentUrl).toBeUndefined();
  });
});

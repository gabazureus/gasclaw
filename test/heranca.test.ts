// P30 — D1: a linhagem não encadeia.
//
// O defeito: `succeedNow` passa `incumbentSource: agente.system` — o PROMPT do agente — em TODA
// geração. O comentário ao lado do código diz "na primeira geração: não existe fonte anterior até o
// primeiro sucessor nascer", e a segunda metade nunca foi escrita. Consequência: a geração 2 não
// recebe o código da 1. Cada filho é um sorteio novo do mesmo ponto de partida, o que é REPLICAÇÃO
// COM VARIÂNCIA, não evolução — e nada na tela dizia isso.
//
// `heirOf` é a escolha de QUEM herdar, pura e sem I/O. Ler o fonte é da casca (ADR-002: vem da API
// do Apps Script, nunca do Drive).
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { bestHeirOf, heirOf, type LineageEntry } from '../src/agentCaps';
import { sourceOfChild } from '../src/successor';

const e = (o: Partial<LineageEntry>): LineageEntry => ({ at: 0, kind: 'codegen', parent: 'pai', child: 'filho', generation: 1, delta: null, costUsd: 0, summary: '', ...o });

describe('heirOf: de quem a próxima geração herda', () => {
  test('sem linhagem nenhuma, não há de quem herdar — e null é a resposta honesta', () => {
    expect(heirOf([], 'pai')).toBeNull();
  });

  test('um filho: herda dele', () => {
    expect(heirOf([e({ child: 'c1', at: 10 })], 'pai')).toBe('c1');
  });

  // RECÊNCIA, e não aptidão. Encadear pelo MELHOR exigiria o filho ter rodado, e rodar exige o clique
  // do dono (P24). Por recência a corrente anda sozinha; a seleção por aptidão é outro passo (P31/F4).
  test('vários filhos: herda do MAIS RECENTE, não do primeiro', () => {
    const l = [e({ child: 'c1', at: 10 }), e({ child: 'c3', at: 30 }), e({ child: 'c2', at: 20 })];
    expect(heirOf(l, 'pai')).toBe('c3');
  });

  test('filho de OUTRO pai não é herança desta linhagem', () => {
    expect(heirOf([e({ child: 'alheio', parent: 'outro', at: 99 })], 'pai')).toBeNull();
  });

  // `creation` e `succession` não são geração de código: herdar de uma criação seria herdar de um
  // agente que nunca teve fonte. Só `codegen` escreve código.
  test('só `codegen` deixa fonte para herdar', () => {
    const l = [e({ child: 'novo', kind: 'creation', at: 50 }), e({ child: 'c1', kind: 'codegen', at: 10 })];
    expect(heirOf(l, 'pai')).toBe('c1');
  });

  test('entrada sem filho nomeado é descartada, não vira herança vazia', () => {
    expect(heirOf([e({ child: '', at: 90 }), e({ child: 'c1', at: 10 })], 'pai')).toBe('c1');
  });

  test('carimbo ilegível não ganha de um carimbo válido', () => {
    const l = [e({ child: 'quebrado', at: Number.NaN }), e({ child: 'c1', at: 10 })];
    expect(heirOf(l, 'pai')).toBe('c1');
  });
});

// A LEITURA DO FONTE: casca, mas a DECISÃO sobre o que veio é pura e testável.
//
// ADR-002: o fonte vem da API do Apps Script, NUNCA do Drive. A pasta é compartilhável, logo não
// confiável — e um fonte vindo de lá seria texto de terceiro entrando no pedido ao Opus como se
// fosse o código vigente.
describe('sourceOfChild: o que a API devolveu vira fonte, ou não vira nada', () => {
  const resposta = (files: unknown) => JSON.stringify({ files });

  test('o arquivo `Code` é o fonte', () => {
    expect(sourceOfChild(resposta([{ name: 'appsscript', type: 'JSON', source: '{}' }, { name: 'Code', type: 'SERVER_JS', source: 'function doGet() {}' }]))).toBe('function doGet() {}');
  });

  // Um manifesto não é código. Herdar dele mandaria JSON ao Opus como "o código vigente".
  test('sem arquivo de código, devolve null — o manifesto não serve de fonte', () => {
    expect(sourceOfChild(resposta([{ name: 'appsscript', type: 'JSON', source: '{"timeZone":"x"}' }]))).toBeNull();
  });

  test('qualquer SERVER_JS serve, mesmo com outro nome', () => {
    expect(sourceOfChild(resposta([{ name: 'Outro', type: 'SERVER_JS', source: 'function run() {}' }]))).toBe('function run() {}');
  });

  test('resposta ilegível é null, não string vazia: não sei é diferente de está vazio', () => {
    for (const bruto of ['', 'não é json', '{}', '{"files":[]}', resposta([{ name: 'Code', type: 'SERVER_JS', source: '   ' }])]) {
      expect(sourceOfChild(bruto)).toBeNull();
    }
  });
});

// A FIAÇÃO DE D1. Sem isto, `heirOf` e `sourceOfChild` seriam mais duas peças prontas que ninguém
// ligou — o padrão que esta auditoria já pegou seis vezes.
describe('fiação: a geração N+1 recebe o fonte da N, e cai no prompt só quando não há N', () => {
  const main = readFileSync('src/main.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  test('`incumbentSource` deixou de ser sempre o prompt', () => {
    expect(main).not.toContain('incumbentSource: agente.system,');
  });

  // `bestHeirOf`, e não `heirOf`: a casca tem que consultar a SELEÇÃO. Aceitar `heirOf` aqui deixaria
  // a corrida encadear sem subir, que é o defeito que a seleção existe para fechar.
  test('a herança é consultada pela SELEÇÃO, e o prompt é o fallback declarado', () => {
    expect(main).toContain('bestHeirOf(');
    expect(main).toContain('sourceOfChild(');
    expect(main).toMatch(/\?\?\s*agente\.system/); // sem filho anterior, o prompt continua valendo
  });

  test('o fonte vem da API do Apps Script, nunca do Drive (ADR-002)', () => {
    const bloco = main.slice(main.indexOf('const heranca'), main.indexOf('const r = generateSuccessor'));
    expect(bloco).toContain('/content');
    expect(bloco).not.toMatch(/DriveApp|getFolderById/);
  });
});

// SELEÇÃO. `heirOf` herda do mais RECENTE — e variação sem seleção é deriva, não evolução. Com a
// aptidão medida (P31), a linhagem passa a herdar do MELHOR: é aqui que a corrida deixa de ser
// "replicar 15 vezes" e vira "subir uma escada".
//
// O fallback importa tanto quanto a regra: antes de existir medição, o mais recente continua sendo a
// única escolha possível. Exigir aptidão para encadear travaria a corrida no primeiro filho.
describe('bestHeirOf: herda do melhor medido, e do mais recente enquanto não há medição', () => {
  const e2 = (child: string, at: number, passes?: number, k?: number): LineageEntry => e({ child, at, passes, k });

  test('sem nenhuma medição, cai no mais recente — o comportamento de antes', () => {
    expect(bestHeirOf([e2('c1', 10), e2('c2', 20)], 'pai')).toBe('c2');
  });

  test('com medição, herda do MELHOR — mesmo que ele seja o mais antigo', () => {
    expect(bestHeirOf([e2('c1', 10, 15, 17), e2('c2', 20, 4, 17)], 'pai')).toBe('c1');
  });

  test('empate na taxa vai para o mais recente: entre iguais, o mais novo', () => {
    expect(bestHeirOf([e2('c1', 10, 9, 17), e2('c2', 20, 9, 17)], 'pai')).toBe('c2');
  });

  // Taxa, não contagem: 9 de 10 é melhor que 12 de 20, e comparar os brutos escolheria o pior.
  test('compara TAXA, não número de acertos', () => {
    expect(bestHeirOf([e2('c1', 10, 9, 10), e2('c2', 20, 12, 20)], 'pai')).toBe('c1');
  });

  // Um filho medido, por pior que seja, sabe mais que um nunca medido: o não medido é incógnita.
  test('um filho medido ganha de um nunca medido, mesmo o não medido sendo mais novo', () => {
    expect(bestHeirOf([e2('c1', 10, 1, 17), e2('c2', 20)], 'pai')).toBe('c1');
  });

  test('0 de k MEDIDO ainda é medido, e perde para quem acertou algo', () => {
    expect(bestHeirOf([e2('c1', 10, 0, 17), e2('c2', 20, 1, 17)], 'pai')).toBe('c2');
  });

  test('k igual a zero não é medição, e não vira divisão por zero', () => {
    expect(bestHeirOf([e2('c1', 10, 0, 0), e2('c2', 20)], 'pai')).toBe('c2');
  });

  test('linhagem vazia continua sem herdeiro', () => {
    expect(bestHeirOf([], 'pai')).toBeNull();
  });
});

// D4 — O INTERVALO ENTRE GERAÇÕES NUNCA FOI LIGADO.
//
// `intervalOf(declaredMs)` existe com piso de 1 h desde a ADR-038, e `mayGenerateNow` passava
// `undefined`: o intervalo era SEMPRE 24 h e ninguém conseguia declarar outro. O portão H2 do plano
// — "baixar o intervalo ao piso de 1 h no painel" — não tinha painel nem propriedade nem caminho.
//
// Consequência concreta, achada na hora de rodar: uma corrida de 3 gerações numa sessão é
// IMPOSSÍVEL, porque a geração 2 seria recusada por 24 horas. É a sétima peça pronta e desligada
// que esta auditoria encontra.
describe('fiação do intervalo: o dono consegue declarar um, e o piso continua valendo', () => {
  const main = readFileSync('src/main.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('`mayGenerateNow` não passa mais `undefined`: ele LÊ o intervalo declarado', () => {
    expect(main).not.toContain('intervalOf(undefined)');
    expect(main).toMatch(/intervalOf\(\s*\w/);
  });

  test('declarar o intervalo é ato do dono', () => {
    const i = main.indexOf('export function setAgentInterval');
    expect(i).toBeGreaterThan(-1);
    expect(main.slice(i, i + 500)).toContain('assertOwner()');
  });

  // O piso de 1 h é do núcleo e não pode ser contornado pela casca: quem escreve a Property não
  // decide o mínimo. Um `0` declarado tem que virar o padrão, não "sem intervalo".
  test('o piso continua sendo do núcleo: a casca entrega o valor bruto a `intervalOf`', () => {
    const i = main.indexOf('export function setAgentInterval');
    expect(main.slice(i, i + 500)).not.toMatch(/3_600_000|3600000/); // a casca não repete o piso
  });
});

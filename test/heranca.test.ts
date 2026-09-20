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
import { heirOf, type LineageEntry } from '../src/agentCaps';
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

  test('a herança é consultada, e o prompt é o fallback declarado', () => {
    expect(main).toContain('heirOf(');
    expect(main).toContain('sourceOfChild(');
    expect(main).toMatch(/\?\?\s*agente\.system/); // sem filho anterior, o prompt continua valendo
  });

  test('o fonte vem da API do Apps Script, nunca do Drive (ADR-002)', () => {
    const bloco = main.slice(main.indexOf('const heranca'), main.indexOf('const r = generateSuccessor'));
    expect(bloco).toContain('/content');
    expect(bloco).not.toMatch(/DriveApp|getFolderById/);
  });
});

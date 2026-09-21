// H1 — o orçamento da corrida, e a garantia de que ele VOLTA.
//
// O dono aprovou US$ 15 para a corrida (2026-09-20), contra US$ 3,00/dia de hoje, e o `/goal` manda
// devolver os tetos ao fim. Editar a constante e editar de volta depois dependeria de alguém lembrar —
// e um teto 5× maior esquecido no código é exatamente a falha que ninguém vê até a fatura.
//
// Então o teto da corrida EXPIRA SOZINHO. "Devolver" deixa de ser um passo e vira o relógio.
import { describe, expect, test } from 'vitest';
import { BUDGET_CEILING_USD, effectiveBudget, parseBudgetOverride, type BudgetOverride } from '../src/budget';
import { CODEGEN_DAILY_CAP_USD } from '../src/dream';
import { FAMILY_CAP_USD } from '../src/family';

const corrida: BudgetOverride = { codegenUsd: 15, familyUsd: 18, until: 1_000_000 };

describe('effectiveBudget: o teto da corrida vale enquanto a corrida vale', () => {
  test('sem corrida declarada, valem os tetos de sempre', () => {
    expect(effectiveBudget(null, 0)).toEqual({ codegenUsd: CODEGEN_DAILY_CAP_USD, familyUsd: FAMILY_CAP_USD, until: null });
  });

  test('durante a corrida, vale o teto aprovado pelo dono', () => {
    expect(effectiveBudget(corrida, 999_999)).toEqual({ codegenUsd: 15, familyUsd: 18, until: 1_000_000 });
  });

  // O TESTE QUE IMPLEMENTA "DEVOLVA OS TETOS AO FIM". Não existe passo para esquecer: o relógio devolve.
  test('no instante em que a corrida acaba, os tetos voltam sozinhos — sem ninguém lembrar', () => {
    expect(effectiveBudget(corrida, 1_000_000)).toEqual({ codegenUsd: CODEGEN_DAILY_CAP_USD, familyUsd: FAMILY_CAP_USD, until: null });
    expect(effectiveBudget(corrida, 5_000_000).codegenUsd).toBe(CODEGEN_DAILY_CAP_USD);
  });

  test('relógio inválido não prolonga a corrida', () => {
    expect(effectiveBudget(corrida, Number.NaN).codegenUsd).toBe(CODEGEN_DAILY_CAP_USD);
  });
});

describe('parseBudgetOverride: estado ruim cai no teto MENOR, nunca no maior', () => {
  const j = (o: unknown) => JSON.stringify(o);

  test('uma corrida válida é lida', () => {
    expect(parseBudgetOverride(j(corrida))).toEqual(corrida);
  });

  // FAIL-CLOSED NA DIREÇÃO CERTA: aqui "fechado" é o teto BAIXO. Um valor corrompido que voltasse
  // como "sem limite" seria o pior modo de falha possível para um orçamento.
  test('ilegível, incompleto ou absurdo → null, e null quer dizer os tetos de sempre', () => {
    for (const bruto of [null, '', 'não é json', j({}), j({ codegenUsd: 15, familyUsd: 18 }), j({ ...corrida, codegenUsd: -1 }), j({ ...corrida, codegenUsd: 0 }), j({ ...corrida, until: 'amanhã' })]) {
      expect(parseBudgetOverride(bruto)).toBeNull();
    }
  });

  // O teto dos tetos. Um dígito a mais digitado no painel não pode virar US$ 150 em código gerado.
  test(`acima de US$ ${BUDGET_CEILING_USD} é recusado — um dígito a mais não vira uma fatura`, () => {
    expect(parseBudgetOverride(j({ ...corrida, codegenUsd: BUDGET_CEILING_USD + 1 }))).toBeNull();
    expect(parseBudgetOverride(j({ ...corrida, familyUsd: 150 }))).toBeNull();
  });
});

// A FIAÇÃO. Um único consumidor lendo a constante direto furaria a corrida inteira — ou, pior, a
// deixaria valer num lugar e não no outro: o gerador permitindo e o teto familiar congelando.
import { readFileSync } from 'node:fs';

describe('fiação: todo teto passa por budgetNow, e ninguém lê a constante direto', () => {
  const main = readFileSync('src/main.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const suc = readFileSync('src/successor.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('main.ts não lê CODEGEN_DAILY_CAP_USD nem FAMILY_CAP_USD direto', () => {
    expect(main).not.toMatch(/\bCODEGEN_DAILY_CAP_USD\b/);
    expect(main).not.toMatch(/\bFAMILY_CAP_USD\b/);
  });

  test('o gerador não crava a constante: recebe o teto da casca', () => {
    expect(suc).not.toMatch(/\bCODEGEN_DAILY_CAP_USD\b/);
    expect(suc).toContain('d.dailyCap()');
  });

  // Por LINHA, e não por `capAction\([^)]*\)`: esse padrão para no primeiro `)` — o de
  // `familySpendQuiet()` — e nunca enxerga o segundo argumento. Foi o que este teste fez na primeira
  // versão: acusou um código certo.
  test('todo capAction recebe o teto que está valendo', () => {
    const linhas = main.split('\n').filter((l) => l.includes('capAction('));
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(l).toMatch(/capAction\(.*,\s*(budgetNow\(\)\.familyUsd|tetoFamilia)\)/);
  });

  // M4: a casca podia cravar `dailyCap: () => 3` e todos os testes passavam — o gerador recebia um
  // teto, só que o errado, e a corrida de US$ 15 pararia na 3ª geração sem ninguém entender por quê.
  test('a casca passa ao gerador o teto que ESTÁ valendo', () => {
    expect(main).toContain('dailyCap: () => budgetNow().codegenUsd');
  });

  // M5, E É UMA LACUNA ANTERIOR A ESTA MUDANÇA: a regra "gasto ilegível conta como teto atingido" nunca
  // teve teste. Um zero otimista ali deixaria o gerador gastar além do teto justamente quando ninguém
  // sabe quanto já foi gasto — o pior momento para ser otimista.
  test('gasto ilegível conta como TETO ATINGIDO, nunca como zero', () => {
    const i = main.indexOf('function codegenSpentToday');
    const corpo = main.slice(i, main.indexOf('\n}', i));
    expect(corpo).toMatch(/\?\s*n\s*:\s*budgetNow\(\)\.codegenUsd/);
    expect(corpo).not.toMatch(/\?\s*n\s*:\s*0\b/);
  });

  test('aprovar e encerrar a corrida são atos do dono', () => {
    for (const f of ['setRunBudget', 'endRunBudget']) {
      const i = main.indexOf(`export function ${f}`);
      expect(main.slice(i, i + 400)).toContain('assertOwner()');
    }
  });
});

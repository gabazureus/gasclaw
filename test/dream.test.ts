// Matemática do ciclo e a recusa do próprio projeto (ADR-038/040).
//
// O teste do z é feito com CONTA À MÃO, não repetindo a fórmula do código. A P11 já ensinou isso
// ao projeto: um teste que repete a fórmula confirma o engano em vez de pegá-lo.
import { describe, expect, test } from 'vitest';
import {
  beatsIncumbent,
  CODEGEN_DAILY_CAP_USD,
  DEFAULT_K,
  kOf,
  kSees,
  mayWriteProject,
  passRate,
  twoProportionZ,
  withinDailyCap,
  Z_95,
} from '../src/dream';

describe('k: o número vem com o que ele deixa de enxergar', () => {
  test('o padrão é 17, escolhido pelo usuário', () => {
    expect(DEFAULT_K).toBe(17);
    expect(kOf(undefined)).toBe(17);
  });

  test('k inválido cai no padrão, nunca em zero execuções', () => {
    for (const ruim of [0, -3, 1.5, Number.NaN]) expect(kOf(ruim as number)).toBe(17);
  });

  test('cada k declara o tamanho de efeito que enxerga — baixar k cega, não barateia', () => {
    expect(kSees(17)).toContain('50% to 90%');
    expect(kSees(36)).toContain('50% to 80%');
    expect(kSees(90)).toContain('50% to 70%');
    expect(kSees(166)).toContain('50% to 65%');
    expect(kSees(5)).toContain('too few runs');
  });
});

describe('taxa de acerto: a unidade de medida depois do achado do C7', () => {
  test('sem execução devolve null, nunca 0 — 0 seria lido como "falhou sempre"', () => {
    expect(passRate(0, 0)).toBe(null);
    expect(passRate(0, 17)).toBe(0);
    expect(passRate(17, 17)).toBe(1);
  });
});

describe('teste de proporções, conferido com conta à mão', () => {
  // Conta feita fora do código, com lápis:
  //   x1=17, n1=20  → p1 = 0,85
  //   x2=10, n2=20  → p2 = 0,50
  //   p̄ = 27/40 = 0,675 ; 1−p̄ = 0,325
  //   denom = sqrt(0,675 × 0,325 × (1/20 + 1/20)) = sqrt(0,219375 × 0,1) = sqrt(0,0219375) ≈ 0,148112
  //   z = (0,85 − 0,50) / 0,148112 ≈ 2,3631
  test('z de um caso calculado à mão', () => {
    const z = twoProportionZ(17, 20, 10, 20);
    expect(z).not.toBe(null);
    expect(z as number).toBeCloseTo(2.3631, 3);
  });

  test('proporções iguais dão z = 0', () => {
    expect(twoProportionZ(10, 20, 10, 20)).toBe(0);
  });

  test('sem execução, ou com todo mundo igual e extremo, devolve null em vez de dividir por zero', () => {
    expect(twoProportionZ(1, 0, 1, 5)).toBe(null);
    expect(twoProportionZ(0, 10, 0, 10)).toBe(null); // p̄ = 0 ⇒ denominador 0
    expect(twoProportionZ(10, 10, 10, 10)).toBe(null); // p̄ = 1 ⇒ denominador 0
  });
});

describe('promover exige vantagem ESTATÍSTICA, não aritmética', () => {
  test('com k=17, 15 acertos contra 10 NÃO promove — a diferença não sobrevive ao teste', () => {
    // p1≈0,88 p2≈0,59: parece uma vitória folgada, e não é significativa com n=17.
    expect(beatsIncumbent(15, 10, 17)).toBe(false);
  });

  test('com k=17, 16 contra 6 promove', () => {
    expect(beatsIncumbent(16, 6, 17)).toBe(true);
  });

  test('empate nunca promove, nem no topo nem no fundo', () => {
    expect(beatsIncumbent(10, 10, 17)).toBe(false);
    expect(beatsIncumbent(17, 17, 17)).toBe(false);
    expect(beatsIncumbent(0, 0, 17)).toBe(false);
  });

  test('candidato PIOR nunca promove', () => {
    expect(beatsIncumbent(3, 15, 17)).toBe(false);
  });

  test('o limiar é 1,96 (5% bilateral), nomeado e não mágico', () => {
    expect(Z_95).toBeCloseTo(1.96, 2);
  });
});

describe('a ferramenta de escrever código RECUSA o próprio projeto', () => {
  // Depois que `script.projects` entrar no manifesto, o escopo não distingue qual projeto: criar
  // filho e reescrever o motor passam pela MESMA permissão. Esta função é a separação inteira.
  const EU = '1b93M1aw9_NuPxXfsZvifBIlUFQKrYzMW0y7iaBJDyhHHU26sOgn9duk1';

  test('escrever no projeto que está rodando é recusado', () => {
    const v = mayWriteProject(EU, EU);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('running this code');
  });

  test('espaço em volta não disfarça a igualdade', () => {
    expect(mayWriteProject(` ${EU} `, EU).ok).toBe(false);
    expect(mayWriteProject(EU, ` ${EU}\n`).ok).toBe(false);
  });

  test('alvo vazio é recusado (fail-closed, não "escreve em qualquer um")', () => {
    expect(mayWriteProject('', EU).ok).toBe(false);
    expect(mayWriteProject('   ', EU).ok).toBe(false);
  });

  test('não saber qual projeto está rodando também recusa', () => {
    expect(mayWriteProject('outro-projeto', '').ok).toBe(false);
  });

  test('projeto diferente é permitido — é para isso que a ferramenta existe', () => {
    expect(mayWriteProject('projeto-do-especialista', EU).ok).toBe(true);
  });
});

describe('teto do Opus: por agente não basta, porque vários agentes somam', () => {
  test('o teto agregado existe e é do ambiente inteiro', () => {
    expect(CODEGEN_DAILY_CAP_USD).toBe(3.0);
  });

  test('a soma do dia é que decide, não a geração isolada', () => {
    expect(withinDailyCap(0, 1.0)).toBe(true);
    expect(withinDailyCap(2.0, 1.0)).toBe(true); // fecha exatamente no teto
    expect(withinDailyCap(2.5, 1.0)).toBe(false); // três agentes de US$ 1,00 não cabem
  });

  test('número inválido não autoriza gasto', () => {
    expect(withinDailyCap(Number.NaN, 1.0)).toBe(false);
    expect(withinDailyCap(0, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

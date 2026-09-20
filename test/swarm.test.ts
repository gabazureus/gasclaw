// P29 — o núcleo puro da sonda do enxame.
//
// A sonda mede a PLATAFORMA (quantos filhos o dia aceita, quanto custa um clique), não o modelo: ela
// não chama o Opus. O que mora aqui é a leitura dos números — e ela existe separada da casca porque a
// parte que erra não é a chamada HTTP, é a INTERPRETAÇÃO: confundir "não medi" com "medi zero" foi o
// defeito que quase reprovou a P24, e é o mesmo defeito que `delta: null` evita na linhagem.
import { describe, expect, test } from 'vitest';
import { burstReading, consentReading, P29_MAX_CREATES, parseP29State, quotaReading, withCreated, withRefusal } from '../src/swarm';

const row = (code: number, ms: number, scriptId: string | null = 'x') => ({ scriptId, code, ms });

describe('burstReading: criar em rajada degrada ou segue linear?', () => {
  test('cinco filhos criados: passa, e o mais lento é o número que interessa', () => {
    const r = burstReading([row(200, 9000), row(200, 12000), row(200, 10500), row(200, 11000), row(200, 9800)]);
    expect(r.pass).toBe(true);
    expect(r.n).toBe(5);
    expect(r.slowestMs).toBe(12000);
    expect(r.firstRateLimit).toBeNull();
  });

  // 429 NÃO é falha da sonda: é o teto aparecendo. O número que importa é ONDE ele apareceu.
  test('um 429 nomeia a posição, em base 1, e não é lido como erro de rede', () => {
    const r = burstReading([row(200, 9000), row(200, 9000), row(429, 300, null), row(200, 9000), row(200, 9000)]);
    expect(r.firstRateLimit).toBe(3);
    expect(r.pass).toBe(false);
    expect(r.reading).toMatch(/rate limit/i);
  });

  // 200 sem scriptId é o modo de falha silencioso: a API respondeu e não devolveu projeto nenhum.
  test('200 sem scriptId não conta como filho criado', () => {
    const r = burstReading([row(200, 9000, null)]);
    expect(r.pass).toBe(false);
    expect(r.n).toBe(0);
    // `Math.max()` de lista vazia é -Infinity, e -Infinity na tela é um número que ninguém explica.
    // Esta linha faltava: sem ela a guarda de lista vazia sobrevivia a ser removida (mutação M6).
    expect(r.slowestMs).toBe(0);
  });

  test('rajada vazia não passa, e não inventa um tempo', () => {
    const r = burstReading([]);
    expect(r.pass).toBe(false);
    expect(r.slowestMs).toBe(0);
    expect(r.reading).toMatch(/nothing/i);
  });
});

describe('quotaReading: recusar é resultado, não falha', () => {
  test('o dia recusou ANTES de 15: a corrida vira "até N", e N é o que foi criado', () => {
    const r = quotaReading(9, 10, 429);
    expect(r.pass).toBe(true); // mediu
    expect(r.fitsFifteen).toBe(false);
    expect(r.created).toBe(9);
    expect(r.reading).toMatch(/9/);
  });

  test('o dia recusou DEPOIS de 15: os 15 cabem, e o teto está nomeado', () => {
    const r = quotaReading(17, 18, 429);
    expect(r.fitsFifteen).toBe(true);
    expect(r.pass).toBe(true);
  });

  // A sonda PARA em 20 de propósito: cada projeto criado fica na conta do dono até ele apagar, e
  // descobrir o teto absoluto custaria a ele uma limpeza manual que a pergunta não exige.
  test('sem recusa até o limite da sonda: 15 cabem, e o teto absoluto fica DECLARADO como não alcançado', () => {
    const r = quotaReading(P29_MAX_CREATES, null, null);
    expect(r.fitsFifteen).toBe(true);
    expect(r.refusedAt).toBeNull();
    expect(r.reading).toMatch(/not reached/i);
  });

  test('nada criado e nada recusado é AUSÊNCIA de medição, não "zero cabe"', () => {
    const r = quotaReading(0, null, null);
    expect(r.pass).toBe(false);
    expect(r.fitsFifteen).toBe(false);
    expect(r.reading).toMatch(/nothing/i);
  });
});

describe('consentReading: o clique do dono tem um custo em tempo de parede', () => {
  const rows = [
    { scriptId: 'a', deployedAt: 1_000, authorized: true },
    { scriptId: 'b', deployedAt: 2_000, authorized: true },
    { scriptId: 'c', deployedAt: 3_000, authorized: false },
  ];

  test('mede só quem já foi autorizado, e a espera é contada desde a implantação', () => {
    const r = consentReading(rows, 12_000);
    expect(r.authorized).toBe(2);
    expect(r.total).toBe(3);
    expect(r.waits.map((w) => w.ms)).toEqual([11_000, 10_000]);
    expect(r.pass).toBe(true);
  });

  // A MESMA DISCIPLINA DO `delta`: ausência não é zero. Uma mediana 0 diria "o clique é instantâneo".
  test('ninguém autorizado ainda → mediana NULA, nunca 0', () => {
    const r = consentReading([{ scriptId: 'a', deployedAt: 1_000, authorized: false }], 9_000);
    expect(r.medianMs).toBeNull();
    expect(r.pass).toBe(false);
    expect(r.reading).toMatch(/no one has authorized/i);
  });

  test('relógio andando para trás não vira espera negativa', () => {
    const r = consentReading([{ scriptId: 'a', deployedAt: 9_000, authorized: true }], 1_000);
    expect(r.waits[0].ms).toBe(0);
  });
});

describe('P29State: o estado da sonda sobrevive entre execuções de 6 minutos', () => {
  test('estado ilegível volta vazio — nunca uma contagem inventada', () => {
    for (const bruto of [null, '', 'não é json', '{"ids":"nope"}', '[]']) {
      const s = parseP29State(bruto);
      expect(s.ids).toEqual([]);
      expect(s.refusedAt).toBeNull();
    }
  });

  test('cada filho criado entra uma vez só, com o instante da implantação', () => {
    const s = withCreated(withCreated(parseP29State(null), 'a', 100), 'a', 200);
    expect(s.ids).toEqual(['a']);
    expect(s.deployedAt.a).toBe(100); // o primeiro carimbo é o que vale: reescrever encurtaria a espera medida
  });

  test('a recusa é gravada com a posição e o código, e não some ao criar de novo', () => {
    const s = withCreated(withRefusal(parseP29State(null), 10, 429), 'b', 300);
    expect(s.refusedAt).toBe(10);
    expect(s.refusedCode).toBe(429);
  });
});

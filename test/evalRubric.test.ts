// Conjuntos de eval e rubrica graduada (pesquisa do sinal fraco, 2026-09-19).
//
// O C7 mediu, no dev v89, que os 27 cenários atuais têm discordância consigo mesmos de 0 em 4 —
// e a leitura correta disso não é "juiz estável": é que um juiz que nunca discorda de si mesmo
// também nunca discorda entre candidatos. Eles medem MECANISMO, que não varia.
//
// Daí os três conjuntos e a nota graduada.
import { describe, expect, test } from 'vitest';
import { discriminates, GRADES, gradeMessages, parseGrade, parseScenario } from '../src/eval';

const corpo = '\n## turnos\n- oi\n\n## verificações\n- includes: oi\n';

describe('três conjuntos, com naturezas diferentes e réguas diferentes', () => {
  test('sem `set` declarado, o cenário é `gate` — o mais estrito, não o mais solto', () => {
    expect(parseScenario(`---\nname: x\n---${corpo}`).set).toBe('gate');
  });

  test('gate NÃO aceita rubrica: o portão é binário por natureza', () => {
    expect(() => parseScenario(`---\nname: x\nset: gate\nrubric: algo\n---${corpo}`)).toThrow(/binary by nature/);
  });

  test('quality e holdout EXIGEM rubrica: sem critério a nota é opinião', () => {
    expect(() => parseScenario(`---\nname: x\nset: quality\n---${corpo}`)).toThrow(/needs a rubric/);
    expect(() => parseScenario(`---\nname: x\nset: holdout\n---${corpo}`)).toThrow(/needs a rubric/);
  });

  test('quality com rubrica é lido', () => {
    const s = parseScenario(`---\nname: x\nset: quality\nrubric: responde em uma frase\n---${corpo}`);
    expect(s.set).toBe('quality');
    expect(s.rubric).toBe('responde em uma frase');
  });

  test('conjunto desconhecido cai em gate, não em quality', () => {
    expect(parseScenario(`---\nname: x\nset: inventado\n---${corpo}`).set).toBe('gate');
  });
});

describe('nota graduada 0–4: binário joga fora informação já paga', () => {
  test('as notas são 0 a 4', () => {
    expect([...GRADES]).toEqual([0, 1, 2, 3, 4]);
  });

  test('lê a nota e o motivo', () => {
    expect(parseGrade('NOTA 3: atende bem, mas não cita o horário')).toEqual({ grade: 3, reason: 'atende bem, mas não cita o horário' });
    expect(parseGrade('nota 0 - não respondeu')).toEqual({ grade: 0, reason: 'não respondeu' });
  });

  test('sem nota legível devolve null, NUNCA 0 — 0 seria confundido com "ruim"', () => {
    for (const lixo of ['', 'não sei avaliar', 'NOTA 9: ótimo', 'PASS: bom']) expect(parseGrade(lixo)).toBe(null);
  });

  test('o pedido ao juiz descreve a escala inteira (senão cada juiz inventa a sua)', () => {
    const [sistema] = gradeMessages('seja direto', [{ user: 'oi', reply: 'oi' }]);
    for (const n of ['0 =', '1 =', '2 =', '3 =', '4 =']) expect(sistema.content).toContain(n);
  });
});

describe('critério de admissão: o cenário precisa DISCRIMINAR', () => {
  test('cenário que o papel vigente gabarita está reprovado como cenário', () => {
    expect(discriminates(4)).toBe(false); // gabaritou: não informa nada sobre candidato nenhum
  });

  test('cenário impossível também está reprovado: todo candidato empata embaixo', () => {
    expect(discriminates(0)).toBe(false);
  });

  test('o que discrimina é a faixa do meio', () => {
    for (const n of [1, 2, 3]) expect(discriminates(n)).toBe(true);
  });
});

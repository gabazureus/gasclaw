// O DreamBoard (item 36): o placar que o dono lê antes de trocar o titular.
//
// O que este arquivo protege é a HONESTIDADE do número, não o desenho da tela. Um placar que mostra
// 12 contra 9 sem dizer o que k=17 consegue enxergar convida a ler vantagem aritmética como vantagem
// real — que é exatamente o erro que o desenho antigo do ciclo cometia somando notas.
import { describe, expect, test } from 'vitest';
import { board, diffLines } from '../src/dreamBoard';
import type { DreamState } from '../src/dreamStore';

const estado = (tally: Record<string, { passes: number; runs: number }>, cands = ['CAND']): DreamState =>
  ({
    cycleId: 'c1', folderId: 'f1', incumbent: 'linha A\nlinha B', status: 'running',
    plan: { cycleId: 'c1', candidates: cands, k: 17, steps: new Array(10).fill({ kind: 'gate', candidate: 'CAND', scenario: 'g1', rep: 0 }) },
    tally, done: [], startedAt: 0, updatedAt: 0,
  }) as unknown as DreamState;

describe('diffLines: só o que mudou, e por linha', () => {
  test('mostra o que entrou e o que saiu', () => {
    const d = diffLines('linha A\nlinha B', 'linha A\nlinha C');
    expect(d.added).toEqual(['linha C']);
    expect(d.removed).toEqual(['linha B']);
  });

  test('texto igual não gera diff', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual({ added: [], removed: [] });
  });

  // Linha em branco e espaço à direita não são mudança de instrução, e apareceriam como se fossem.
  test('espaço e linha vazia não viram diferença', () => {
    expect(diffLines('a\n\n  b  ', 'a\nb')).toEqual({ added: [], removed: [] });
  });
});

describe('board: o número vem com o que ele enxerga', () => {
  test('sem estado, não inventa placar', () => {
    expect(board(null)).toBeNull();
  });

  test('declara o alcance do k ao lado do número', () => {
    const b = board(estado({}))!;
    expect(b.k).toBe(17);
    expect(b.sees).toMatch(/50% to 90%/);
  });

  // O `gate` é eliminatório, não comparativo. Somá-lo faria um candidato que passou no gate parecer
  // melhor sem ter respondido melhor a nada.
  test('só os passos de QUALIDADE entram no placar', () => {
    const b = board(estado({ 'gate:CAND:g1': { passes: 5, runs: 5 }, 'quality:CAND:q1': { passes: 3, runs: 4 } }))!;
    expect(b.rows[0].passes).toBe(3);
    expect(b.rows[0].runs).toBe(4);
  });

  // A COMBINAÇÃO que vale o teste inteiro: número maior e `wins: false`. Ela mostra que o critério viu
  // a diferença e decidiu que ela não sustenta uma troca.
  test('vantagem aritmética pequena NÃO vira vitória', () => {
    const b = board(estado({ 'quality:CAND:q1': { passes: 10, runs: 17 }, 'quality:linha A\nlinha B:q1': { passes: 9, runs: 17 } }))!;
    expect(b.rows[0].passes).toBeGreaterThan(b.rows[0].incumbentPasses);
    expect(b.rows[0].wins).toBe(false);
  });

  test('vantagem grande o bastante vira vitória', () => {
    const b = board(estado({ 'quality:CAND:q1': { passes: 17, runs: 17 }, 'quality:linha A\nlinha B:q1': { passes: 4, runs: 17 } }))!;
    expect(b.rows[0].wins).toBe(true);
  });

  test('sem execução, a taxa é null — nunca 0 enganoso', () => {
    expect(board(estado({}))!.rows[0].rate).toBeNull();
  });

  test('o erro do ciclo aparece no placar em vez de sumir', () => {
    const s = { ...estado({}), status: 'failed', error: 'scenario "q9" is not in this build' } as DreamState;
    expect(board(s)!.error).toMatch(/not in this build/);
  });
});

import { describe, expect, it } from 'vitest';
import { parseProbe } from '../poc/p22-proatividade/harness';

// Sonda corrompida não pode passar por medição boa — foi assim que amostras da P3 foram invalidadas.
describe('parseProbe', () => {
  it('lê uma sonda válida', () => {
    expect(parseProbe<{ ms: number }>('{"ms":700}')).toEqual({ ms: 700 });
  });

  it.each([
    ['ausente', null],
    ['JSON quebrado', '{'],
    ['literal nulo', 'null'],
    ['número', '42'],
    ['texto', '"ok"'],
    ['vazio', ''],
  ])('devolve null diante de %s, sem lançar', (_nome, raw) => {
    expect(parseProbe(raw as string | null)).toBeNull();
  });
});

// A ressalva da conferência cruzada é frase que alguém "limpa" depois sem saber por que estava lá.
// Este teste existe para que apagá-la falhe a suíte, e não para conferir texto por conferir.
//
// Por que ela importa: o painel mostrava "-79,4%" com sinal de menos, como se a medição do gasclaw
// estivesse errada. Medido em 2026-09-19: os dois lados subiram US$ 0,000618840 no mesmo intervalo,
// com diferença ZERO até a 12ª casa. A contabilidade está exata; a diferença é outro consumidor da
// MESMA CHAVE — inclusive as chamadas diretas que a própria investigação fez.
import { describe, expect, test } from 'vitest';
import { CROSS_CHECK_NOTE } from '../src/observe';

describe('conferência cruzada: a ressalva não pode sumir', () => {
  test('diz que o número do OpenRouter é POR CHAVE', () => {
    expect(CROSS_CHECK_NOTE).toContain('PER KEY');
    expect(CROSS_CHECK_NOTE).toContain('not per project');
  });

  test('diz que a diferença pode ser outro consumidor, e não erro de medição', () => {
    expect(CROSS_CHECK_NOTE).toContain('another consumer');
    expect(CROSS_CHECK_NOTE).toContain('not a measurement error');
  });

  test('diz que a janela dos dois lados é a mesma (senão alguém culpa o fuso de novo)', () => {
    expect(CROSS_CHECK_NOTE).toContain('same UTC day');
  });

  test('está em inglês, como o resto do painel e da CLI (ADR-033)', () => {
    expect(CROSS_CHECK_NOTE).not.toMatch(/[áâãéêíóôõúç]/i);
  });
});

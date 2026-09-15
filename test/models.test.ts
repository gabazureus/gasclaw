import { describe, expect, test } from 'vitest';
import { reduceModels, validateChoice } from '../src/models';

const api = {
  data: [
    { id: 'openai/gpt-x', name: 'X', context_length: 128000, pricing: { prompt: '0.0000025', completion: '0.00001' }, supported_parameters: ['tools', 'temperature'], description: 'longo…' },
    { id: 'meta/llama:free', context_length: 8192, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'] },
    { id: 'semprecos/y', context_length: 4096, pricing: {}, supported_parameters: ['tools'] },
  ],
};

describe('reduceModels', () => {
  test('só id, contexto, preço por 1M de tokens (entrada e saída), tools e free; ordenado por id', () => {
    expect(reduceModels(api)).toEqual([
      { id: 'meta/llama:free', ctx: 8192, inM: 0, outM: 0, tools: false, free: true },
      { id: 'openai/gpt-x', ctx: 128000, inM: 2.5, outM: 10, tools: true, free: false },
      { id: 'semprecos/y', ctx: 4096, inM: 0, outM: 0, tools: true, free: false },
    ]);
  });
  test('resposta sem data vira lista vazia', () => expect(reduceModels({})).toEqual([]));
  test('preço negativo (openrouter/auto: variável) vira 0, nunca −1.000.000 por milhão', () => {
    expect(reduceModels({ data: [{ id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' } }] })[0]).toMatchObject({ inM: 0, outM: 0, free: false });
  });
});

describe('validateChoice (C5)', () => {
  const list = reduceModels(api);
  test('recusa modelo sem tools quando o agente tem tools', () => expect(validateChoice(list, 'meta/llama:free', ['now'])).toMatch(/não aceita ferramentas/));
  test('aceita modelo sem tools quando o agente não tem tools', () => expect(validateChoice(list, 'meta/llama:free', [])).toBeNull());
  test('aceita modelo com tools', () => expect(validateChoice(list, 'openai/gpt-x', ['now', 'memory'])).toBeNull());
  test('recusa id que não está na lista do OpenRouter', () => expect(validateChoice(list, 'nao/existe', [])).toMatch(/não encontrado/));
  test('openrouter/auto sempre é aceito', () => expect(validateChoice(list, 'openrouter/auto', ['now'])).toBeNull());
});

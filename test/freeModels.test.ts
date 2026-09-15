import { describe, expect, test } from 'vitest';
import type { ModelInfo } from '../src/models';
import { validateChoice } from '../src/models';
import { FREE, classify, freeOrder, isFree, quota, rotate } from '../src/freeModels';

const m = (id: string, ctx: number, tools: boolean, free = true): ModelInfo => ({ id, ctx, inM: 0, outM: 0, tools, free });
const list: ModelInfo[] = [
  m('a/grande:free', 128_000, true),
  m('b/medio:free', 64_000, true),
  m('c/sem-tools:free', 200_000, false),
  m('d/curto:free', 4_000, true),
  m('e/pago', 128_000, true, false),
];
const NOW = 1_800_000_000_000;

describe('isFree e FREE', () => {
  test('reconhece a palavra free (e só ela) como pedido de rodízio', () => {
    expect(FREE).toBe('free');
    expect(isFree('free')).toBe(true);
    expect(isFree('FREE')).toBe(true);
    expect(isFree(' free ')).toBe(true);
    expect(isFree('openrouter/auto')).toBe(false);
    expect(isFree('meta/llama:free')).toBe(false); // id concreto: usa esse modelo, sem rodízio
  });
});

describe('freeOrder: ordem estável e previsível, sem sorteio', () => {
  test('só modelos gratuitos, maior contexto primeiro, empate pelo id', () => {
    const ids = freeOrder(list, { tools: false, minCtx: 0, now: NOW }).map((x) => x.id);
    expect(ids).toEqual(['c/sem-tools:free', 'a/grande:free', 'b/medio:free', 'd/curto:free']);
  });
  test('a mesma entrada dá sempre a mesma ordem', () => {
    const once = freeOrder(list, { tools: false, minCtx: 0, now: NOW }).map((x) => x.id);
    expect(freeOrder(list, { tools: false, minCtx: 0, now: NOW }).map((x) => x.id)).toEqual(once);
  });
  test('C4: agente com ferramentas nunca recebe modelo sem ferramentas', () => {
    const ids = freeOrder(list, { tools: true, minCtx: 0, now: NOW }).map((x) => x.id);
    expect(ids).toEqual(['a/grande:free', 'b/medio:free', 'd/curto:free']);
    expect(ids).not.toContain('c/sem-tools:free');
  });
  test('contexto insuficiente fica de fora', () => {
    expect(freeOrder(list, { tools: true, minCtx: 65_000, now: NOW }).map((x) => x.id)).toEqual(['a/grande:free']);
  });
  test('quem falhou há pouco vai para o fim, mantendo a ordem entre os punidos', () => {
    const failed = { 'a/grande:free': NOW - 60_000, 'b/medio:free': NOW - 60_000 };
    expect(freeOrder(list, { tools: true, minCtx: 0, now: NOW, failed }).map((x) => x.id)).toEqual(['d/curto:free', 'a/grande:free', 'b/medio:free']);
  });
  test('falha velha (mais de 15 min) não pesa mais', () => {
    const failed = { 'a/grande:free': NOW - 16 * 60_000 };
    expect(freeOrder(list, { tools: true, minCtx: 0, now: NOW, failed })[0].id).toBe('a/grande:free');
  });
  test('sem nenhum gratuito que sirva, devolve lista vazia (quem chama decide o que fazer)', () => {
    expect(freeOrder([m('x/pago', 1000, true, false)], { tools: true, minCtx: 0, now: NOW })).toEqual([]);
  });
});

describe('classify: que erro justifica trocar de modelo', () => {
  test('429, 5xx e modelo indisponível trocam', () => {
    for (const e of ['OpenRouter 429: rate limit', 'OpenRouter 500: oops', 'OpenRouter 503: unavailable', 'OpenRouter 404: No endpoints found for x', 'OpenRouter 400: model not available'])
      expect(classify(e)).toBe('troca');
  });
  test('erro do pedido (sem chave, prompt inválido) não troca: trocar não resolveria', () => {
    for (const e of ['OpenRouter 401: no auth', 'OpenRouter 402: insufficient credits', 'OpenRouter: resposta sem conteúdo']) expect(classify(e)).toBe('para');
  });
  test('403 de modelo restrito a certos usos troca: outro gratuito responde (medido na P11, v37)', () => {
    // o OpenRouter recusa alguns :free fora de "agentic harnesses"; o rodízio parava no 1º candidato e perdia os 20 turnos
    expect(classify('OpenRouter 403: {"error":{"message":"thinkingmachines/inkling:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps","code":403}}')).toBe('troca');
    expect(classify('OpenRouter 403: this model requires a paid account')).toBe('troca');
  });
  test('403 de chave sem permissão não troca: o problema é a chave, não o modelo', () => {
    expect(classify('OpenRouter 403: forbidden: your key is not allowed to use this endpoint')).toBe('para');
  });
});

describe('rotate: troca de modelo registrando o caminho', () => {
  const ok = (model: string) => ({ model });
  test('acerta de primeira: sem fallback', () => {
    const r = rotate(['a', 'b'], (id) => ok(id), 3);
    expect(r).toMatchObject({ model: 'a', fallback: [] });
    expect(r.value).toEqual({ model: 'a' });
  });
  test('C3: 429 no primeiro passa para o segundo e registra a tentativa', () => {
    const r = rotate(['a', 'b'], (id) => {
      if (id === 'a') throw new Error('OpenRouter 429: rate limit');
      return ok(id);
    }, 3);
    expect(r.model).toBe('b');
    expect(r.fallback).toEqual([{ model: 'a', error: 'OpenRouter 429: rate limit' }]);
  });
  test('respeita o teto de tentativas', () => {
    let calls = 0;
    expect(() => rotate(['a', 'b', 'c', 'd'], () => {
      calls++;
      throw new Error('OpenRouter 500: oops');
    }, 2)).toThrow(/500/);
    expect(calls).toBe(2);
  });
  test('erro que não justifica troca para na hora, sem queimar outro modelo', () => {
    let calls = 0;
    expect(() => rotate(['a', 'b'], () => {
      calls++;
      throw new Error('OpenRouter 401: no auth');
    }, 3)).toThrow(/401/);
    expect(calls).toBe(1);
  });
  test('sem candidato nenhum, o erro diz o que fazer', () => {
    expect(() => rotate([], () => ok('x'), 3)).toThrow(/nenhum modelo gratuito/i);
  });
});

describe('validateChoice aceita free como escolha da tela', () => {
  test('free vale quando existe gratuito que serve ao agente', () => {
    expect(validateChoice(list, FREE, [])).toBeNull();
    expect(validateChoice(list, FREE, ['now'])).toBeNull();
  });
  test('free é recusado quando nenhum gratuito aceita as ferramentas do agente', () => {
    const semTools = [m('c/sem-tools:free', 200_000, false), m('e/pago', 128_000, true, false)];
    expect(validateChoice(semTools, FREE, ['now'])).toMatch(/ferramenta/i);
    expect(validateChoice(semTools, FREE, [])).toBeNull();
  });
  test('free é recusado quando não há nenhum modelo gratuito na lista', () => {
    expect(validateChoice([m('e/pago', 128_000, true, false)], FREE, [])).toMatch(/gratuito/i);
  });
});

describe('quota: 20 por minuto e 1.000 por dia (50 sem crédito)', () => {
  test('folga: não bloqueia nem avisa', () => {
    expect(quota({ today: 10, perMinute: 2, freeTier: false })).toMatchObject({ blocked: false, warn: false });
  });
  test('perto do teto do dia, avisa antes de bloquear', () => {
    const q = quota({ today: 900, perMinute: 2, freeTier: false });
    expect(q).toMatchObject({ blocked: false, warn: true });
    expect(q.note).toMatch(/900 de 1000/);
  });
  test('no teto do dia, bloqueia', () => {
    expect(quota({ today: 1000, perMinute: 0, freeTier: false })).toMatchObject({ blocked: true });
  });
  test('sem crédito comprado, o teto do dia é 50', () => {
    expect(quota({ today: 50, perMinute: 0, freeTier: true })).toMatchObject({ blocked: true });
    expect(quota({ today: 40, perMinute: 0, freeTier: true })).toMatchObject({ blocked: false, warn: true });
  });
  test('no teto do minuto, bloqueia e explica que é por minuto', () => {
    const q = quota({ today: 1, perMinute: 20, freeTier: false });
    expect(q.blocked).toBe(true);
    expect(q.note).toMatch(/minuto/);
  });
});

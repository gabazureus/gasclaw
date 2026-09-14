import { describe, expect, test } from 'vitest';
import { buildRequest, complete, OPENROUTER_URL, parseResponse, type Http } from '../src/llm';

const msgs = [{ role: 'user' as const, content: 'oi' }];

describe('buildRequest', () => {
  test('monta POST OpenAI-compatível com auth e limite de tokens', () => {
    const r = buildRequest('sk-1', 'x/y', msgs, 500);
    expect(r.url).toBe(OPENROUTER_URL);
    expect(r.init.method).toBe('post');
    expect(r.init.headers.Authorization).toBe('Bearer sk-1');
    expect(r.init.muteHttpExceptions).toBe(true);
    expect(JSON.parse(r.init.payload)).toEqual({ model: 'x/y', messages: msgs, max_tokens: 500 });
  });
});

describe('parseResponse', () => {
  test('extrai texto e uso', () => {
    const body = JSON.stringify({ choices: [{ message: { content: 'olá' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } });
    expect(parseResponse(200, body)).toEqual({ text: 'olá', usage: { prompt_tokens: 3, completion_tokens: 1 } });
  });
  test('devolve id, modelo real, finish_reason e usage.cost para o trace', () => {
    const body = JSON.stringify({ id: 'gen-1', model: 'meta/x:free', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1, cost: 0.0002 } });
    expect(parseResponse(200, body)).toEqual({ text: 'ok', id: 'gen-1', model: 'meta/x:free', finish_reason: 'stop', usage: { prompt_tokens: 3, completion_tokens: 1, cost: 0.0002 } });
  });
  test('erro HTTP vira exceção legível sem vazar a chave', () => {
    expect(() => parseResponse(401, '{"error":{"message":"No auth"}}')).toThrow('OpenRouter 401: {"error":{"message":"No auth"}}');
  });
  test('resposta sem conteúdo vira exceção', () => {
    expect(() => parseResponse(200, '{"choices":[]}')).toThrow('OpenRouter: resposta sem conteúdo');
  });
});

describe('complete', () => {
  test('usa o http injetado', () => {
    let seen = '';
    const http: Http = (url) => {
      seen = url;
      return { code: 200, body: '{"choices":[{"message":{"content":"ok"}}]}' };
    };
    expect(complete('k', 'm', msgs, 100, http).text).toBe('ok');
    expect(seen).toBe(OPENROUTER_URL);
  });
});

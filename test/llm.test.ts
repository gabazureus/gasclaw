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

describe('tool_calls (OpenRouter, formato OpenAI)', () => {
  const tools = [{ type: 'function' as const, function: { name: 'now', description: 'hora', parameters: { type: 'object', properties: {} } } }];
  const call = { id: 'c1', type: 'function' as const, function: { name: 'now', arguments: '{}' } };

  test('tools só entram no payload quando há alguma', () => {
    expect(JSON.parse(buildRequest('k', 'm', msgs, 10, []).init.payload)).not.toHaveProperty('tools');
    expect(JSON.parse(buildRequest('k', 'm', msgs, 10, tools).init.payload).tools).toEqual(tools);
  });
  test('assistente que repassa tool_calls vai com content null; resultado vai como role tool', () => {
    const ms = [...msgs, { role: 'assistant' as const, content: '', tool_calls: [call] }, { role: 'tool' as const, content: '"12:00"', tool_call_id: 'c1' }];
    const sent = JSON.parse(buildRequest('k', 'm', ms, 10, tools).init.payload).messages;
    expect(sent[1]).toEqual({ role: 'assistant', content: null, tool_calls: [call] });
    expect(sent[2]).toEqual({ role: 'tool', content: '"12:00"', tool_call_id: 'c1' });
  });
  test('content null com tool_calls vira text vazio + toolCalls, preservando id, modelo, finish_reason e custo', () => {
    const body = JSON.stringify({ id: 'gen-2', model: 'x', choices: [{ message: { content: null, tool_calls: [call] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 5, completion_tokens: 2, cost: 0.001 } });
    expect(parseResponse(200, body)).toEqual({ text: '', toolCalls: [call], id: 'gen-2', model: 'x', finish_reason: 'tool_calls', usage: { prompt_tokens: 5, completion_tokens: 2, cost: 0.001 } });
  });
  test('arguments inválidos não quebram o llm (validação é do núcleo)', () => {
    const bad = { ...call, function: { name: 'now', arguments: '{nao json' } };
    const body = JSON.stringify({ choices: [{ message: { content: null, tool_calls: [bad] }, finish_reason: 'tool_calls' }] });
    expect(parseResponse(200, body).toolCalls).toEqual([bad]);
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

import { describe, expect, test } from 'vitest';
import { buildRequest, complete, OPENROUTER_URL, parseResponse, type EmptyCompletionError, type Http } from '../src/llm';

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
  test('resposta vazia vira exceção', () => {
    expect(() => parseResponse(200, '{"choices":[]}')).toThrow('OpenRouter: empty response');
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

// D9 — RESPOSTA VAZIA JOGAVA O CUSTO FORA.
//
// `parseResponse` lançava "resposta sem conteúdo" ANTES de devolver o `usage`. Quem chama
// (`generateSuccessor`) conta o gasto DEPOIS que `complete` volta — então com a resposta vazia a
// conta nunca acontecia. A ADR-041 §4 diz: "o custo é contado mesmo quando o resultado é descartado.
// O dinheiro saiu." Aqui ele saía e sumia.
//
// E o erro não dizia POR QUE veio vazio. Achado na primeira geração real da F6: não dá para distinguir
// "o modelo gastou o orçamento raciocinando" (`finish_reason: length`) de "o conteúdo veio como lista
// de blocos, e não como string". Consertar sem saber seria chutar. O erro agora carrega os fatos.
describe('resposta vazia: o erro carrega o custo e o motivo', () => {
  const corpo = (msg: unknown, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ id: 'x', model: 'm', choices: [{ message: msg, finish_reason: 'length' }], usage: { cost: 0.42, completion_tokens: 1200 }, ...extra });

  test('conteúdo nulo: o erro traz o custo, o finish_reason e o que veio no lugar', () => {
    try {
      parseResponse(200, corpo({ role: 'assistant', content: null }));
      throw new Error('deveria ter lançado');
    } catch (e) {
      const x = e as EmptyCompletionError;
      expect(x.usage?.cost).toBe(0.42);
      expect(x.finishReason).toBe('length');
      expect(x.contentShape).toBe('null');
    }
  });

  // A OUTRA CAUSA POSSÍVEL: blocos de conteúdo no lugar de uma string. O erro tem que dizer isso,
  // senão o próximo conserto mira no raciocínio quando o problema é o formato.
  test('conteúdo como lista de blocos é distinguido de conteúdo nulo', () => {
    try {
      parseResponse(200, corpo({ role: 'assistant', content: [{ type: 'text', text: 'oi' }] }));
      throw new Error('deveria ter lançado');
    } catch (e) {
      expect((e as EmptyCompletionError).contentShape).toBe('array');
    }
  });

  test('a mensagem humana continua dizendo que veio vazio', () => {
    expect(() => parseResponse(200, corpo({ role: 'assistant', content: null }))).toThrow(/empty response/);
  });
});

// O ORÇAMENTO DE RACIOCÍNIO, achado na P32. O Opus recebeu 142 mil tokens de código e devolveu
// `finish_reason: length` com conteúdo NULO: gastou os 5.000 tokens de saída pensando, antes de
// escrever a primeira palavra. Num modelo que raciocina, o raciocínio sai do MESMO `max_tokens`. O
// parâmetro `reasoning` do OpenRouter limita o pensamento e deixa o resto para a resposta.
describe('reasoning: limitar o pensamento para sobrar orçamento para a resposta', () => {
  test('sem `reasoning`, o pedido não muda — nenhum chamador existente é afetado', () => {
    const { init } = buildRequest('k', 'm', [{ role: 'user', content: 'oi' }], 100);
    expect(JSON.parse(init.payload).reasoning).toBeUndefined();
  });

  test('com `reasoning`, ele vai no corpo do pedido', () => {
    const { init } = buildRequest('k', 'm', [{ role: 'user', content: 'oi' }], 16000, [], undefined, { max_tokens: 8000 });
    expect(JSON.parse(init.payload).reasoning).toEqual({ max_tokens: 8000 });
  });
});

// Resposta vazia carrega a contagem de tokens: sem ela, "gastou em raciocínio" é hipótese, não fato.
test('a resposta vazia leva junto os tokens de raciocínio, para o motivo ser medido e não suposto', () => {
  const corpo = JSON.stringify({ choices: [{ message: { content: null }, finish_reason: 'length' }], usage: { cost: 1.38, prompt_tokens: 190000, completion_tokens: 5000, completion_tokens_details: { reasoning_tokens: 5000 } } });
  try {
    parseResponse(200, corpo);
    throw new Error('deveria ter lançado');
  } catch (e) {
    const u = (e as EmptyCompletionError).usage as { completion_tokens_details?: { reasoning_tokens?: number } };
    expect(u.completion_tokens_details?.reasoning_tokens).toBe(5000);
  }
});

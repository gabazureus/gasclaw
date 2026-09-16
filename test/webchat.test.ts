import { describe, expect, test } from 'vitest';
import type { Ticket } from '../src/approval';
import type { ChatDeps, Tickets } from '../src/chat';
import type { Completion, Message } from '../src/llm';
import { allowedTools } from '../src/tools/registry';
import { webClick, webSend, webSpace, voiceDelegate } from '../src/webchat';
import { buildSpec } from '../src/workspace';

function setup(script: Completion[]) {
  const store: Record<string, Message[]> = {};
  const data = new Map<string, Ticket>();
  const tickets: Tickets = {
    put: (t) => void data.set(t.token, t),
    take: (k) => {
      const t = data.get(k) ?? null;
      data.delete(k);
      return t;
    },
  };
  const mem = { text: '- prefiro café\n' };
  const sent: Message[][] = [];
  let n = 0;
  const d: ChatDeps = {
    enabled: () => true,
    owner: () => 'dono@x.com',
    apiKey: () => 'sk-or-x',
    defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
    load: () => buildSpec('f1', 'A', { AGENTS: 'Regras' }),
    history: (k) => store[k] ?? [],
    saveHistory: (k, h) => void (store[k] = h),
    llm: (_k, _m, ms) => (sent.push(structuredClone(ms)), script.shift() ?? { text: 'fim' }),
    toolkit: (_s, ownerDm) => ({ tools: allowedTools(['memory']), ctx: { now: () => '', ownerDm, memory: { read: () => mem.text, write: (x) => void (mem.text = x) } }, steps: 5 }),
    tickets,
    newToken: () => `web${String(++n).padStart(29, '0')}`,
    clock: () => 1,
  };
  return { d, store, mem, sent };
}

describe('tela de chat (texto + voz) sobre o mesmo handleChat', () => {
  test('texto: DM do dono na conversa da tela, com memória', () => {
    const { d, store, sent } = setup([{ text: 'Oi!' }]);
    const reply = webSend(d, 'dono@x.com', 'oi');
    expect(reply.text).toBe('Oi!');
    expect(reply.markupSyntax).toBeUndefined();
    expect(store[`f1:${webSpace('dono@x.com').name}`]).toHaveLength(2);
    expect(sent[0].some((m) => m.content.includes('prefiro café'))).toBe(true);
    expect(sent[0][0].content).not.toContain('Markdown do Google Chat');
  });

  test('C5: voz delegada entra no MESMO histórico do texto', () => {
    const { d, store, sent } = setup([{ text: 'Oi!' }, { text: 'Você disse oi.' }]);
    webSend(d, 'dono@x.com', 'oi');
    expect(voiceDelegate(d, 'dono@x.com', '  o que eu disse?  ').text).toBe('Você disse oi.');
    expect(sent[1].filter((m) => m.role !== 'system').map((m) => m.content)).toContain('oi');
    expect(store[`f1:${webSpace('dono@x.com').name}`].map((m) => m.content)).toEqual(['oi', 'Oi!', 'o que eu disse?', 'Você disse oi.']);
  });

  test('C3: tool pedida pela voz respeita a aprovação (card na tela → clique → executa)', () => {
    const call: Completion = { text: '', toolCalls: [{ id: 'c1', type: 'function', function: { name: 'memory_remove', arguments: '{"text":"café"}' } }] };
    const { d, mem } = setup([call, { text: 'Removi.' }]);
    const r = voiceDelegate(d, 'dono@x.com', 'apague o café');
    expect(mem.text).toBe('- prefiro café\n');
    const token = JSON.stringify(r.cardsV2).match(/"key":"token","value":"(\w+)"/)![1];
    expect(webClick(d, 'dono@x.com', { token, decision: 'approve' }).text).toBe('Removi.');
    expect(mem.text).toBe('');
  });

  test('tela usa o prazo de 300 s (o Chat pararia em 20 s)', () => {
    const { d } = setup([{ text: 'ok' }]);
    let t = 0;
    expect(webSend({ ...d, clock: () => (t += 25_000) }, 'dono@x.com', 'oi').text).toBe('ok');
  });

  test('histórico separado por usuário', () => expect(webSpace('Ana@X.com').name).toBe('tela/chat/ana@x.com'));

  test('fala vazia não chama o modelo', () => {
    const { d, sent } = setup([]);
    expect(voiceDelegate(d, 'dono@x.com', '   ').text).toContain('Não entendi');
    expect(sent).toHaveLength(0);
  });
});

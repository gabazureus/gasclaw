import { describe, expect, test } from 'vitest';
import { handleChat, type ChatDeps, type ChatEvent } from '../src/chat';
import type { Completion, Message } from '../src/llm';
import { allowedTools, type MemoryCtx } from '../src/tools/registry';
import { buildSpec, withAccess } from '../src/workspace';

const RITUAL = 'Pergunte o nome e o estilo preferido.';
const saveCall: Completion = { text: '', toolCalls: [{ id: 'c1', type: 'function', function: { name: 'memory_save', arguments: '{"text":"chama-se Gabriel"}' } }] };

function setup(script: Completion[], opts: { history?: Message[]; file?: string | null } = {}) {
  const sent: Message[][] = [];
  const files: Record<string, string> = {};
  let consumed = 0;
  const memory: MemoryCtx = { read: () => '', write: () => {}, day: (d) => files[d] ?? '', saveDay: (d, t) => void (files[d] = t), today: () => '2030-01-15', recall: () => '' };
  const d: ChatDeps = {
    enabled: () => true,
    owner: () => 'dono@x.com',
    apiKey: () => 'sk-or-x',
    defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
    load: () => withAccess(buildSpec('f1', 'A', { AGENTS: 'Regras' }), { users: [], tools: ['memory'] }),
    history: () => opts.history ?? [],
    saveHistory: () => {},
    llm: (_k, _m, ms) => (sent.push(structuredClone(ms)), script.shift() ?? { text: 'fim' }),
    toolkit: (_s, ownerDm) => ({ tools: allowedTools(['memory']), ctx: { now: () => '', ownerDm, isOwner: true, memory }, steps: 4 }),
    bootstrap: { read: () => (opts.file === undefined ? RITUAL : opts.file), consume: () => void consumed++ },
    clock: () => 1,
  };
  return { d, sent, files, consumed: () => consumed };
}
const dm = (text: string): ChatEvent => ({ type: 'MESSAGE', message: { text }, user: { email: 'dono@x.com' }, space: { name: 'spaces/D', singleUserBotDm: true } });
const espaco = (text: string): ChatEvent => ({ type: 'MESSAGE', message: { text }, user: { email: 'dono@x.com' }, space: { name: 'spaces/S1' } });

describe('ritual de estreia no chat', () => {
  test('primeira conversa do dono: o ritual entra antes da fala e é consumido quando o agente grava', () => {
    const { d, sent, files, consumed } = setup([saveCall, { text: 'Anotado, Gabriel.' }]);
    expect(handleChat(dm('oi'), d).text).toBe('Anotado, Gabriel.');
    const primeira = sent[0];
    expect(primeira.some((m) => m.role === 'user' && m.content.includes('Pergunte o nome'))).toBe(true);
    expect(primeira[primeira.length - 1].content).toBe('oi'); // a fala do usuário vem depois do ritual
    expect(files['2030-01-15']).toBe('- chama-se Gabriel\n');
    expect(consumed()).toBe(1);
  });

  test('sem gravar nada, o arquivo NÃO é consumido (fica para a próxima conversa)', () => {
    const { d, consumed } = setup([{ text: 'Oi! Como prefere ser chamado?' }]);
    handleChat(dm('oi'), d);
    expect(consumed()).toBe(0);
  });

  test('conversa já começada não repete o ritual', () => {
    const { d, sent, consumed } = setup([{ text: 'ok' }], { history: [{ role: 'user', content: 'anterior' }, { role: 'assistant', content: 'oi' }] });
    handleChat(dm('e aí'), d);
    expect(sent[0].some((m) => m.content.includes('Pergunte o nome'))).toBe(false);
    expect(consumed()).toBe(0);
  });

  test('num espaço nunca há ritual', () => {
    const { d, sent } = setup([{ text: 'ok' }]);
    handleChat(espaco('oi'), d);
    expect(sent[0].some((m) => m.content.includes('Pergunte o nome'))).toBe(false);
  });

  test('agente sem BOOTSTRAP.md segue normal', () => {
    const { d, sent, consumed } = setup([{ text: 'ok' }], { file: null });
    expect(handleChat(dm('oi'), d).text).toBe('ok');
    expect(sent[0].some((m) => m.content.includes('Ritual de estreia'))).toBe(false);
    expect(consumed()).toBe(0);
  });

  test('deps sem bootstrap (compatibilidade) não quebram', () => {
    const { d } = setup([{ text: 'ok' }]);
    expect(handleChat(dm('oi'), { ...d, bootstrap: undefined }).text).toBe('ok');
  });
});

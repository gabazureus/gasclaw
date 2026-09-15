import { describe, expect, test } from 'vitest';
import { handleChat, type ChatDeps, type ChatEvent } from '../src/chat';
import type { Completion, Message } from '../src/llm';
import { SESSION_MAX_CHARS, sessionMessages, SUMMARY_PROMPT, type Session } from '../src/session';
import { compactSession, toSession } from '../src/sessionCompact';
import type { SessionIO } from '../src/sessionStore';
import { buildSpec, withAccess } from '../src/workspace';

const msgs = (n: number, size = 10): Message[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `${i}`.padEnd(size, 'x') }) as Message);
function io(initial: Session): SessionIO & { current: () => Session } {
  let s = initial;
  return { load: () => s, save: (_k, next) => void (s = next), current: () => s };
}

describe('compactação por resumo, preservando a cauda', () => {
  test('conversa longa: o começo vira resumo, a cauda fica e o modelo recebe o resumo como contexto', () => {
    const store = io({ messages: msgs(40, SESSION_MAX_CHARS / 20) });
    let asked: Message[] = [];
    expect(compactSession(store, 'spaces/S1', (m) => ((asked = m), { text: 'combinamos 10h' }))).toBe(true);
    expect(asked[0]).toEqual({ role: 'system', content: SUMMARY_PROMPT });
    const after = store.current();
    expect(after.summary).toBe('combinamos 10h');
    expect(after.messages).toHaveLength(8);
    expect(after.messages[7].content).toBe(msgs(40, SESSION_MAX_CHARS / 20)[39].content);
    expect(sessionMessages(after)[0].content).toContain('combinamos 10h');
  });

  test('conversa curta não chama o modelo', () => {
    const store = io({ messages: msgs(4) });
    let called = false;
    expect(compactSession(store, 's', () => ((called = true), { text: 'x' }))).toBe(false);
    expect(called).toBe(false);
  });

  test('resumo vazio ou falha do modelo não mexe na sessão', () => {
    const before: Session = { messages: msgs(40, SESSION_MAX_CHARS / 20) };
    const vazio = io(before);
    expect(compactSession(vazio, 's', () => ({ text: '   ' }))).toBe(false);
    expect(vazio.current()).toBe(before);
    const quebrado = io(before);
    expect(
      compactSession(quebrado, 's', () => {
        throw new Error('OpenRouter 500');
      }),
    ).toBe(false);
    expect(quebrado.current()).toBe(before);
  });

  test('compactar duas vezes acumula o resumo e não perde a cauda nova', () => {
    const store = io({ messages: msgs(40, SESSION_MAX_CHARS / 20) });
    compactSession(store, 's', () => ({ text: 'primeiro' }));
    store.save('s', { ...store.current(), messages: msgs(40, SESSION_MAX_CHARS / 20) });
    compactSession(store, 's', () => ({ text: 'segundo' }));
    expect(store.current().summary).toBe('primeiro\nsegundo');
    expect(store.current().messages).toHaveLength(8);
  });

  test('toSession mantém o resumo ao salvar o histórico novo', () => {
    expect(toSession({ summary: 's', messages: msgs(2) }, msgs(3))).toEqual({ summary: 's', messages: msgs(3) });
    expect(toSession({ messages: [] }, msgs(1))).toEqual({ messages: msgs(1) });
  });
});

describe('handleChat aciona a compactação depois de responder', () => {
  function setup(compact?: ChatDeps['compact']) {
    const saved: Record<string, Message[]> = {};
    const d: ChatDeps = {
      enabled: () => true,
      owner: () => 'dono@x.com',
      apiKey: () => 'sk-or-x',
      defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
      load: () => withAccess(buildSpec('f1', 'A', { AGENTS: 'Regras' }), { users: [], tools: [] }),
      history: () => [],
      saveHistory: (k, h) => void (saved[k] = h),
      llm: (): Completion => ({ text: 'ok' }),
      clock: () => 1,
      compact,
    };
    return { d, saved };
  }
  const dm = (text: string): ChatEvent => ({ type: 'MESSAGE', message: { text }, user: { email: 'dono@x.com' }, space: { name: 'spaces/D', singleUserBotDm: true } });

  test('chama compact com a chave da conversa, depois de salvar o histórico', () => {
    const calls: string[] = [];
    const { d, saved } = setup((k) => void calls.push(k));
    expect(handleChat(dm('oi'), d).text).toBe('ok');
    expect(calls).toEqual(['f1:spaces/D']);
    expect(saved['f1:spaces/D']).toHaveLength(2);
  });

  test('sem compact (deps antigas) o turno segue igual', () => {
    const { d } = setup(undefined);
    expect(handleChat(dm('oi'), d).text).toBe('ok');
  });
});

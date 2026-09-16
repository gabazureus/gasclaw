import { describe, expect, test } from 'vitest';
import type { Session } from '../src/session';
import { SESSION_QUEUE_PREFIX, SESSION_TRIES, sessionQueueKey, settleSessions, splitSessionQueue, type SessionEntry } from '../src/sessionQueue';

const sess = (n = 1): Session => ({ messages: Array.from({ length: n }, (_, i) => ({ role: 'user', content: `m${i}` })) });
const entry = (key: string, at: number, over: Partial<SessionEntry> = {}): SessionEntry => ({ key, at, session: sess(), ...over });
const props = (es: SessionEntry[], extra: Record<string, string> = {}): Record<string, string> => ({
  ...Object.fromEntries(es.map((e) => [sessionQueueKey(e.key), JSON.stringify(e)])),
  ...extra,
});

describe('fila das sessões é própria, não a do trace nem a dos runs', () => {
  test('prefixo próprio e chave por conversa', () => {
    expect(SESSION_QUEUE_PREFIX).toBe('S:');
    expect(sessionQueueKey('f1:spaces/D')).toBe('S:f1:spaces/D');
  });

  test('só lê as entradas do próprio prefixo, ignorando trace (Q:) e runs (R:)', () => {
    const p = props([entry('f1:a', 2), entry('f1:b', 1)], { 'Q:xyz': '{"id":"x","at":0,"row":[],"recs":[]}', 'R:abc': '{"runId":"abc"}', OWNER: 'dono@x.com' });
    expect(splitSessionQueue(p).map((e) => e.key)).toEqual(['f1:b', 'f1:a']); // mais antiga primeiro
  });

  test('entrada corrompida ou sem forma de sessão não trava a fila', () => {
    const p = props([entry('f1:boa', 1)], { 'S:quebrada': 'não é json', 'S:torta': '{"key":"f1:x","at":2}' });
    expect(splitSessionQueue(p).map((e) => e.key)).toEqual(['f1:boa']);
  });

  test('fila vazia é lista vazia', () => expect(splitSessionQueue({ OWNER: 'x' })).toEqual([]));
});

describe('settle: o que sai da fila e o que volta', () => {
  test('gravou: sai da fila', () => {
    const es = [entry('f1:a', 1), entry('f1:b', 2)];
    expect(settleSessions(es, [true, true])).toEqual({ remove: ['S:f1:a', 'S:f1:b'], retry: [] });
  });

  test('falhou: volta com tentativa a mais', () => {
    const r = settleSessions([entry('f1:a', 1)], [false]);
    expect(r.remove).toEqual([]);
    expect(r.retry[0].tries).toBe(1);
  });

  test('depois do teto de tentativas, desiste e sai da fila (não fica para sempre)', () => {
    const r = settleSessions([entry('f1:a', 1, { tries: SESSION_TRIES - 1 })], [false]);
    expect(r.remove).toEqual(['S:f1:a']);
    expect(r.retry).toEqual([]);
  });
});

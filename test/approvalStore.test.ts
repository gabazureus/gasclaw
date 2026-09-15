import { describe, expect, test } from 'vitest';
import type { Ticket } from '../src/approval';
import { cacheTickets } from '../src/approvalStore';

function fakes() {
  const data = new Map<string, string>();
  let free = true;
  const cache = { put: (k: string, v: string) => void data.set(k, v), get: (k: string) => data.get(k) ?? null, remove: (k: string) => void data.delete(k) };
  const lock = { tryLock: () => free, releaseLock: () => {} };
  return { data, tickets: cacheTickets(cache as never, lock as never), busy: () => void (free = false) };
}

const ticket = (kind: 'approval' | 'ask', over: Partial<Ticket> = {}): Ticket => ({
  token: 'a'.repeat(32),
  user: 'dono@x.com',
  session: 'f:s',
  text: 'oi',
  history: [],
  state: { messages: [], step: 0, queue: [] },
  pending: { kind, name: kind === 'ask' ? 'ask' : 'memory.remove', callId: 'c', key: 'k', args: {} },
  granted: [],
  runId: 'r',
  expiresAt: 1,
  ...over,
});

describe('cacheTickets (a borda que garante o uso único em produção)', () => {
  test('take lê e apaga: o segundo take do mesmo token devolve null', () => {
    const f = fakes();
    f.tickets.put(ticket('approval'));
    expect(f.tickets.take('a'.repeat(32))?.runId).toBe('r');
    expect(f.tickets.take('a'.repeat(32))).toBeNull();
  });

  test('ask aberto: open(sessão) devolve o token até o take, depois não', () => {
    const f = fakes();
    f.tickets.put(ticket('ask'));
    expect(f.tickets.open?.('f:s')).toBe('a'.repeat(32));
    f.tickets.take('a'.repeat(32));
    expect(f.tickets.open?.('f:s')).toBeNull();
  });

  test('trava ocupada: lança e o ticket continua guardado', () => {
    const f = fakes();
    f.tickets.put(ticket('approval'));
    f.busy();
    expect(() => f.tickets.take('a'.repeat(32))).toThrow('ocupada');
    expect(f.data.has(`t:${'a'.repeat(32)}`)).toBe(true);
  });

  test('ticket grande demais para o CacheService (100 KB) é recusado com mensagem clara', () => {
    const f = fakes();
    const big = ticket('approval', { history: [{ role: 'user', content: 'x'.repeat(100_000) }] });
    expect(() => f.tickets.put(big)).toThrow('grande demais');
  });
});

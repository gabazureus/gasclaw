import { describe, expect, test } from 'vitest';
import type { Ticket } from '../src/approval';
import { cacheTickets, decideChatApproval, decideScreenApproval, durableTickets } from '../src/approvalStore';
import type { DurableRun } from '../src/run';

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
  done: {},
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
    expect(() => f.tickets.take('a'.repeat(32))).toThrow('approvals are busy');
    expect(f.data.has(`t:${'a'.repeat(32)}`)).toBe(true);
  });

  test('ticket grande demais para o CacheService (100 KB) é recusado com mensagem clara', () => {
    const f = fakes();
    const big = ticket('approval', { history: [{ role: 'user', content: 'x'.repeat(100_000) }] });
    expect(() => f.tickets.put(big)).toThrow('too big to store');
  });
});

describe('P20 durableTickets', () => {
  test('aprovação vira DurableRun no Drive; ask continua no cache legado', () => {
    const saved: DurableRun[] = [];
    const legacy = fakes();
    const io = { save: (r: DurableRun) => void saved.push(r) };
    const tickets = durableTickets(io as never, legacy.tickets, () => 'f'.repeat(64));
    tickets.put(ticket('approval', { folderId: 'f1', issuedAt: 100, prompt: 'Posso remover?', ownerDm: false }));
    expect(saved[0]).toMatchObject({ runId: 'r', folderId: 'f1', ownerDm: false, status: 'waiting', answer: 'Posso remover?', approval: { tokenHash: 'f'.repeat(64), user: 'dono@x.com' } });
    expect(legacy.data.size).toBe(0);
    tickets.put(ticket('ask'));
    expect(legacy.data.has(`t:${'a'.repeat(32)}`)).toBe(true);
  });
});

test('P20: os adaptadores reais de Chat e tela convergem em RunIO.decide', () => {
  const calls: unknown[][] = [];
  const io = { decide: (...args: unknown[]) => (calls.push(args), { kind: 'accepted' as const, run: {} as DurableRun }) };
  const hash = (token: string) => token.padEnd(64, token[0] ?? '0').slice(0, 64);
  decideChatApproval(io as never, { folderId: 'f1', runId: 'r1', token: 'a'.repeat(32), decision: 'approve' }, 'dono@x.com', 'b'.repeat(32), 100, hash);
  const pending = { kind: 'approval' as const, name: 'gmail.send', callId: 'c1', key: 'k', args: {} };
  decideScreenApproval(io as never, { runId: 'r2', folderId: 'f2', user: 'dono@x.com', pending } as DurableRun, { token: 'c'.repeat(32), decision: 'deny' }, 'dono@x.com', 'd'.repeat(32), 101, hash);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject(['f1', 'r1', { actor: 'dono@x.com', decision: { approved: true } }, 100]);
  expect(calls[1]).toMatchObject(['f2', 'r2', { actor: 'dono@x.com', decision: { approved: false } }, 101]);
});

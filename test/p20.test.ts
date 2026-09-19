import { describe, expect, test } from 'vitest';
import { APPROVAL_TTL_MS, issueGrant, redeemGrant } from '../src/approval';
import { newRun, type DurableRun } from '../src/run';
import type { Pending } from '../src/agent';
import { p20Verdict } from '../poc/p20-approval/verdict';

const NOW = Date.UTC(2030, 0, 1);
const HASH = 'a'.repeat(64);
const NEXT_HASH = 'b'.repeat(64);
const pending: Pending = { kind: 'approval', name: 'gmail.send', callId: 'c1', key: 'r1:0:c1', args: { to: 'a@b.c' } };

const waiting = (over: Partial<DurableRun> = {}): DurableRun => ({
  ...newRun({ runId: 'r1', session: 'f1:spaces/D', folderId: 'f1', user: 'Dono@X.com', text: 'envie', now: NOW }),
  status: 'waiting',
  pending,
  snapshot: { messages: [], step: 0, queue: [] },
  approval: issueGrant(pending, 'Dono@X.com', HASH, NOW),
  ...over,
});

describe('P20: aprovação durável (núcleo puro)', () => {
  test('C1: credencial vale 24 h e aprovação retoma o snapshot existente', () => {
    const r = redeemGrant(waiting(), HASH, 'DONO@x.com', { approved: true }, NOW + APPROVAL_TTL_MS - 1, NEXT_HASH);
    expect(r).toMatchObject({ kind: 'accepted', run: { status: 'queued', decision: { approved: true }, pending, snapshot: { step: 0 } } });
    if (r.kind === 'accepted') expect(r.run.approval).toBeUndefined();
  });

  test('C2: terceiro é recusado sem consumir nem rotacionar', () => {
    const before = waiting();
    expect(redeemGrant(before, HASH, 'terceiro@x.com', { approved: true }, NOW + 1, NEXT_HASH)).toEqual({ kind: 'rejected', error: 'only the person who made the request can answer it', run: before });
  });

  test('C3: run já consumido recusa clique duplo', () => {
    const first = redeemGrant(waiting(), HASH, 'dono@x.com', { approved: true }, NOW + 1, NEXT_HASH);
    expect(first.kind).toBe('accepted');
    if (first.kind !== 'accepted') return;
    expect(redeemGrant(first.run, HASH, 'dono@x.com', { approved: true }, NOW + 2, NEXT_HASH)).toMatchObject({ kind: 'rejected' });
  });

  test('C4: no limite de 24 h expira, mantém waiting e rotaciona a mesma pendência', () => {
    const before = waiting();
    const r = redeemGrant(before, HASH, 'dono@x.com', { approved: true }, NOW + APPROVAL_TTL_MS, NEXT_HASH);
    expect(r).toMatchObject({
      kind: 'refreshed',
      run: { status: 'waiting', pending, snapshot: before.snapshot, approval: { tokenHash: NEXT_HASH, pendingKey: pending.key, expiresAt: NOW + 2 * APPROVAL_TTL_MS } },
    });
  });

  test('falha fechada para token, pendência ou política persistida corrompidos', () => {
    expect(redeemGrant(waiting(), 'x', 'dono@x.com', { approved: true }, NOW + 1, NEXT_HASH).kind).toBe('rejected');
    expect(redeemGrant(waiting({ pending: { ...pending, key: 'outra' } }), HASH, 'dono@x.com', { approved: true }, NOW + 1, NEXT_HASH).kind).toBe('rejected');
    expect(redeemGrant(waiting({ approval: { ...issueGrant(pending, 'dono@x.com', HASH, NOW), user: 'ataque@x.com' } }), HASH, 'dono@x.com', { approved: true }, NOW + 1, NEXT_HASH).kind).toBe('rejected');
  });

  test('falha fechada para relógio inválido ou anterior à emissão', () => {
    expect(redeemGrant(waiting(), HASH, 'dono@x.com', { approved: true }, Number.NaN, NEXT_HASH).kind).toBe('rejected');
    expect(redeemGrant(waiting(), HASH, 'dono@x.com', { approved: true }, NOW - 1, NEXT_HASH).kind).toBe('rejected');
    expect(() => issueGrant(pending, 'dono@x.com', HASH, Number.POSITIVE_INFINITY)).toThrow('invalid approval credential');
  });
});

describe('P20: veredito da POC real', () => {
  const pass = {
    cacheCleared: true,
    resumedAfterMs: 660_000,
    chat: { status: 'done', third: 'rejected', ownerAfterThird: 'accepted', double: 'rejected', llmCalls: 2, effects: 1, steps: 1 },
    expired: { first: 'refreshed', statusAfterExpiry: 'waiting', samePending: true, llmCallsAtExpiry: 1, finalStatus: 'done', llmCalls: 2, effects: 1, steps: 1 },
    sameStore: true,
  } as const;

  test('C1-C5 passam apenas com Drive, uso único, vínculo e rotação sem replay', () => {
    expect(p20Verdict(pass)).toMatchObject({ pass: true, checks: [{ id: 'C1', pass: true }, { id: 'C2', pass: true }, { id: 'C3', pass: true }, { id: 'C4', pass: true }, { id: 'C5', pass: true }] });
  });

  test.each([
    { cacheCleared: false },
    { chat: { ...pass.chat, effects: 2 } },
    { chat: { ...pass.chat, third: 'accepted' as const } },
    { chat: { ...pass.chat, double: 'accepted' as const } },
    { expired: { ...pass.expired, llmCallsAtExpiry: 2 } },
    { sameStore: false },
  ])('reprova quando um invariante cai: %j', (over) => expect(p20Verdict({ ...pass, ...over } as never).pass).toBe(false));
});

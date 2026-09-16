import { afterStep, markInflight, newRun, resumeOf, type DurableRun } from '../../src/run';
import { issueGrant } from '../../src/approval';
import { decideChatApproval, decideScreenApproval, hashToken } from '../../src/approvalStore';
import { runCacheKey, runIO } from '../../src/runStore';
import { pumpById, type StepDeps } from '../../src/runner';
import { runTurn } from '../../src/agent';
import * as store from '../../src/store';
import type { Tool } from '../../src/tools/registry';
import { p20Verdict } from './verdict';

const PROTOCOL = 'durable-approval-v1';
const TEN_MINUTES = 600_000;
const DAY = 86_400_000;

type Counts = { llm: number; steps: number; effects: number };

function pendingRun(folderId: string, owner: string, runId: string, now: number, token: string, counts: Counts): DurableRun {
  const base = newRun({ runId, session: `${folderId}:poc/p20`, folderId, user: owner, text: 'aprove o efeito P20', now });
  const effect: Tool = {
    name: 'gmail.send', description: 'efeito sintético P20', parameters: { type: 'object', properties: {}, additionalProperties: false }, approval: 'always',
    run: (_args, ctx) => (ctx.beforeEffect?.(), counts.effects++, 'p20-effect-ok'),
  };
  const turn = runTurn({
    system: 'POC P20', history: [], text: base.text, tools: [effect],
    ctx: { now: () => '', ownerDm: true, memory: { read: () => '', write: () => undefined } },
    llm: () => (counts.llm++, { text: '', toolCalls: [{ id: 'p20-call', type: 'function', function: { name: effect.name, arguments: '{}' } }] }),
    runId, steps: 2, deadlineMs: now + 120_000, clock: () => now,
  });
  const waiting = afterStep(base, turn, now + 1);
  if (!waiting.pending) throw new Error('P20 não criou a pendência inicial');
  return { ...waiting, approval: issueGrant(waiting.pending, owner, hashToken(token), now) };
}

function resumeDeps(io: ReturnType<typeof runIO>, counts: Counts, now: number): StepDeps {
  const effect: Tool = {
    name: 'gmail.send', description: 'efeito sintético P20', parameters: { type: 'object', properties: {}, additionalProperties: false }, approval: 'always',
    run: (_args, ctx) => (ctx.beforeEffect?.(), counts.effects++, 'p20-effect-ok'),
  };
  return {
    io,
    clock: () => now,
    step: (r) => {
      counts.steps++;
      const turn = runTurn({
        system: 'POC P20', history: [], text: r.text, tools: [effect],
        ctx: { now: () => '', ownerDm: true, memory: { read: () => '', write: () => undefined } },
        llm: () => (counts.llm++, { text: 'p20-ok' }),
        runId: r.runId, steps: 2, deadlineMs: now + 120_000, clock: () => now,
        resume: resumeOf(r), done: r.done, granted: r.granted,
        beforeEffect: (name) => io.save(markInflight(r, name, now)),
      });
      return { turn };
    },
  };
}

export function pocP20(step?: string) {
  if (step === 'protocol') return { poc: 'P20', step, protocol: PROTOCOL, pass: true };
  if (step && step !== 'run') throw new Error('etapa desconhecida da P20: use protocol ou run');
  const agent = store.listAgents()[0];
  const owner = store.getOwner() ?? '';
  if (!agent || !owner) throw new Error('P20 exige agente cadastrado e dono configurado');
  const io = runIO();
  const cache = CacheService.getScriptCache();
  const base = Date.now();
  const suffix = Utilities.getUuid().slice(0, 8);

  const chatCounts: Counts = { llm: 0, steps: 0, effects: 0 };
  const chatToken = `p20chat${suffix}${'0'.repeat(17)}`;
  const chatNext = `p20next${suffix}${'1'.repeat(17)}`;
  const chat = pendingRun(agent.folderId, owner, `p20-chat-${suffix}`, base, chatToken, chatCounts);
  io.save(chat);
  cache.remove(runCacheKey(chat.folderId, chat.runId));
  const chatParams = { folderId: chat.folderId, runId: chat.runId, token: chatToken, decision: 'approve' };
  const third = decideChatApproval(io, chatParams, 'terceiro@invalid.example', chatNext, base + TEN_MINUTES + 60_000);
  const ownerDecision = decideChatApproval(io, chatParams, owner, chatNext, base + TEN_MINUTES + 60_001);
  const chatDone = ownerDecision.kind === 'accepted' ? pumpById(resumeDeps(io, chatCounts, base + TEN_MINUTES + 60_002), chat.runId) : null;
  const double = decideChatApproval(io, chatParams, owner, chatNext, base + TEN_MINUTES + 60_003);

  const expiredCounts: Counts = { llm: 0, steps: 0, effects: 0 };
  const oldToken = `p20old${suffix}${'2'.repeat(18)}`;
  const freshToken = `p20new${suffix}${'3'.repeat(18)}`;
  const spareToken = `p20spare${suffix}${'4'.repeat(16)}`;
  const expired = pendingRun(agent.folderId, owner, `p20-screen-${suffix}`, base, oldToken, expiredCounts);
  io.save(expired);
  cache.remove(runCacheKey(expired.folderId, expired.runId));
  const refreshed = decideScreenApproval(io, expired, { token: oldToken, decision: 'approve' }, owner, freshToken, base + DAY);
  const afterExpiry = refreshed.kind === 'refreshed' ? refreshed.run : expired;
  const llmCallsAtExpiry = expiredCounts.llm;
  const accepted = decideScreenApproval(io, afterExpiry, { token: freshToken, decision: 'approve' }, owner, spareToken, base + DAY + 1);
  const expiredDone = accepted.kind === 'accepted' ? pumpById(resumeDeps(io, expiredCounts, base + DAY + 2), expired.runId) : null;

  io.dequeue(chat.runId);
  io.dequeue(expired.runId);
  const observed = {
    cacheCleared: true,
    resumedAfterMs: TEN_MINUTES + 60_001,
    chat: { status: chatDone?.status ?? 'failed', third: third.kind, ownerAfterThird: ownerDecision.kind, double: double.kind, llmCalls: chatCounts.llm, effects: chatCounts.effects, steps: chatCounts.steps },
    expired: {
      first: refreshed.kind,
      statusAfterExpiry: afterExpiry.status,
      samePending: afterExpiry.pending?.key === expired.pending?.key && afterExpiry.snapshot?.step === expired.snapshot?.step,
      llmCallsAtExpiry,
      finalStatus: expiredDone?.status ?? 'failed', llmCalls: expiredCounts.llm, effects: expiredCounts.effects, steps: expiredCounts.steps,
    },
    sameStore: third.kind === 'rejected' && ownerDecision.kind === 'accepted' && refreshed.kind === 'refreshed' && accepted.kind === 'accepted',
  } as const;
  return { ...p20Verdict(observed), protocol: PROTOCOL };
}

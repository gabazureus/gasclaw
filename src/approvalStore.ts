// Borda dos tickets de aprovação: CacheService (validade de 10 min) + trava no `take` para garantir uso único.
import { decisionFrom, issueGrant, type Ticket } from './approval';
import type { Tickets } from './chat';
import { newRun, type DurableRun } from './run';
import type { RunIO } from './runStore';

const TTL_S = 600;
const MAX = 95_000; // limite do CacheService é 100 KB por valor

export function cacheTickets(cache = CacheService.getScriptCache(), lock = LockService.getScriptLock()): Tickets {
  return {
    put: (t) => {
      const raw = JSON.stringify(t);
      if (raw.length > MAX) throw new Error('pedido de aprovação grande demais para guardar (conversa longa): tente de novo com algo menor');
      cache.put(`t:${t.token}`, raw, TTL_S);
      if (t.pending.kind === 'ask') cache.put(`ask:${t.session}`, t.token, TTL_S);
    },
    take: (token) => {
      if (!lock.tryLock(10_000)) throw new Error('aprovação ocupada: clique de novo em alguns segundos');
      try {
        const raw = cache.get(`t:${token}`);
        if (!raw) return null;
        cache.remove(`t:${token}`);
        const t = JSON.parse(raw) as Ticket;
        if (t.pending.kind === 'ask') cache.remove(`ask:${t.session}`);
        return t;
      } finally {
        lock.releaseLock();
      }
    },
    open: (session) => cache.get(`ask:${session}`),
  };
}

/** 32 caracteres hex aleatórios (UUID v4 sem hífens). */
export const newToken = (): string => Utilities.getUuid().replace(/-/g, '');

/** SHA-256 nativo do GAS; bytes são assinados, por isso a normalização antes do hex. */
export const hashToken = (token: string): string => Utilities
  .computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
  .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
  .join('');

/** minimal: só aprovações de tool migram na P20; `ask` continua no ticket legado de 10 min. */
export function durableTickets(io: RunIO, legacy: Tickets = cacheTickets(), hash: (token: string) => string = hashToken): Tickets {
  return {
    put: (t) => {
      if (t.pending.kind === 'ask') return legacy.put(t);
      if (!t.folderId) throw new Error('aprovação sem pasta do agente');
      const now = t.issuedAt ?? (t.expiresAt - TTL_S * 1000);
      const run = {
        ...newRun({ runId: t.runId, session: t.session, folderId: t.folderId, user: t.user, text: t.text, now, ownerDm: t.ownerDm }),
        status: 'waiting' as const,
        snapshot: t.state,
        pending: t.pending,
        done: t.done,
        granted: t.granted,
        approval: issueGrant(t.pending, t.user, hash(t.token), now),
        answer: t.prompt,
      };
      io.save(run);
    },
    take: legacy.take,
    open: legacy.open,
  };
}

/** Adaptador usado pelo callback real do Google Chat e pela POC P20. */
export function decideChatApproval(io: RunIO, params: Record<string, string>, actor: string, replacementToken: string, now: number, hash: (token: string) => string = hashToken) {
  const decision = params.decision === 'approve' ? { approved: true } : params.decision === 'deny' ? { approved: false } : null;
  if (!decision) return { kind: 'rejected' as const, error: 'decisão inválida' };
  return io.decide(String(params.folderId ?? ''), String(params.runId ?? ''), {
    tokenHash: hash(String(params.token ?? '')),
    actor,
    decision,
    replacementHash: hash(replacementToken),
  }, now);
}

/** Adaptador usado pela decisão real da tela e pela POC P20. */
export function decideScreenApproval(io: RunIO, run: DurableRun, params: Record<string, string>, actor: string, replacementToken: string, now: number, hash: (token: string) => string = hashToken) {
  const decision = run.pending ? decisionFrom(run.pending, params) : null;
  if (!decision || run.pending?.kind !== 'approval') return { kind: 'rejected' as const, error: 'resposta inválida para este pedido' };
  return io.decide(run.folderId, run.runId, {
    tokenHash: hash(String(params.token ?? '')),
    actor,
    decision,
    replacementHash: hash(replacementToken),
  }, now);
}

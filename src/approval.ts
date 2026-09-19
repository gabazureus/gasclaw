// Aprovação e ask (E5), núcleo puro: ticket de uso único com validade de 10 min (spec §8) e o card do Chat.
import type { Decision, Pending, Snapshot } from './agent';
import type { Message } from './llm';
import type { DurableRun } from './run';

export const TICKET_TTL_MS = 600_000;
export const APPROVAL_TTL_MS = 86_400_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

export type ApprovalGrant = {
  tokenHash: string;
  pendingKey: string;
  user: string;
  issuedAt: number;
  expiresAt: number;
};

export type GrantResult =
  | { kind: 'accepted'; run: DurableRun }
  | { kind: 'refreshed'; run: DurableRun }
  | { kind: 'rejected'; error: string; run: DurableRun };

export function issueGrant(pending: Pending, user: string, tokenHash: string, now: number): ApprovalGrant {
  const normalizedUser = user.trim().toLowerCase();
  if (pending.kind !== 'approval' || !pending.key || !normalizedUser || !HASH_RE.test(tokenHash) || !Number.isFinite(now)) throw new Error('invalid approval credential');
  return { tokenHash, pendingKey: pending.key, user: normalizedUser, issuedAt: now, expiresAt: now + APPROVAL_TTL_MS };
}

/** Compara hashes sem saída antecipada; o token bruto nunca entra no estado durável. */
function sameHash(a: string, b: string): boolean {
  if (!HASH_RE.test(a) || !HASH_RE.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Transição pura da aprovação. A borda lê/grava o run no Drive sob trava. */
export function redeemGrant(r: DurableRun, tokenHash: string, actor: string, decision: Decision, now: number, replacementHash: string): GrantResult {
  if (r.status !== 'waiting' || r.pending?.kind !== 'approval' || !r.snapshot || !r.approval) {
    return { kind: 'rejected', error: 'this request was already answered, or is not waiting for approval', run: r };
  }
  const g = r.approval;
  const owner = r.user.toLowerCase();
  const validGrant = HASH_RE.test(g.tokenHash)
    && g.pendingKey === r.pending.key
    && g.user === owner
    && Number.isFinite(g.issuedAt)
    && Number.isFinite(g.expiresAt)
    && Number.isFinite(now)
    && now >= g.issuedAt
    && g.expiresAt - g.issuedAt === APPROVAL_TTL_MS;
  if (!validGrant || !sameHash(g.tokenHash, tokenHash)) return { kind: 'rejected', error: 'invalid request', run: r };
  if (actor.toLowerCase() !== owner) return { kind: 'rejected', error: 'only the person who made the request can answer it', run: r };
  if (now >= g.expiresAt) {
    try {
      return { kind: 'refreshed', run: { ...r, approval: issueGrant(r.pending, owner, replacementHash, now), updatedAt: now } };
    } catch {
      return { kind: 'rejected', error: 'could not renew this request', run: r };
    }
  }
  return { kind: 'accepted', run: { ...r, status: 'queued', decision, approval: undefined, answer: undefined, updatedAt: now } };
}

/** Tudo que é preciso para retomar o turno depois do clique. `session` = chave do histórico (agente:espaço). */
export type Ticket = {
  token: string;
  user: string;
  session: string;
  text: string;
  history: Message[];
  state: Snapshot;
  pending: Pending;
  granted: string[];
  /** Tools já executadas neste run (runId:step:callId → resultado): evita reexecutar entre execuções. */
  done: Record<string, string>;
  runId: string;
  expiresAt: number;
  folderId?: string;
  /** A pendência nasceu numa DM do dono; não pode ser inferido só pelo e-mail ao retomar. */
  ownerDm?: boolean;
  issuedAt?: number;
  prompt?: string;
};
/** `take` lê e apaga numa operação só (a borda usa trava): é o que garante o uso único. */
export type TicketStore = { put: (t: Ticket) => void; take: (token: string) => Ticket | null };

export function issue(t: Omit<Ticket, 'token' | 'expiresAt'>, token: string, now: number): Ticket {
  if (!TOKEN_RE.test(token)) throw new Error('weak or malformed approval token');
  return { ...t, user: t.user.toLowerCase(), token, issuedAt: now, expiresAt: now + TICKET_TTL_MS };
}

export function redeem(store: TicketStore, token: string, user: string, now: number): { ok: true; ticket: Ticket } | { ok: false; error: string } {
  if (!TOKEN_RE.test(token)) return { ok: false, error: 'invalid request' };
  const t = store.take(token);
  if (!t) return { ok: false, error: 'this request was already answered, or it expired' };
  if (now > t.expiresAt) return { ok: false, error: 'this request expired (10 min): ask again' };
  if (t.user !== user.toLowerCase()) {
    store.put(t);
    return { ok: false, error: 'only the person who made the request can answer it' };
  }
  return { ok: true, ticket: t };
}

export function decisionFrom(p: Pending, params: { decision?: string; answer?: string }): Decision | null {
  if (p.kind === 'approval') return params.decision === 'approve' ? { approved: true } : params.decision === 'deny' ? { approved: false } : null;
  const answer = params.answer?.trim() ?? '';
  return answer && answer.length <= 500 ? { answer } : null;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const button = (text: string, token: string, key: 'decision' | 'answer', value: string, ref?: { folderId: string; runId: string }) => ({
  text,
  onClick: { action: { function: 'onCardClick', parameters: [...(ref ? [{ key: 'folderId', value: ref.folderId }, { key: 'runId', value: ref.runId }] : []), { key: 'token', value: token }, { key, value }] } },
});
type Button = ReturnType<typeof button>;
type Widget = { textParagraph: { text: string } } | { buttonList: { buttons: Button[] } };

/** Mensagem do Chat com o card (cardsV2). O clique chega como evento CARD_CLICKED com common.parameters. */
export function approvalCard(t: Pick<Ticket, 'token' | 'pending' | 'runId' | 'folderId'>, text: string): { text: string; cardsV2: { cardId: string; card: { header: { title: string }; sections: { widgets: Widget[] }[] } }[] } {
  const ask = t.pending.kind === 'ask';
  const ref = !ask && t.folderId ? { folderId: t.folderId, runId: t.runId } : undefined;
  const options = ask
    ? String(t.pending.args.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).slice(0, 6)
    : [];
  const buttons = ask
    ? options.map((o) => button(o.slice(0, 40), t.token, 'answer', o))
    : [button('Approve', t.token, 'decision', 'approve', ref), button('Deny', t.token, 'decision', 'deny', ref)];
  const widgets: Widget[] = [{ textParagraph: { text: escape(text) } }, ...(buttons.length ? [{ buttonList: { buttons } }] : [])];
  return { text: ask ? 'The agent has a question.' : 'This action needs your approval.', cardsV2: [{ cardId: ask ? 'question' : 'approval', card: { header: { title: ask ? 'The agent has a question' : `Approval needed (valid for ${ref ? '24 h' : '10 min'})` }, sections: [{ widgets }] } }] };
}

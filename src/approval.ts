// Aprovação e ask (E5), núcleo puro: ticket de uso único com validade de 10 min (spec §8) e o card do Chat.
import type { Decision, Pending, Snapshot } from './agent';
import type { Message } from './llm';

export const TICKET_TTL_MS = 600_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

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
  runId: string;
  expiresAt: number;
};
/** `take` lê e apaga numa operação só (a borda usa trava): é o que garante o uso único. */
export type TicketStore = { put: (t: Ticket) => void; take: (token: string) => Ticket | null };

export function issue(t: Omit<Ticket, 'token' | 'expiresAt'>, token: string, now: number): Ticket {
  if (!TOKEN_RE.test(token)) throw new Error('token de aprovação fraco ou malformado');
  return { ...t, user: t.user.toLowerCase(), token, expiresAt: now + TICKET_TTL_MS };
}

export function redeem(store: TicketStore, token: string, user: string, now: number): { ok: true; ticket: Ticket } | { ok: false; error: string } {
  if (!TOKEN_RE.test(token)) return { ok: false, error: 'pedido inválido' };
  const t = store.take(token);
  if (!t) return { ok: false, error: 'este pedido já foi respondido ou expirou' };
  if (now > t.expiresAt) return { ok: false, error: 'este pedido expirou (10 min): peça de novo' };
  if (t.user !== user.toLowerCase()) {
    store.put(t);
    return { ok: false, error: 'só quem fez o pedido pode responder' };
  }
  return { ok: true, ticket: t };
}

export function decisionFrom(p: Pending, params: { decision?: string; answer?: string }): Decision | null {
  if (p.kind === 'approval') return params.decision === 'approve' ? { approved: true } : params.decision === 'deny' ? { approved: false } : null;
  const answer = params.answer?.trim() ?? '';
  return answer && answer.length <= 500 ? { answer } : null;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const button = (text: string, token: string, key: 'decision' | 'answer', value: string) => ({
  text,
  onClick: { action: { function: 'onCardClick', parameters: [{ key: 'token', value: token }, { key, value }] } },
});
type Button = ReturnType<typeof button>;
type Widget = { textParagraph: { text: string } } | { buttonList: { buttons: Button[] } };

/** Mensagem do Chat com o card (cardsV2). O clique chega como evento CARD_CLICKED com common.parameters. */
export function approvalCard(t: Ticket, text: string): { text: string; cardsV2: { cardId: string; card: { header: { title: string }; sections: { widgets: Widget[] }[] } }[] } {
  const ask = t.pending.kind === 'ask';
  const options = ask
    ? String(t.pending.args.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).slice(0, 6)
    : [];
  const buttons = ask
    ? options.map((o) => button(o.slice(0, 40), t.token, 'answer', o))
    : [button('Aprovar', t.token, 'decision', 'approve'), button('Negar', t.token, 'decision', 'deny')];
  const widgets: Widget[] = [{ textParagraph: { text: escape(text) } }, ...(buttons.length ? [{ buttonList: { buttons } }] : [])];
  return { text, cardsV2: [{ cardId: ask ? 'pergunta' : 'aprovacao', card: { header: { title: ask ? 'Pergunta do agente' : 'Aprovação necessária (vale 10 min)' }, sections: [{ widgets }] } }] };
}

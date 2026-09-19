import { describe, expect, test } from 'vitest';
import type { Pending } from '../src/agent';
import { approvalCard, decisionFrom, issue, redeem, TICKET_TTL_MS, type Ticket, type TicketStore } from '../src/approval';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const approval: Pending = { kind: 'approval', name: 'memory.remove', callId: 'c1', key: 'r:0:c1', args: { text: '10h' } };
const askP: Pending = { kind: 'ask', name: 'ask', callId: 'c1', key: 'r:0:c1', args: { question: 'Qual sala?', options: 'A, B' } };

function memStore(): TicketStore & { data: Map<string, Ticket> } {
  const data = new Map<string, Ticket>();
  return {
    data,
    put: (t) => void data.set(t.token, t),
    take: (tok) => {
      const t = data.get(tok) ?? null;
      data.delete(tok);
      return t;
    },
  };
}
const base = { user: 'dono@x.com', session: 'f1:spaces/D', text: 'apague 10h', history: [], state: { messages: [], step: 0, queue: [] }, pending: approval, granted: [], done: {}, runId: 'r' };

describe('tickets de aprovação (uso único, 10 min)', () => {
  test('issue grava validade de 10 min; token fraco é recusado', () => {
    expect(issue(base, TOKEN, 1000).expiresAt).toBe(1000 + TICKET_TTL_MS);
    expect(() => issue(base, 'curto', 1000)).toThrow('token');
  });
  test('redeem: uso único', () => {
    const s = memStore();
    s.put(issue(base, TOKEN, 0));
    expect(redeem(s, TOKEN, 'DONO@x.com', 10)).toMatchObject({ ok: true, ticket: { token: TOKEN } });
    expect(redeem(s, TOKEN, 'dono@x.com', 11)).toEqual({ ok: false, error: 'this request was already answered, or it expired' });
  });
  test('redeem: expirado após 10 min', () => {
    const s = memStore();
    s.put(issue(base, TOKEN, 0));
    expect(redeem(s, TOKEN, 'dono@x.com', TICKET_TTL_MS + 1)).toEqual({ ok: false, error: 'this request expired (10 min): ask again' });
  });
  test('redeem: outra pessoa não responde e não consome o pedido', () => {
    const s = memStore();
    s.put(issue(base, TOKEN, 0));
    expect(redeem(s, TOKEN, 'ana@x.com', 1)).toEqual({ ok: false, error: 'only the person who made the request can answer it' });
    expect(redeem(s, TOKEN, 'dono@x.com', 2).ok).toBe(true);
  });
  test('redeem: token malformado nem consulta o store', () => {
    let touched = false;
    const s: TicketStore = { put: () => {}, take: () => ((touched = true), null) };
    expect(redeem(s, 'x"; drop', 'dono@x.com', 1)).toEqual({ ok: false, error: 'invalid request' });
    expect(touched).toBe(false);
  });
});

describe('decisionFrom', () => {
  test('aprovação: approve/deny; qualquer outra coisa é inválida', () => {
    expect(decisionFrom(approval, { decision: 'approve' })).toEqual({ approved: true });
    expect(decisionFrom(approval, { decision: 'deny' })).toEqual({ approved: false });
    expect(decisionFrom(approval, { decision: 'sim' })).toBeNull();
    expect(decisionFrom(approval, { answer: 'A' })).toBeNull();
  });
  test('ask: resposta não vazia com até 500 caracteres', () => {
    expect(decisionFrom(askP, { answer: ' B ' })).toEqual({ answer: 'B' });
    expect(decisionFrom(askP, { answer: '  ' })).toBeNull();
    expect(decisionFrom(askP, { answer: 'x'.repeat(501) })).toBeNull();
    expect(decisionFrom(askP, { decision: 'approve' })).toBeNull();
  });
});

describe('approvalCard (Chat cardsV2)', () => {
  const buttons = (m: ReturnType<typeof approvalCard>) => m.cardsV2[0].card.sections[0].widgets.flatMap((w) => ('buttonList' in w ? w.buttonList.buttons : []));
  test('aprovação: Aprovar e Negar chamam onCardClick com token e decisão; texto escapado', () => {
    const m = approvalCard(issue(base, TOKEN, 0), 'Posso usar <b>memory.remove</b>?');
    expect(m.text).toBe('This action needs your approval.');
    const [yes, no] = buttons(m);
    expect(yes.text).toBe('Approve');
    expect(yes.onClick.action).toEqual({ function: 'onCardClick', parameters: [{ key: 'token', value: TOKEN }, { key: 'decision', value: 'approve' }] });
    expect(no.onClick.action.parameters[1]).toEqual({ key: 'decision', value: 'deny' });
    expect(JSON.stringify(m.cardsV2)).toContain('&lt;b&gt;');
  });
  test('card mantém texto não confiável literal em HTML escapado, sem interpretar Markdown', () => {
    const m = approvalCard(issue(base, TOKEN, 0), '[site inocente](https://destino-real.example) <b>forte</b>');
    expect(m.text).toBe('This action needs your approval.');
    expect(m.text).not.toContain('destino-real');
    expect(m.cardsV2[0].card.sections[0].widgets[0]).toEqual({
      textParagraph: { text: '[site inocente](https://destino-real.example) &lt;b&gt;forte&lt;/b&gt;' },
    });
  });
  test('ask com opções: um botão por opção (answer)', () => {
    const m = approvalCard(issue({ ...base, pending: askP }, TOKEN, 0), 'Qual sala?');
    expect(m.text).toBe('The agent has a question.');
    expect(buttons(m).map((b) => [b.text, b.onClick.action.parameters[1]])).toEqual([
      ['A', { key: 'answer', value: 'A' }],
      ['B', { key: 'answer', value: 'B' }],
    ]);
  });
  test('P20: card durável leva referência mínima e informa 24 h', () => {
    const m = approvalCard(issue({ ...base, folderId: 'f1' }, TOKEN, 0), 'Posso enviar?');
    const params = buttons(m)[0].onClick.action.parameters;
    expect(params).toEqual([
      { key: 'folderId', value: 'f1' },
      { key: 'runId', value: 'r' },
      { key: 'token', value: TOKEN },
      { key: 'decision', value: 'approve' },
    ]);
    expect(m.cardsV2[0].card.header.title).toContain('24 h');
  });
});

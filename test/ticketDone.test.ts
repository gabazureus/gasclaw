import { describe, expect, test } from 'vitest';
import type { TurnResult } from '../src/agent';
import { issue, type Ticket } from '../src/approval';
import { handleChat, type ChatDeps, type ChatEvent, type Tickets } from '../src/chat';
import type { Completion } from '../src/llm';
import type { Tool, ToolCtx } from '../src/tools/registry';
import { buildSpec, withAccess } from '../src/workspace';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const conta = { n: 0 };
const contador: Tool = { name: 'conta.save', description: 'conta execuções', parameters: { type: 'object', properties: {}, additionalProperties: false }, approval: 'never', run: () => `execução ${++conta.n}` };
const risky: Tool = { name: 'risco.send', description: 'pede aprovação', parameters: { type: 'object', properties: {}, additionalProperties: false }, approval: 'always', run: () => 'enviado' };
const chamada = (id: string, name: string) => ({ id, type: 'function' as const, function: { name, arguments: '{}' } });

function setup() {
  const data = new Map<string, Ticket>();
  const tickets: Tickets = {
    put: (t) => void data.set(t.token, t),
    take: (k) => {
      const t = data.get(k) ?? null;
      data.delete(k);
      return t;
    },
  };
  const turns: TurnResult[] = [];
  const script: Completion[] = [
    { text: '', toolCalls: [chamada('c1', 'conta_save'), chamada('c2', 'risco_send')] },
    { text: 'Pronto.' },
  ];
  const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => {} } };
  const d: ChatDeps = {
    enabled: () => true,
    owner: () => 'dono@x.com',
    apiKey: () => 'sk-or-x',
    defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
    load: () => withAccess(buildSpec('f1', 'A', { AGENTS: 'Regras' }), { users: [], tools: [] }),
    history: () => [],
    saveHistory: () => {},
    llm: () => script.shift() ?? { text: 'fim' },
    toolkit: () => ({ tools: [contador, risky], ctx, steps: 4 }),
    tickets,
    newToken: () => TOKEN,
    clock: () => 1,
    onTurn: (t) => void turns.push(t),
  };
  return { d, data, turns };
}
const dm = (text: string): ChatEvent => ({ type: 'MESSAGE', message: { name: 'spaces/D/messages/M1', text }, user: { email: 'dono@x.com' }, space: { name: 'spaces/D', singleUserBotDm: true } });
const clique = (): ChatEvent => ({ type: 'CARD_CLICKED', user: { email: 'dono@x.com' }, space: { name: 'spaces/D', singleUserBotDm: true }, common: { parameters: { token: TOKEN, decision: 'approve' } } });

describe('o que já rodou antes da aprovação não roda de novo (idempotência entre execuções)', () => {
  test('o ticket guarda o done do turno e a retomada é semeada com ele', () => {
    conta.n = 0;
    const { d, data, turns } = setup();
    handleChat(dm('faça'), d);
    const ticket = [...data.values()][0];
    expect(Object.values(ticket.done)).toEqual(['execução 1']); // conta.save rodou antes do card
    expect(conta.n).toBe(1);

    handleChat(clique(), d);
    expect(conta.n).toBe(1); // não rodou de novo na retomada
    expect(turns[1].done['spaces/D/messages/M1:0:c1']).toBe('execução 1'); // done semeado no runTurn
    expect(turns[1].events.some((ev) => ev.name === 'risco.send' && ev.status === 'approved')).toBe(true);
  });

  test('issue exige o done (o Ticket carrega o estado, não só a pendência)', () => {
    const t = issue(
      { user: 'dono@x.com', session: 'f1:spaces/D', text: 'x', history: [], state: { messages: [], step: 0, queue: [] }, pending: { kind: 'approval', name: 'risco.send', callId: 'c2', key: 'k', args: {} }, granted: [], done: { 'k:0:c1': 'ok' }, runId: 'r' },
      TOKEN,
      0,
    );
    expect(t.done).toEqual({ 'k:0:c1': 'ok' });
  });
});

import { describe, expect, test } from 'vitest';
import { runTurn } from '../src/agent';
import type { Ticket } from '../src/approval';
import { handleChat, type ChatDeps, type ChatEvent, type Tickets } from '../src/chat';
import type { Completion } from '../src/llm';
import { ownerGoogle, type GReq } from '../src/tools/google';
import { allowedTools, TOOLS, type ToolCtx } from '../src/tools/registry';
import { buildSpec, withAccess } from '../src/workspace';

const call = (name: string, args: string): Completion => ({ text: '', toolCalls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }] });

describe('ferramentas do Google são só do dono (revisão E6, blocker 2)', () => {
  // `skill.write` entra nesta lista (auditoria de 2026-09-23): ela GRAVA na pasta do dono, e o texto
  // gravado vira instrução no prompt de TODO turno seguinte, inclusive nas DMs do dono. Quem aprova um
  // card é quem PEDIU (`redeemGrant`), então sem isto um usuário aprovado no painel — que não é o dono —
  // escrevia na pasta dele e aprovava a si mesmo.
  test('as tools do Workspace e a escrita de skill são ownerOnly; now, memory e ask não', () => {
    const google = ['calendar', 'gmail', 'contacts', 'tasks', 'drive'];
    const daPasta = ['skill.write'];
    for (const t of TOOLS) expect([t.name, t.ownerOnly === true]).toEqual([t.name, google.some((g) => allowedTools([g]).includes(t)) || daPasta.includes(t.name)]);
    expect(allowedTools(['drive']).every((t) => t.ownerOnly)).toBe(true);
  });

  test('runTurn: não dono pedindo skill.write → recusado ANTES do card, e a pasta não é tocada', () => {
    const gravadas: string[] = [];
    const ctx: ToolCtx = { now: () => '', ownerDm: false, isOwner: false, memory: { read: () => '', write: () => {} }, skillWrite: (n) => (gravadas.push(n), 'created') };
    const script = [call('skill_write', '{"name":"x-y","description":"d","body":"b"}'), { text: 'não posso' }];
    const r = runTurn({ system: 's', history: [], text: 'salve', tools: allowedTools(['skill']), ctx, llm: () => script.shift()!, runId: 'r', steps: 3, deadlineMs: 1e12, clock: () => 0 });
    expect(r.events[0]).toMatchObject({ name: 'skill.write', status: 'refused' });
    expect(r.pending).toBeUndefined(); // nem chegou a virar card
    expect(gravadas).toEqual([]);
  });

  // A recusa precisa dizer QUAL ferramenta foi recusada. A mensagem antiga falava só do Google, e uma
  // skill recusada chegava ao modelo como "as ferramentas do Google são só do dono" — mentira.
  test('a recusa nomeia a ferramenta, e não finge que toda ownerOnly é do Google', () => {
    const ctx: ToolCtx = { now: () => '', ownerDm: false, isOwner: false, memory: { read: () => '', write: () => {} }, skillWrite: () => 'created' };
    const script = [call('skill_write', '{"name":"x-y","description":"d","body":"b"}'), { text: 'ok' }];
    const r = runTurn({ system: 's', history: [], text: 'salve', tools: allowedTools(['skill']), ctx, llm: () => script.shift()!, runId: 'r', steps: 3, deadlineMs: 1e12, clock: () => 0 });
    expect(r.events[0].result).toContain('skill.write');
    expect(r.events[0].result).toContain('só do dono');
  });

  test('ownerGoogle recusa quem não é o dono mesmo com google no contexto', () => {
    expect(() => ownerGoogle({ google: () => ({ code: 200, body: '{}' }), isOwner: false })).toThrow('só do dono');
    expect(() => ownerGoogle({ isOwner: true })).toThrow('indisponíveis');
  });

  test('runTurn: não dono pedindo gmail.read → recusado, sem chamar o Google', () => {
    const reqs: GReq[] = [];
    const ctx: ToolCtx = { now: () => '', ownerDm: false, isOwner: false, memory: { read: () => '', write: () => {} }, google: (r) => (reqs.push(r), { code: 200, body: '{}' }) };
    const script = [call('gmail_read', '{"id":"m1abcdef"}'), { text: 'não posso' }];
    const r = runTurn({ system: 's', history: [], text: 'leia', tools: allowedTools(['gmail']), ctx, llm: () => script.shift()!, runId: 'r', steps: 3, deadlineMs: 1e12, clock: () => 0 });
    expect(r.events[0]).toMatchObject({ name: 'gmail.read', status: 'refused' });
    expect(r.events[0].result).toContain('só do dono');
    expect(reqs).toHaveLength(0);
  });

  test('runTurn: não dono pedindo gmail.send (always) → recusado ANTES do card', () => {
    const ctx: ToolCtx = { now: () => '', ownerDm: false, isOwner: false, memory: { read: () => '', write: () => {} } };
    const script = [call('gmail_send', '{"to":"a@b.co","subject":"s","body":"b"}'), { text: 'ok' }];
    const r = runTurn({ system: 's', history: [], text: 'envie', tools: allowedTools(['gmail']), ctx, llm: () => script.shift()!, runId: 'r', steps: 3, deadlineMs: 1e12, clock: () => 0 });
    expect(r.pending).toBeUndefined();
    expect(r.events[0].status).toBe('refused');
  });
});

describe('handleChat com usuário aprovado que não é o dono', () => {
  function setup(script: Completion[]) {
    const reqs: GReq[] = [];
    const data = new Map<string, Ticket>();
    const tickets: Tickets = {
      put: (t) => void data.set(t.token, t),
      take: (k) => {
        const t = data.get(k) ?? null;
        data.delete(k);
        return t;
      },
    };
    let n = 0;
    const d: ChatDeps = {
      enabled: () => true,
      owner: () => 'dono@x.com',
      apiKey: () => 'sk-or-x',
      defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
      load: () => withAccess(buildSpec('f1', 'A', { AGENTS: 'Regras' }), { users: ['ana@x.com'], tools: ['gmail'] }),
      history: () => [],
      saveHistory: () => {},
      llm: () => script.shift() ?? { text: 'fim' },
      toolkit: (_s, ownerDm) => ({ tools: allowedTools(['gmail']), ctx: { now: () => '', ownerDm, memory: { read: () => '', write: () => {} }, google: (r) => (reqs.push(r), { code: 200, body: '{"id":"sent1"}' }) }, steps: 5 }),
      tickets,
      newToken: () => `tok${String(++n).padStart(29, '0')}`,
      clock: () => 1,
    };
    return { d, reqs, data };
  }
  const space = { name: 'spaces/S1' };
  const msg = (email: string, text: string): ChatEvent => ({ type: 'MESSAGE', message: { text }, user: { email }, space });

  test('ana (aprovada no painel) pede gmail.read → recusado, e-mail do dono não é lido', () => {
    let turn: { events: { name: string; status: string }[] } | undefined;
    const { d, reqs } = setup([call('gmail_read', '{"id":"m1abcdef"}'), { text: 'Não posso ler.' }]);
    expect(handleChat(msg('ana@x.com', 'leia o último e-mail'), { ...d, onTurn: (t) => void (turn = t) }).text).toBe('Não posso ler.');
    expect(turn?.events[0]).toMatchObject({ name: 'gmail.read', status: 'refused' });
    expect(reqs).toHaveLength(0);
  });

  test('o dono num espaço (não DM) usa o Google normalmente', () => {
    const { d, reqs } = setup([call('gmail_read', '{"id":"m1abcdef"}'), { text: 'Li.' }]);
    handleChat(msg('dono@x.com', 'leia'), d);
    expect(reqs).toHaveLength(1);
  });

  test('ana não aprova o gmail.send pendente do dono (e nada é enviado)', () => {
    const { d, reqs } = setup([call('gmail_send', '{"to":"dono@x.com","subject":"s","body":"b"}'), { text: 'Enviado.' }]);
    const card = handleChat(msg('dono@x.com', 'envie'), d);
    const token = JSON.stringify(card.cardsV2).match(/"key":"token","value":"(\w+)"/)![1];
    const r = handleChat({ type: 'CARD_CLICKED', user: { email: 'ana@x.com' }, space, common: { parameters: { token, decision: 'approve' } } }, d);
    expect(r.text).toContain('only the person who made');
    expect(reqs).toHaveLength(0);
  });

  test('ana não consegue gerar um card de gmail.send para aprovar ela mesma', () => {
    const { d, data } = setup([call('gmail_send', '{"to":"atacante@example.com","subject":"s","body":"b"}'), { text: 'Não posso.' }]);
    const r = handleChat(msg('ana@x.com', 'envie'), d);
    expect(r.cardsV2).toBeUndefined();
    expect(data.size).toBe(0);
  });
});

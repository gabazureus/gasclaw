import { describe, expect, test } from 'vitest';
import type { Ticket } from '../src/approval';
import { handleChat, type ChatDeps, type ChatEvent, type Tickets } from '../src/chat';
import type { Completion, Message } from '../src/llm';
import { allowedTools } from '../src/tools/registry';
import { buildSpec } from '../src/workspace';

function deps(over: Partial<ChatDeps> = {}): ChatDeps & { saved: Record<string, Message[]> } {
  const saved: Record<string, Message[]> = {};
  return {
    saved,
    enabled: () => true,
    owner: () => 'dono@x.com',
    apiKey: () => 'sk',
    defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
    load: () => buildSpec('f1', 'A', { AGENTS: '---\nusers: [ana@x.com]\n---\nRegras' }),
    history: () => [],
    saveHistory: (k, h) => {
      saved[k] = h;
    },
    llm: () => ({ text: 'olá' }),
    ...over,
  };
}
const msg = (email: string, text = 'oi'): ChatEvent => ({ type: 'MESSAGE', message: { text, argumentText: ` ${text}` }, user: { email }, space: { name: 'spaces/S1' } });
const noMem = { read: () => '', write: () => {} };

describe('handleChat', () => {
  test('boas-vindas ao ser adicionado', () => {
    expect(handleChat({ type: 'ADDED_TO_SPACE', user: { email: 'a@x.com' }, space: { name: 'spaces/S1' } }, deps()).text).toContain('gasclaw');
  });
  test('usuário autorizado recebe resposta e histórico é salvo por agente+espaço', () => {
    const d = deps();
    expect(handleChat(msg('ana@x.com'), d)).toEqual({ text: 'olá' });
    expect(d.saved['f1:spaces/S1']).toHaveLength(2);
  });
  test('usa argumentText (sem a menção) quando existe', () => {
    let last = '';
    const d = deps({ llm: (_k, _m, ms) => ((last = ms[ms.length - 1].content), { text: 'ok' }) });
    handleChat(msg('ana@x.com', 'resuma'), d);
    expect(last).toBe('resuma');
  });
  test('usuário não autorizado é recusado sem chamar o LLM', () => {
    let called = false;
    const r = handleChat(msg('bob@x.com'), deps({ llm: () => ((called = true), { text: 'x' }) }));
    expect(r.text).toContain('não tem acesso');
    expect(called).toBe(false);
  });
  test('kill switch desligado', () => expect(handleChat(msg('ana@x.com'), deps({ enabled: () => false })).text).toContain('pausado'));
  test('sem agente configurado', () => expect(handleChat(msg('dono@x.com'), deps({ defaultAgent: () => null })).text).toContain('Nenhum agente'));
  test('sem chave', () => expect(handleChat(msg('dono@x.com'), deps({ apiKey: () => null })).text).toContain('chave do OpenRouter'));
  test('toolkit: DM do dono recebe tools + memória; espaço não lê a memória', () => {
    const seen: { msgs: Message[]; defs: number }[] = [];
    let reads = 0;
    const d = deps({
      toolkit: (_s, ownerDm) => ({ tools: allowedTools(['now']), ctx: { now: () => '10:00', ownerDm, memory: { read: () => (reads++, '- prefiro 10h'), write: () => {} } }, steps: 3 }),
      llm: (_k, _m, ms, defs = []) => (seen.push({ msgs: ms, defs: defs.length }), { text: 'ok' }),
    });
    handleChat({ ...msg('dono@x.com'), space: { name: 'spaces/D', singleUserBotDm: true } }, d);
    handleChat(msg('dono@x.com'), d);
    expect(seen[0].defs).toBe(1);
    expect(seen[0].msgs.some((m) => m.content.includes('prefiro 10h'))).toBe(true);
    expect(seen[1].msgs.some((m) => m.content.includes('prefiro 10h'))).toBe(false);
    expect(reads).toBe(1);
  });
  test('DM de outra pessoa não é DM do dono', () => {
    let dm: boolean | undefined;
    handleChat({ ...msg('ana@x.com'), space: { name: 'spaces/D', type: 'DM' } }, deps({ toolkit: (_s, ownerDm) => ((dm = ownerDm), { tools: [], ctx: { now: () => '', ownerDm, memory: noMem }, steps: 1 }) }));
    expect(dm).toBe(false);
  });
  test('runId vem do nome da mensagem do Chat (reentrega do mesmo evento = mesma chave)', () => {
    let key = '';
    const d = deps({
      toolkit: (_s, ownerDm) => ({ tools: allowedTools(['now']), ctx: { now: () => '10:00', ownerDm, memory: noMem }, steps: 3 }),
      llm: (() => {
        const s: Completion[] = [{ text: '', toolCalls: [{ id: 'c1', type: 'function', function: { name: 'now', arguments: '{}' } }] }, { text: 'ok' }];
        return () => s.shift()!;
      })(),
      onTurn: (t) => void (key = t.events[0].key),
    });
    handleChat({ ...msg('dono@x.com'), message: { name: 'spaces/S1/messages/M9', text: 'hora?' } }, d);
    expect(key).toBe('spaces/S1/messages/M9:0:c1');
  });
  test('erro do LLM vira mensagem amigável', () => {
    const r = handleChat(msg('dono@x.com'), deps({ llm: () => { throw new Error('OpenRouter 500: boom'); } }));
    expect(r.text).toContain('OpenRouter 500');
  });
});

describe('handleChat: aprovação e ask (E5)', () => {
  const call = (name: string, args: string) => ({ text: '', toolCalls: [{ id: 'c1', type: 'function' as const, function: { name, arguments: args } }] });
  const space = { name: 'spaces/D', singleUserBotDm: true };
  const dm = (text: string, email = 'dono@x.com'): ChatEvent => ({ type: 'MESSAGE', message: { text }, user: { email }, space });
  const click = (token: string, params: Record<string, string>, email = 'dono@x.com'): ChatEvent => ({ type: 'CARD_CLICKED', user: { email }, space, common: { parameters: { token, ...params } } });
  const tokenOf = (r: { cardsV2?: unknown[] }) => JSON.stringify(r.cardsV2).match(/"key":"token","value":"(\w+)"/)?.[1] ?? '';

  function setup(script: Completion[], withTickets = true) {
    const data = new Map<string, Ticket>();
    const asks = new Map<string, string>();
    const tickets: Tickets = {
      put: (t) => {
        data.set(t.token, t);
        if (t.pending.kind === 'ask') asks.set(t.session, t.token);
      },
      take: (tok) => {
        const t = data.get(tok) ?? null;
        data.delete(tok);
        if (t) asks.delete(t.session);
        return t;
      },
      open: (s) => asks.get(s) ?? null,
    };
    let n = 0;
    const mem = { text: '- prefiro café\n' };
    const sent: Message[][] = [];
    const d = deps({
      toolkit: (_s, ownerDm) => ({ tools: allowedTools(['memory', 'ask']), ctx: { now: () => '', ownerDm, memory: { read: () => mem.text, write: (x) => void (mem.text = x) } }, steps: 5 }),
      llm: (_k, _m, ms) => (sent.push(structuredClone(ms)), script.shift() ?? { text: 'fim' }),
      ...(withTickets ? { tickets, newToken: () => `tok${String(++n).padStart(29, '0')}` } : {}),
      clock: () => 1000,
    });
    return { d, mem, data, sent };
  }

  test('pendência vira card; nada executa e o histórico não é salvo ainda', () => {
    const { d, mem, data } = setup([call('memory_remove', '{"text":"café"}')]);
    const r = handleChat(dm('apague o café'), d);
    expect(r.text).toContain('memory.remove');
    expect(tokenOf(r)).toHaveLength(32);
    expect(mem.text).toBe('- prefiro café\n');
    expect(d.saved).toEqual({});
    expect([...data.values()][0].state.messages.some((m) => m.role === 'system')).toBe(false);
  });

  test('aprovar: clique retoma o turno, executa, atualiza o card e salva o histórico', () => {
    const { d, mem, sent } = setup([call('memory_remove', '{"text":"café"}'), { text: 'Removi.' }]);
    const token = tokenOf(handleChat(dm('apague o café'), d));
    const r = handleChat(click(token, { decision: 'approve' }), d);
    expect(r).toEqual({ actionResponse: { type: 'UPDATE_MESSAGE' }, text: 'Removi.', cardsV2: [] });
    expect(mem.text).toBe('');
    expect(sent[1][0]).toEqual({ role: 'system', content: expect.stringContaining('Regras') });
    expect(d.saved['f1:spaces/D']).toEqual([{ role: 'user', content: 'apague o café' }, { role: 'assistant', content: 'Removi.' }]);
  });

  test('token reusado: segundo clique é recusado e nada roda de novo', () => {
    const { d, mem } = setup([call('memory_remove', '{"text":"café"}'), { text: 'Removi.' }]);
    const token = tokenOf(handleChat(dm('apague o café'), d));
    handleChat(click(token, { decision: 'approve' }), d);
    mem.text = '- prefiro café\n';
    const r = handleChat(click(token, { decision: 'approve' }), d);
    expect(r.text).toContain('já foi respondido');
    expect(mem.text).toBe('- prefiro café\n');
  });

  test('negar: não executa e o modelo continua sabendo da negativa', () => {
    const { d, mem, sent } = setup([call('memory_remove', '{"text":"café"}'), { text: 'Ok, mantive.' }]);
    const token = tokenOf(handleChat(dm('apague o café'), d));
    expect(handleChat(click(token, { decision: 'deny' }), d).text).toBe('Ok, mantive.');
    expect(mem.text).toBe('- prefiro café\n');
    expect(sent[1][sent[1].length - 1].content).toContain('negado');
  });

  test('clique de outra pessoa é recusado sem consumir o pedido', () => {
    const { d, mem } = setup([call('memory_remove', '{"text":"café"}'), { text: 'Removi.' }]);
    const token = tokenOf(handleChat(dm('apague o café'), d));
    expect(handleChat(click(token, { decision: 'approve' }, 'ana@x.com'), d).text).toContain('só quem fez');
    expect(handleChat(click(token, { decision: 'approve' }), d).text).toBe('Removi.');
    expect(mem.text).toBe('');
  });

  test('ask sem opções: a próxima mensagem do mesmo usuário é a resposta', () => {
    const { d, sent } = setup([call('ask', '{"question":"Qual sala?"}'), { text: 'Reservei a B.' }]);
    expect(handleChat(dm('reserve uma sala'), d).text).toContain('Qual sala?');
    expect(handleChat(dm('B'), d).text).toBe('Reservei a B.');
    expect(sent[1][sent[1].length - 1]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'resposta do usuário: B' });
  });

  test('sem store de tickets: pendência vira aviso, nunca execução', () => {
    const { d, mem } = setup([call('memory_remove', '{"text":"café"}')], false);
    expect(handleChat(dm('apague o café'), d).text).toContain('aprovação');
    expect(mem.text).toBe('- prefiro café\n');
  });
});

import { describe, expect, test } from 'vitest';
import { runTurn, type TurnInput } from '../src/agent';
import type { Completion, Message, ToolDef } from '../src/llm';
import { allowedTools, TOOLS, type Tool } from '../src/tools/registry';

const call = (id: string, name: string, args = '{}') => ({ id, type: 'function' as const, function: { name, arguments: args } });
const say = (text: string): Completion => ({ text });
const ask = (...calls: ReturnType<typeof call>[]): Completion => ({ text: '', toolCalls: calls, finish_reason: 'tool_calls' });

function input(script: Completion[], over: Partial<TurnInput> = {}) {
  const sent: { messages: Message[]; tools: ToolDef[] }[] = [];
  const mem = { text: '' };
  let t = 0;
  const i: TurnInput = {
    system: 'SYS',
    history: [],
    text: 'oi',
    tools: allowedTools(['now', 'memory']),
    ctx: { now: () => '2026-09-15T10:00', ownerDm: true, memory: { read: () => mem.text, write: (x) => void (mem.text = x) } },
    llm: (messages, tools) => {
      sent.push({ messages: structuredClone(messages), tools });
      const next = script.shift();
      if (!next) throw new Error('roteiro acabou');
      return next;
    },
    runId: 'r1',
    steps: 5,
    deadlineMs: 1_000,
    clock: () => t++,
    ...over,
  };
  return { i, sent, mem };
}

describe('runTurn', () => {
  test('sem tool_calls: 1 chamada, resposta e histórico (sem conversa de tools)', () => {
    const { i, sent } = input([say(' olá ')]);
    const r = runTurn(i);
    expect(r.text).toBe('olá');
    expect(r.events).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(sent[0].messages).toEqual([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'oi' }]);
    expect(sent[0].tools.map((d) => d.function.name)).toEqual(['now', 'memory_save', 'memory_remove', 'memory_read']);
    expect(r.history).toEqual([{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }]);
  });

  test('tool never: executa, devolve resultado ao modelo e continua até a resposta', () => {
    const { i, sent } = input([ask(call('c1', 'now')), say('São 10h.')]);
    const r = runTurn(i);
    expect(r.text).toBe('São 10h.');
    expect(r.events).toEqual([{ name: 'now', callId: 'c1', key: 'r1:0:c1', status: 'ok', result: '2026-09-15T10:00' }]);
    expect(sent[1].messages.slice(-2)).toEqual([
      { role: 'assistant', content: '', tool_calls: [call('c1', 'now')] },
      { role: 'tool', tool_call_id: 'c1', content: '2026-09-15T10:00' },
    ]);
  });

  test('memória entra como mensagem do usuário antes do histórico', () => {
    const { i, sent } = input([say('ok')], { memory: '- prefiro 10h\n', history: [{ role: 'assistant', content: 'antes' }] });
    runTurn(i);
    expect(sent[0].messages[1].role).toBe('user');
    expect(sent[0].messages[1].content).toContain('prefiro 10h');
    expect(sent[0].messages[2]).toEqual({ role: 'assistant', content: 'antes' });
  });

  test('args fora do schema: recusa como resultado de tool (não executa, não lança)', () => {
    const { i, mem } = input([ask(call('c1', 'memory_save', '{"texto":1}')), say('não consegui')]);
    const r = runTurn(i);
    expect(r.events[0]).toMatchObject({ name: 'memory.save', status: 'refused' });
    expect(r.events[0].result).toContain('text');
    expect(mem.text).toBe('');
    expect(r.text).toBe('não consegui');
  });

  test('tool fora da allowlist (ou inexistente) é recusada', () => {
    const { i } = input([ask(call('c1', 'gmail_send')), say('ok')], { tools: allowedTools(['now']) });
    expect(runTurn(i).events[0]).toMatchObject({ name: 'gmail_send', status: 'refused' });
  });

  test('erro dentro da tool vira status error e o turno segue', () => {
    const { i } = input([ask(call('c1', 'memory_read')), say('ok')], { ctx: { now: () => '', ownerDm: false, memory: { read: () => '', write: () => {} } } });
    const r = runTurn(i);
    expect(r.events[0]).toMatchObject({ status: 'error' });
    expect(r.events[0].result).toContain('DM do dono');
    expect(r.text).toBe('ok');
  });

  test('limite de steps: para com aviso', () => {
    const { i, sent } = input([ask(call('a', 'now')), ask(call('b', 'now')), ask(call('c', 'now'))], { steps: 2 });
    const r = runTurn(i);
    expect(sent).toHaveLength(2);
    expect(r.stopped).toBe('steps');
    expect(r.text).toContain('limite de 2 passos');
  });

  test('prazo estourado antes da chamada: para com aviso', () => {
    const { i, sent } = input([ask(call('a', 'now')), say('x')], { deadlineMs: 1 });
    const r = runTurn(i);
    expect(sent).toHaveLength(1);
    expect(r.stopped).toBe('deadline');
    expect(r.text).toContain('tempo');
  });

  test('idempotência: chave runId:step:callId já executada não roda de novo', () => {
    let runs = 0;
    const counting: Tool = { ...TOOLS[0], run: () => (runs++, 'novo') };
    const { i } = input([ask(call('c1', 'now')), say('ok')], { tools: [counting], done: { 'r1:0:c1': 'antigo' } });
    const r = runTurn(i);
    expect(runs).toBe(0);
    expect(r.events[0].result).toBe('antigo');
    expect(r.done['r1:0:c1']).toBe('antigo');
  });

  test('tool com approval ≠ never: devolve pendência sem executar', () => {
    let runs = 0;
    const risky: Tool = { ...TOOLS[0], name: 'gmail.send', approval: 'always', run: () => (runs++, 'enviado') };
    const { i } = input([ask(call('c1', 'gmail_send'))], { tools: [risky] });
    const r = runTurn(i);
    expect(runs).toBe(0);
    expect(r.pending).toMatchObject({ name: 'gmail.send', callId: 'c1', key: 'r1:0:c1', args: {} });
    expect(r.events[0].status).toBe('pending');
  });
});

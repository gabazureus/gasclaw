import { describe, expect, test } from 'vitest';
import { ENGINE_RULES, runTurn, type TurnInput } from '../src/agent';
import type { Completion, Message, ToolDef } from '../src/llm';
import { allowedTools, findTool, TOOLS, type Tool } from '../src/tools/registry';

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
    expect(sent[0].messages).toEqual([{ role: 'system', content: `SYS${ENGINE_RULES}` }, { role: 'user', content: 'oi' }]);
    expect(sent[0].tools.map((d) => d.function.name)).toEqual(['now', 'memory_save', 'memory_remove', 'memory_read']);
    expect(r.history).toEqual([{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }]);
  });

  test('tool never: executa, devolve resultado ao modelo e continua até a resposta', () => {
    const { i, sent } = input([ask(call('c1', 'now')), say('São 10h.')]);
    const r = runTurn(i);
    expect(r.text).toBe('São 10h.');
    expect(r.events).toEqual([{ name: 'now', callId: 'c1', key: 'r1:0:c1', argsKey: 'now:[]', status: 'ok', result: '2026-09-15T10:00' }]);
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
    expect(JSON.parse(r.events[0].result)).toEqual({ ok: false, error: 'memória só está disponível na DM do dono', did_nothing: true });
    expect(r.text).toBe('⚠️ Não consegui ler memory: memória só está disponível na DM do dono.'); // guarda de falha honesta
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

  test('efeito é anunciado antes de executar; leitura não é anunciada', () => {
    const order: string[] = [];
    const read: Tool = { ...TOOLS[0], name: 'calendar.list', run: () => (order.push('read'), 'livre') };
    const effect: Tool = { ...TOOLS[0], name: 'gmail.send', run: (_a, ctx) => (ctx.beforeEffect?.(), order.push('effect'), 'enviado') };
    const { i } = input([ask(call('c1', 'calendar_list'), call('c2', 'gmail_send')), say('ok')], {
      tools: [read, effect],
      beforeEffect: (name) => order.push(`persist:${name}`),
    });

    runTurn(i);

    expect(order).toEqual(['read', 'persist:gmail.send', 'effect']);
  });

  test('falha ao persistir inflight impede que o efeito comece', () => {
    let runs = 0;
    const effect: Tool = { ...TOOLS[0], name: 'gmail.send', run: (_a, ctx) => (ctx.beforeEffect?.(), runs++, 'enviado') };
    const { i } = input([ask(call('c1', 'gmail_send')), say('não enviado')], {
      tools: [effect],
      beforeEffect: () => { throw new Error('Drive indisponível'); },
    });

    expect(() => runTurn(i)).toThrow('Drive indisponível');
    expect(runs).toBe(0);
  });

  test('erro da tool de efeito sobe para a casca durável preservar a incerteza', () => {
    const effect: Tool = { ...TOOLS[0], name: 'gmail.send', run: (_a, ctx) => { ctx.beforeEffect?.(); throw new Error('resposta perdida'); } };
    const { i } = input([ask(call('c1', 'gmail_send'))], {
      tools: [effect],
      beforeEffect: () => undefined,
    });

    expect(() => runTurn(i)).toThrow('resposta perdida');
  });

  test('validação local da tool acontece antes da fronteira e não vira incerteza', () => {
    const effect: Tool = { ...TOOLS[0], name: 'gmail.send', run: () => { throw new Error('destinatário inválido'); } };
    const { i } = input([ask(call('c1', 'gmail_send')), say('corrija o destinatário')], {
      tools: [effect],
      beforeEffect: () => { throw new Error('não deveria marcar'); },
    });

    const r = runTurn(i);

    expect(r.events[0]).toMatchObject({ name: 'gmail.send', status: 'error' });
    expect(r.text).toContain('destinatário inválido');
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

describe('runTurn: aprovação e ask (E5)', () => {
  const risky = (approval: Tool['approval'], log: string[]): Tool => ({ ...findTool(TOOLS, 'memory.remove')!, approval, run: (a) => (log.push(String(a.text)), 'removido') });

  test('pendência devolve o estado para retomar; aprovar executa e continua o turno', () => {
    const log: string[] = [];
    const first = input([ask(call('c1', 'memory_remove', '{"text":"x"}'))], { tools: [risky('always', log)] });
    const p = runTurn(first.i);
    expect(p.pending).toMatchObject({ kind: 'approval', name: 'memory.remove', args: { text: 'x' } });
    expect(p.state?.step).toBe(0);
    const again = input([say('Removi.')], { tools: [risky('always', log)], resume: { ...p.state!, decision: { approved: true } } });
    const r = runTurn(again.i);
    expect(log).toEqual(['x']);
    expect(r.text).toBe('Removi.');
    expect(r.events).toEqual([{ name: 'memory.remove', callId: 'c1', key: 'r1:0:c1', argsKey: 'memory.remove:[["text","x"]]', status: 'approved', result: 'removido' }]);
    expect(again.sent[0].messages.slice(-1)).toEqual([{ role: 'tool', tool_call_id: 'c1', content: 'removido' }]);
    expect(r.history).toEqual([{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'Removi.' }]);
  });

  test('negar não executa e o modelo recebe "negado pelo usuário"', () => {
    const log: string[] = [];
    const p = runTurn(input([ask(call('c1', 'memory_remove', '{"text":"x"}'))], { tools: [risky('always', log)] }).i);
    const again = input([say('Ok, não removi.')], { tools: [risky('always', log)], resume: { ...p.state!, decision: { approved: false } } });
    const r = runTurn(again.i);
    expect(log).toEqual([]);
    expect(r.events[0]).toMatchObject({ status: 'denied' });
    expect(again.sent[0].messages.slice(-1)[0]?.content).toContain('negado pelo usuário');
  });

  test('once: a MESMA chamada nao pede de novo (granted vale por tool + argumentos)', () => {
    const log: string[] = [];
    const p = runTurn(input([ask(call('c1', 'memory_remove', '{"text":"a"}'))], { tools: [risky('once', log)] }).i);
    const r = runTurn(input([ask(call('c2', 'memory_remove', '{"text":"a"}')), say('fim')], { tools: [risky('once', log)], resume: { ...p.state!, decision: { approved: true } } }).i);
    expect(log).toEqual(['a', 'a']);
    expect(r.pending).toBeUndefined();
    const next = runTurn(input([ask(call('c3', 'memory_remove', '{"text":"a"}')), say('fim')], { tools: [risky('once', log)], granted: r.granted }).i);
    expect(next.pending).toBeUndefined(); // o grant atravessa execucoes para a mesma chamada
  });

  // Regressao de seguranca: o comentario dizia "tool + alvo", mas o alvo so era visto quando o argumento
  // se chamava literalmente `id`. memory.remove nao tem `id`, entao UMA aprovacao liberava qualquer texto.
  test('once: aprovar um alvo NAO libera outro alvo da mesma tool', () => {
    const log: string[] = [];
    const p = runTurn(input([ask(call('c1', 'memory_remove', '{"text":"a"}'))], { tools: [risky('once', log)] }).i);
    const r = runTurn(input([ask(call('c2', 'memory_remove', '{"text":"OUTRO"}')), say('fim')], { tools: [risky('once', log)], resume: { ...p.state!, decision: { approved: true } } }).i);
    expect(log).toEqual(['a']); // o segundo alvo NAO pode ter executado
    expect(r.pending).toMatchObject({ kind: 'approval', name: 'memory.remove', args: { text: 'OUTRO' } });
  });

  // O caso reportado: gmail.draft nao tem `id` (o schema e to/cc/subject/body), entao um clique
  // liberava todos os rascunhos seguintes do run, para qualquer destinatario. E `granted` e duravel.
  test('once: aprovar gmail.draft para A nao libera gmail.draft para B', () => {
    const sent: string[] = [];
    const draft: Tool = { ...findTool(TOOLS, 'gmail.draft')!, ownerOnly: false, run: (a) => (sent.push(String(a.to)), 'rascunho criado') };
    const a = '{"to":"ana@exemplo.com","subject":"s","body":"b"}';
    const b = '{"to":"atacante@exemplo.com","subject":"s","body":"b"}';
    const p = runTurn(input([ask(call('c1', 'gmail_draft', a))], { tools: [draft] }).i);
    expect(p.pending).toMatchObject({ name: 'gmail.draft' });
    const r = runTurn(input([ask(call('c2', 'gmail_draft', b)), say('fim')], { tools: [draft], resume: { ...p.state!, decision: { approved: true } } }).i);
    expect(sent).toEqual(['ana@exemplo.com']); // o rascunho para o atacante NAO pode ter saido
    expect(r.pending).toMatchObject({ kind: 'approval', name: 'gmail.draft', args: { to: 'atacante@exemplo.com' } });
  });

  test('always pede toda vez, mesmo com granted', () => {
    const p = runTurn(input([ask(call('c1', 'memory_remove', '{"text":"a"}'))], { tools: [risky('always', [])], granted: ['memory.remove'] }).i);
    expect(p.pending?.kind).toBe('approval');
  });

  test('segunda chamada do mesmo lote que também pede aprovação vira nova pendência', () => {
    const log: string[] = [];
    const tools = [risky('always', log)];
    const p = runTurn(input([ask(call('c1', 'memory_remove', '{"text":"a"}'), call('c2', 'memory_remove', '{"text":"b"}'))], { tools }).i);
    const r = runTurn(input([], { tools, resume: { ...p.state!, decision: { approved: true } } }).i);
    expect(log).toEqual(['a']);
    expect(r.pending).toMatchObject({ callId: 'c2' });
  });

  test('ask: pergunta ao usuário e a resposta vira o resultado da tool', () => {
    const tools = allowedTools(['ask']);
    const p = runTurn(input([ask(call('c1', 'ask', '{"question":"Qual sala?","options":"A, B"}'))], { tools }).i);
    expect(p.pending).toMatchObject({ kind: 'ask', name: 'ask', args: { question: 'Qual sala?', options: 'A, B' } });
    expect(p.text).toContain('Qual sala?');
    const again = input([say('Reservei a B.')], { tools, resume: { ...p.state!, decision: { answer: 'B' } } });
    const r = runTurn(again.i);
    expect(again.sent[0].messages.slice(-1)[0]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'resposta do usuário: B' });
    expect(r.text).toBe('Reservei a B.');
  });
});

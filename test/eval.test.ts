import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { evaluate, judgeMessages, parseJudge, parseScenario, scriptedLlm, type Outcome } from '../src/eval';

const SMOKE = `---
name: smoke
channel: chat
tools: []
judge: A resposta cumprimenta em português.
---
# smoke

## turnos
- oi

## verificações
- span: llm_call
- span: reply
- noTool
`;

describe('parseScenario', () => {
  test('frontmatter, turnos e verificações', () => {
    expect(parseScenario(SMOKE)).toEqual({
      name: 'smoke',
      set: 'gate',
      channel: 'chat',
      tools: [],
      steps: undefined,
      resetMemory: false,
      judge: 'A resposta cumprimenta em português.',
      turns: ['oi'],
      script: [],
      checks: [{ kind: 'span', arg: 'llm_call' }, { kind: 'span', arg: 'reply' }, { kind: 'noTool', arg: '' }],
    });
  });
  test('nova sessão, roteiro, steps, memory reset e tela', () => {
    const s = parseScenario(`---\nname: x\nchannel: tela\ntools: [now]\nsteps: 2\nmemory: reset\n---\n## turnos\n- a\n- (nova sessão)\n- b\n\n## roteiro\n- tool: memory.save {"texto": 1}\n- texto: pronto\n\n## verificações\n- refused: memory.save\n`);
    expect(s).toMatchObject({ channel: 'tela', tools: ['now'], steps: 2, resetMemory: true, turns: ['a', null, 'b'] });
    expect(s.script).toEqual([{ tool: 'memory.save', args: '{"texto": 1}' }, { text: 'pronto' }]);
  });
  test.each([
    ['sem name', '---\nchannel: chat\n---\n## turnos\n- a\n## verificações\n- noTool\n', 'name'],
    ['canal inválido', '---\nname: x\nchannel: sms\n---\n## turnos\n- a\n## verificações\n- noTool\n', 'channel'],
    ['sem turnos', '---\nname: x\n---\n## verificações\n- noTool\n', 'turnos'],
    ['sem verificações', '---\nname: x\n---\n## turnos\n- a\n', 'verificações'],
    ['steps inválido', '---\nname: x\nsteps: abc\n---\n## turnos\n- a\n## verificações\n- noTool\n', 'steps'],
    ['verificação desconhecida', '---\nname: x\n---\n## turnos\n- a\n## verificações\n- eval: 1\n', 'eval'],
  ])('%s → erro', (_n, md, word) => expect(() => parseScenario(md)).toThrow(word));
  test('todos os cenários do repositório parseiam', () => {
    const files = readdirSync('evals').filter((f) => f.endsWith('.md') && f !== 'README.md');
    expect(files).toContain('smoke.md');
    for (const f of files) expect(parseScenario(readFileSync(`evals/${f}`, 'utf8')).name).toBe(f.replace(/\.md$/, ''));
  });
});

describe('evaluate', () => {
  const out: Outcome = {
    turns: [
      { reply: 'Salvo!', spans: ['llm_call', 'tool_call', 'llm_call', 'reply'], tools: [{ name: 'memory.save', status: 'ok' }] },
      { reply: 'Você prefere reuniões às 10h.', spans: ['llm_call', 'reply'], tools: [{ name: 'gmail.send', status: 'refused' }] },
    ],
  };
  const run = (checks: string) => evaluate(parseScenario(`---\nname: t\n---\n## turnos\n- a\n## verificações\n${checks}`), out);

  test('passa quando todas as verificações passam', () => {
    const r = run('- span: tool_call\n- calledTool: memory.save\n- includes: 10H\n- refused: gmail.send\n');
    expect(r.pass).toBe(true);
    expect(r.checks.every((c) => c.pass)).toBe(true);
  });
  test('falha e diz qual verificação falhou', () => {
    const r = run('- calledTool: now\n- noTool\n- includes: 11h\n- stopped: steps\n- approved: gmail.send\n- denied: gmail.send\n');
    expect(r.pass).toBe(false);
    expect(r.checks.filter((c) => !c.pass).map((c) => c.check)).toEqual(['calledTool: now', 'noTool', 'includes: 11h', 'stopped: steps', 'approved: gmail.send', 'denied: gmail.send']);
  });
  test('includes olha a última resposta; calledTool só conta status ok', () => {
    expect(run('- includes: Salvo\n').pass).toBe(false);
    expect(run('- calledTool: gmail.send\n').pass).toBe(false);
  });
  test('juiz é soft: aparece no relatório mas não reprova', () => {
    const r = evaluate(parseScenario(SMOKE), { turns: [{ reply: 'olá', spans: ['llm_call', 'reply'], tools: [] }], judge: { pass: false, reason: 'não' } });
    expect(r.pass).toBe(true);
    expect(r.judge).toEqual({ pass: false, reason: 'não' });
  });
});

describe('juiz e roteiro', () => {
  test('judgeMessages leva critério e conversa; parseJudge lê PASS/FAIL', () => {
    const m = judgeMessages('cumprimenta', [{ user: 'oi', reply: 'olá' }]);
    expect(m[0].role).toBe('system');
    expect(m[1].content).toContain('cumprimenta');
    expect(m[1].content).toContain('olá');
    expect(parseJudge('PASS: cumprimentou')).toEqual({ pass: true, reason: 'cumprimentou' });
    expect(parseJudge('fail - não')).toEqual({ pass: false, reason: 'não' });
    expect(parseJudge('talvez')).toEqual({ pass: false, reason: 'juiz sem veredito: talvez' });
  });
  test('scriptedLlm devolve tool_calls e textos na ordem, depois repete o último', () => {
    const llm = scriptedLlm([{ tool: 'now', args: '{}' }, { text: 'fim' }]);
    const a = llm();
    expect(a.toolCalls?.[0].function).toEqual({ name: 'now', arguments: '{}' });
    expect(a.toolCalls?.[0].id).toBe('s1');
    expect(llm().text).toBe('fim');
    expect(llm().text).toBe('fim');
  });
});

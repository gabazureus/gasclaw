import { describe, expect, test } from 'vitest';
import { evalApproves, runEval, type EvalEnv } from '../src/evalEntry';
import type { GReq } from '../src/tools/google';
import { buildSpec, withAccess } from '../src/workspace';

function env() {
  const reqs: GReq[] = [];
  let t = 0;
  const e: EvalEnv = {
    owner: 'dono@x.com',
    apiKey: null,
    agent: () => withAccess(buildSpec('f', 'eval', { AGENTS: 'Regras' }), { users: [], tools: [] }),
    folderId: 'f',
    memory: { read: () => '- prefiro café\n', write: () => {} },
    now: () => '',
    llm: () => ({ text: 'nunca' }),
    clock: () => (t += 5),
    google: (r) => (reqs.push(r), { code: 200, body: '{"id":"sent123456","htmlLink":"l"}' }),
  };
  return { e, reqs };
}
const md = (tool: string, args: string, click: string, check: string) =>
  `---\nname: t\ntools: [gmail, calendar, memory]\n---\n## turnos\n- faça\n- ${click}\n## roteiro\n- tool: ${tool} ${args}\n- texto: ok\n## verificações\n- ${check}\n`;

describe('"(aprovar)" do eval (revisão E6, item 4)', () => {
  test('regra: desfazível ou fora do Google aprova; o resto só nomeado', () => {
    expect(evalApproves('calendar.create')).toBe(true);
    expect(evalApproves('gmail.draft')).toBe(true);
    expect(evalApproves('memory.remove')).toBe(true);
    expect(evalApproves('gmail.send')).toBe(false);
    expect(evalApproves('calendar.update')).toBe(false);
    expect(evalApproves('gmail.send', 'gmail.send')).toBe(true);
    expect(evalApproves('gmail.send', 'gmail.draft')).toBe(false);
  });

  test('(aprovar) num gmail.send pendente vira NEGAR: nada é enviado', () => {
    const { e, reqs } = env();
    const r = runEval(md('gmail.send', '{"to": "{{dono}}", "subject": "s", "body": "b"}', '(aprovar)', 'denied: gmail.send'), e);
    expect(r.checks).toEqual([{ check: 'denied: gmail.send', pass: true }]);
    expect(reqs.some((q) => q.url.includes('/messages/send'))).toBe(false);
  });

  test('(aprovar gmail.send) nomeado aprova (só para o dono, no roteiro)', () => {
    const { e, reqs } = env();
    const r = runEval(md('gmail.send', '{"to": "{{dono}}", "subject": "s", "body": "b"}', '(aprovar gmail.send)', 'approved: gmail.send'), e);
    expect(r.pass).toBe(true);
    expect(reqs.filter((q) => q.url.includes('/messages/send'))).toHaveLength(1);
  });

  test('(aprovar) num calendar.update (não desfazível) vira NEGAR', () => {
    const { e, reqs } = env();
    const r = runEval(md('calendar.update', '{"id": "evento123", "title": "x"}', '(aprovar)', 'denied: calendar.update'), e);
    expect(r.pass).toBe(true);
    expect(reqs).toHaveLength(0);
  });
});

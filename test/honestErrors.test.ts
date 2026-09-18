import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { ENGINE_RULES, failureNotice, runTurn, type ToolEvent } from '../src/agent';
import { runEval, type EvalEnv } from '../src/evalEntry';
import type { Completion, Message } from '../src/llm';
import { allowedTools, type ToolCtx } from '../src/tools/registry';
import { buildSpec, withAccess } from '../src/workspace';

const DISABLED = { code: 403, body: '{"error":{"code":403,"message":"Google Calendar API has not been used in project 1 before or it is disabled."}}' };
const call = (name: string, args: string): Completion => ({ text: '', toolCalls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }] });
const ev = (name: string, status: ToolEvent['status'], result = '{}', argsKey = name): ToolEvent => ({ name, callId: 'c', key: 'k', argsKey, status, result });

describe('falha de ferramenta é honesta (causa raiz: o erro chegava como texto solto)', () => {
  test('o modelo recebe {ok:false, error, did_nothing:true} e o system traz as regras fixas do motor', () => {
    const sent: Message[][] = [];
    const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => {} }, google: () => DISABLED };
    const script = [call('calendar_freebusy', '{"emails":"dono@x.com","from":"2030-01-15T08:00","to":"2030-01-15T18:00"}'), { text: 'Você está livre.' }];
    runTurn({ system: 'SYS', history: [], text: 'x', tools: allowedTools(['calendar']), ctx, llm: (m) => (sent.push(structuredClone(m)), script.shift()!), runId: 'r', steps: 3, deadlineMs: 1e12, clock: () => 0 });
    expect(sent[0][0].content).toBe(`SYS${ENGINE_RULES}`);
    expect(ENGINE_RULES).toContain('Nunca afirme que algo foi feito sem resultado de sucesso');
    const toolMsg = JSON.parse(sent[1][sent[1].length - 1].content);
    expect(toolMsg).toMatchObject({ ok: false, did_nothing: true });
    expect(toolMsg.error).toContain('403');
  });

  test('sem tools, o system do agente fica igual (regras só quando há ferramenta)', () => {
    const sent: Message[][] = [];
    const ctx: ToolCtx = { now: () => '', ownerDm: true, memory: { read: () => '', write: () => {} } };
    runTurn({ system: 'SYS', history: [], text: 'x', tools: [], ctx, llm: (m) => (sent.push(m), { text: 'oi' }), runId: 'r', steps: 1, deadlineMs: 1e12, clock: () => 0 });
    expect(sent[0][0].content).toBe('SYS');
  });

  test('guarda: efeito que falhou → "Nada foi feito."; leitura que falhou → "não consegui ler"; sucesso depois limpa', () => {
    const err = JSON.stringify({ ok: false, error: 'Google criar o evento 403: API desligada', did_nothing: true });
    expect(failureNotice([ev('calendar.create', 'error', err)])).toBe('⚠️ A ação calendar.create falhou: Google criar o evento 403: API desligada. Nada foi feito.');
    expect(failureNotice([ev('calendar.freebusy', 'error', err)])).toBe('⚠️ Não consegui ler calendar: Google criar o evento 403: API desligada.');
    expect(failureNotice([ev('calendar.create', 'error', err), ev('calendar.create', 'approved')])).toBeNull();
    expect(failureNotice([ev('now', 'ok'), ev('gmail.search', 'refused', 'recusado')])).toBeNull();
  });

  test('a resposta mentirosa do modelo não chega ao usuário nem ao histórico', () => {
    const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => {} }, google: () => DISABLED };
    const script = [call('calendar_freebusy', '{"emails":"dono@x.com","from":"2030-01-15T08:00","to":"2030-01-15T18:00"}'), { text: 'Você está livre o dia todo.' }];
    const r = runTurn({ system: 'S', history: [], text: 'x', tools: allowedTools(['calendar']), ctx, llm: () => script.shift()!, runId: 'r', steps: 3, deadlineMs: 1e12, clock: () => 0 });
    expect(r.text).not.toContain('livre');
    expect(r.history[r.history.length - 1].content).toBe(r.text);
  });
});

describe('evals offline de erro honesto (API simulada com 403)', () => {
  const env = (): EvalEnv => {
    let t = 0;
    return {
      owner: 'dono@x.com',
      apiKey: null,
      agent: () => withAccess(buildSpec('f', 'eval', { AGENTS: 'Regras' }), { users: [], tools: [] }),
      folderId: 'f',
      memory: { read: () => '', write: () => {} },
      now: () => '',
      llm: () => ({ text: 'nunca' }),
      clock: () => (t += 5),
      google: () => DISABLED,
    };
  };
  test.each(['e6-erro-honesto-agenda', 'e6-erro-honesto-freebusy'])('%s passa', (name) => {
    const r = runEval(readFileSync(`evals/${name}.md`, 'utf8'), env());
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(r.cleanup).toEqual({ removed: 0, missing: 0, failed: [] });
  });
  test('o runner offline genérico continua pulando cenários do Workspace', () => {
    expect(readFileSync('evals/e6-erro-honesto-agenda.md', 'utf8')).toMatch(/^offline: true$/m);
  });
});

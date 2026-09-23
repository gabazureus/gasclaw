import { readFileSync } from 'node:fs';
import { JUDGE_MODEL } from '../src/judgeSet';
import { expect, test } from 'vitest';
import { evalLlm, runEval, type EvalEnv } from '../src/evalEntry';
import type { Message, ToolDef } from '../src/llm';
import { buildSpec, withAccess } from '../src/workspace';

test('P16: o llm do trace injetado é o usado (evalLlm devolve o próprio)', () => {
  const traced: EvalEnv['llm'] = () => ({ text: 'x' });
  expect(evalLlm('k', traced)).toBe(traced);
});

test('P16: toda chamada ao modelo do eval, inclusive a do juiz, passa pelo llm injetado (vira llm_call no trace)', () => {
  const calls: { model: string; judge: boolean; tools: number }[] = [];
  let t = 0;
  const e: EvalEnv = {
    owner: 'dono@x.com',
    apiKey: 'sk-or-x',
    agent: () => withAccess(buildSpec('f', 'eval', { AGENTS: 'Regras' }), { users: [], tools: [] }),
    folderId: 'f',
    memory: { read: () => '', write: () => {} },
    now: () => '',
    llm: (model: string, m: Message[], defs: ToolDef[]) => (calls.push({ model, judge: m[0].content.includes('avalia'), tools: defs.length }), m[0].content.includes('avalia') ? { text: 'PASS: ok' } : { text: 'Olá!' }),
    clock: () => (t += 5),
  };
  const r = runEval(readFileSync('evals/smoke.md', 'utf8'), e, 'x/modelo');
  expect(r.judge).toEqual({ pass: true, reason: 'ok' });
  expect(calls).toEqual([
    { model: 'x/modelo', judge: false, tools: 0 },
    { model: JUDGE_MODEL, judge: true, tools: 0 }, // F10: quem julga é de outra família, não o modelo que rodou
  ]);
});

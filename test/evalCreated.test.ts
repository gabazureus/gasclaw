import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { runEval, type EvalEnv } from '../src/evalEntry';
import type { GReq } from '../src/tools/google';
import { buildSpec, withAccess } from '../src/workspace';

test('item 3: evento criado é apagado mesmo se o turno cair logo depois da tool (sem events do turno)', () => {
  const reqs: GReq[] = [];
  let created = false;
  let t = 0;
  const e: EvalEnv = {
    owner: 'dono@x.com',
    apiKey: null,
    agent: () => withAccess(buildSpec('f', 'eval', { AGENTS: 'Regras' }), { users: [], tools: [] }),
    folderId: 'f',
    memory: { read: () => '', write: () => {} },
    now: () => '',
    llm: () => ({ text: 'nunca' }),
    // depois que o evento existe, o relógio quebra: o handleChat engole o erro e o turno some sem onTurn
    clock: () => {
      if (created) throw new Error('queda depois da tool');
      return (t += 5);
    },
    google: (r) => {
      reqs.push(r);
      if (r.method === 'post') created = true;
      return r.method === 'delete' ? { code: 204, body: '' } : { code: 200, body: '{"id":"evqueda01","htmlLink":"l"}' };
    },
  };
  expect(() => runEval(readFileSync('evals/e6-agenda.md', 'utf8'), e)).toThrow('queda');
  expect(reqs.filter((r) => r.method === 'delete').map((r) => r.url)).toEqual(['https://www.googleapis.com/calendar/v3/calendars/primary/events/evqueda01?sendUpdates=none']);
});

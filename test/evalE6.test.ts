import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { runEval, type EvalEnv } from '../src/evalEntry';
import type { GReq, GRes } from '../src/tools/google';
import { buildSpec, withAccess } from '../src/workspace';

function env(responder: (r: GReq) => GRes) {
  const reqs: GReq[] = [];
  let t = 0;
  const e: EvalEnv = {
    owner: 'dono@x.com',
    apiKey: null,
    agent: () => withAccess(buildSpec('f', 'eval', { AGENTS: 'Regras' }), { users: [], tools: ['now'] }),
    folderId: 'f',
    memory: { read: () => '', write: () => {} },
    now: () => '2030-01-15T09:00:00-03:00',
    llm: () => ({ text: 'nunca' }),
    clock: () => (t += 5),
    google: (r) => (reqs.push(r), responder(r)),
    zone: { timeZone: 'America/Sao_Paulo', offset: '-03:00' },
  };
  return { e, reqs };
}

describe('evals do Workspace (E6) com Google falso', () => {
  test('e6-agenda: card → Aprovar → evento criado → listado → apagado pelo runner', () => {
    const { e, reqs } = env((r) =>
      r.method === 'post'
        ? { code: 200, body: '{"id":"evtest01","htmlLink":"l","hangoutLink":"m"}' }
        : r.method === 'delete'
          ? { code: 204, body: '' }
          : { code: 200, body: '{"items":[{"id":"evtest01","summary":"gasclaw eval (apagar)","start":{"dateTime":"2030-01-15T10:00:00-03:00"},"end":{"dateTime":"2030-01-15T10:30:00-03:00"}}]}' },
    );
    const r = runEval(readFileSync('evals/e6-agenda.md', 'utf8'), e);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(r.pass).toBe(true);
    expect(reqs.map((q) => q.method)).toEqual(['post', 'get', 'delete']);
    expect(reqs[2].url).toContain('/events/evtest01?sendUpdates=none');
    expect(r.cleanup).toEqual({ removed: 1, missing: 0, failed: [] });
    expect(r.errors).toEqual([]);
  });

  test('e6-freebusy: {{dono}} vira o e-mail do dono; nenhum dado criado', () => {
    const { e, reqs } = env(() => ({ code: 200, body: '{"calendars":{"dono@x.com":{"busy":[]}}}' }));
    const r = runEval(readFileSync('evals/e6-freebusy.md', 'utf8'), e);
    expect(r.pass).toBe(true);
    expect((reqs[0].body as { items: unknown }).items).toEqual([{ id: 'dono@x.com' }]);
    expect(r.cleanup).toEqual({ removed: 0, missing: 0, failed: [] });
  });

  test('erro de tool aparece em errors e reprova noError (ex.: falta escopo)', () => {
    const { e } = env(() => ({ code: 403, body: '{"error":{"message":"Request had insufficient authentication scopes."}}' }));
    const r = runEval(readFileSync('evals/e6-freebusy.md', 'utf8'), e);
    expect(r.pass).toBe(false);
    expect(r.errors[0]).toContain('falta permissão do Google');
  });

  test('limpeza roda mesmo se um turno lançar depois de criar', () => {
    let calls = 0;
    const { e, reqs } = env((r) => (r.method === 'delete' ? { code: 204, body: '' } : { code: 200, body: '{"id":"evtest02","htmlLink":"l"}' }));
    const boom = { ...e, clock: () => (++calls > 6 ? (() => { throw new Error('queda'); })() : calls) };
    expect(() => runEval(readFileSync('evals/e6-agenda.md', 'utf8'), boom)).toThrow();
    expect(reqs.some((q) => q.method === 'delete' && q.url.includes('evtest02'))).toBe(true);
  });
});

describe('e6-drive: {{id}} liga o recurso criado à próxima tool', () => {
  test('docs.create aprovado → docs.read com o id criado → Doc para a lixeira', () => {
    const DOC = '1DocDeTesteDoGasclaw0123456789';
    const reqs: GReq[] = [];
    let t = 0;
    const e: EvalEnv = {
      owner: 'dono@x.com',
      apiKey: null,
      agent: () => withAccess(buildSpec('f', 'eval', { AGENTS: 'Regras' }), { users: [], tools: [] }),
      folderId: 'f',
      memory: { read: () => '', write: () => {} },
      now: () => '',
      llm: () => ({ text: 'nunca' }),
      clock: () => (t += 5),
      google: (r) => (reqs.push(r), r.url.includes('/export') ? { code: 200, body: 'pauta de teste' } : { code: 200, body: `{"id":"${DOC}","webViewLink":"l"}` }),
    };
    const r = runEval(readFileSync('evals/e6-drive.md', 'utf8'), e);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(reqs[1].url).toBe(`https://www.googleapis.com/drive/v3/files/${DOC}/export?mimeType=text%2Fplain`);
    expect(reqs[2]).toEqual({ method: 'patch', url: `https://www.googleapis.com/drive/v3/files/${DOC}`, body: { trashed: true } });
  });
});

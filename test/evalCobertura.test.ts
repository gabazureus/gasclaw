// F10 parte 2: os cenários novos do Workspace, com Google falso. Sem isto, um eval de calendar/drive/
// gmail/sheets/tasks só rodaria no dev (`./gasclaw eval`) e ninguém veria a suíte quebrar.
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
const read = (name: string) => readFileSync(`evals/${name}.md`, 'utf8');

describe('cobertura de evals: um cenário por ferramenta do Workspace', () => {
  test('e6-agenda-editar: o evento criado é o MESMO que o update altera, e some no fim', () => {
    const { e, reqs } = env((r) =>
      r.method === 'delete' ? { code: 204, body: '' } : { code: 200, body: '{"id":"evtest01","htmlLink":"l"}' },
    );
    const r = runEval(read('e6-agenda-editar'), e);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(reqs.map((q) => q.method)).toEqual(['post', 'patch', 'delete']);
    expect(reqs[1].url).toContain('/events/evtest01?');
    expect(r.cleanup).toEqual({ removed: 1, missing: 0, failed: [] });
  });

  test('e6-drive-buscar: busca só lê, e nada fica para trás', () => {
    const { e, reqs } = env(() => ({ code: 200, body: '{"files":[{"id":"1abcdefghij","name":"gasclaw eval doc","mimeType":"application/vnd.google-apps.document","modifiedTime":"2030-01-15T09:00:00Z","webViewLink":"l"}]}' }));
    const r = runEval(read('e6-drive-buscar'), e);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(reqs.every((q) => q.method === 'get')).toBe(true);
  });

  // MEDIDO NO DEV (2026-09-23): o cenário apontava para um id fixo que não existe na conta do dono, e o
  // Google respondeu 404. O errado era o CENÁRIO — não há como criar um e-mail recebido dentro dele. Agora
  // ele prova o caminho honesto: a leitura falha, e a resposta NÃO resume um e-mail imaginário.
  test('e6-gmail-ler: id que não existe — o motor diz que não leu, e não inventa o e-mail', () => {
    const { e, reqs } = env((r) =>
      r.url.includes('/messages?')
        ? { code: 200, body: '{"messages":[]}' }
        : { code: 404, body: '{"error":{"code":404,"message":"Requested entity was not found."}}' },
    );
    const r = runEval(read('e6-gmail-ler'), e);
    expect(r.checks.filter((c) => !c.pass).map((c) => c.check)).toEqual([]);
    expect(reqs.every((q) => q.method === 'get')).toBe(true);
  });

  // Mesmo achado do e6-gmail-ler: não há tool que crie planilha, então a fixture não existe e o cenário
  // passa a provar o que a medição mostrou — 404 vira recusa honesta, nunca "a planilha tem duas linhas".
  test('e6-planilha-ler: planilha que não existe — recusa honesta, sem inventar o conteúdo', () => {
    const { e, reqs } = env(() => ({ code: 404, body: '{"error":{"code":404,"message":"Requested entity was not found."}}' }));
    const r = runEval(read('e6-planilha-ler'), e);
    expect(r.checks.filter((c) => !c.pass).map((c) => c.check)).toEqual([]);
    expect(reqs.map((q) => q.method)).toEqual(['get']);
  });

  test('e6-tarefa-concluir: a tarefa concluída é a de teste, e o runner a apaga', () => {
    const { e, reqs } = env((r) =>
      r.method === 'delete' ? { code: 204, body: '' } : { code: 200, body: '{"id":"tasktest01","status":"completed"}' },
    );
    const r = runEval(read('e6-tarefa-concluir'), e);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(reqs.map((q) => q.method)).toEqual(['post', 'patch', 'delete']);
    expect(reqs[1].url).toContain('/tasks/tasktest01');
    expect(r.cleanup).toEqual({ removed: 1, missing: 0, failed: [] });
  });

  test('e6-planilha-escrever: OFFLINE (403) — a linha nunca é escrita, e o aviso é honesto', () => {
    const { e, reqs } = env(() => ({ code: 403, body: '{"error":{"code":403,"message":"Google Sheets API has not been used in project 1 before or it is disabled."}}' }));
    const r = runEval(read('e6-planilha-escrever'), e);
    expect(r.checks.filter((c) => !c.pass)).toEqual([]);
    expect(reqs.every((q) => q.method === 'post')).toBe(true);
    expect(r.cleanup).toEqual({ removed: 0, missing: 0, failed: [] });
  });
});

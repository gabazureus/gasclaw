import { describe, expect, test } from 'vitest';
import { runTurn, type TurnInput } from '../src/agent';
import type { Completion, ToolCall } from '../src/llm';
import type { Tool, ToolCtx } from '../src/tools/registry';

const log: string[] = [];
const comEfeito: Tool = { name: 'risco.send', description: 'manda algo', parameters: { type: 'object', properties: {}, additionalProperties: false }, approval: 'always', run: () => (log.push('send'), 'enviado') };
const semEfeito: Tool = { name: 'leitura.list', description: 'lê algo', parameters: { type: 'object', properties: {}, additionalProperties: false }, approval: 'never', run: () => (log.push('list'), 'lido') };
const call = (id: string, name: string): ToolCall => ({ id, type: 'function', function: { name, arguments: '{}' } });
const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => {} } };
const base = (queue: ToolCall[], llm: TurnInput['llm'], decision?: TurnInput['resume'] extends infer R ? (R extends { decision?: infer D } ? D : never) : never): TurnInput => ({
  system: 's',
  history: [],
  text: 'x',
  tools: [comEfeito, semEfeito],
  ctx,
  llm,
  runId: 'r',
  steps: 4,
  deadlineMs: 1e12,
  clock: () => 0,
  resume: { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'x' }], step: 0, queue, ...(decision ? { decision } : {}) },
});

describe('retomada SEM decisão (run que parou por tempo ou por limite)', () => {
  test('tool com aprovação volta a pedir o card: não executa e não sai como aprovada', () => {
    log.length = 0;
    const r = runTurn(base([call('c1', 'risco_send')], () => ({ text: 'nunca' })));
    expect(log).toEqual([]); // nada foi enviado
    expect(r.pending).toMatchObject({ kind: 'approval', name: 'risco.send' });
    expect(r.events[0].status).toBe('pending');
    expect(r.events.some((e) => e.status === 'approved')).toBe(false);
    expect(r.granted).toEqual([]); // nada foi liberado para o resto do turno
  });

  test('tool sem aprovação continua normalmente, marcada como ok (não como aprovada)', () => {
    log.length = 0;
    const script: Completion[] = [{ text: 'Pronto.' }];
    const r = runTurn(base([call('c1', 'leitura_list')], () => script.shift() ?? { text: 'fim' }));
    expect(log).toEqual(['list']);
    expect(r.events[0]).toMatchObject({ name: 'leitura.list', status: 'ok' });
    expect(r.text).toBe('Pronto.');
  });

  test('com decisão de aprovar, o comportamento de antes continua igual', () => {
    log.length = 0;
    const script: Completion[] = [{ text: 'Enviei.' }];
    const r = runTurn(base([call('c1', 'risco_send')], () => script.shift() ?? { text: 'fim' }, { approved: true }));
    expect(log).toEqual(['send']);
    expect(r.events[0].status).toBe('approved');
  });
});

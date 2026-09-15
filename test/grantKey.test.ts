import { describe, expect, test } from 'vitest';
import { runTurn, type TurnInput } from '../src/agent';
import type { Completion } from '../src/llm';
import type { Tool, ToolCtx } from '../src/tools/registry';

const writer: Tool = {
  name: 'planilha.write',
  description: 'escreve numa planilha de teste',
  parameters: { type: 'object', properties: { id: { type: 'string' }, rows: { type: 'string' } }, required: ['rows'], additionalProperties: false },
  approval: 'once',
  run: (a) => `escrito em ${String(a.id ?? 'nova')}`,
};
const call = (id: string, args: object): Completion => ({ text: '', toolCalls: [{ id, type: 'function', function: { name: 'planilha_write', arguments: JSON.stringify(args) } }] });
const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => {} } };
const base = (script: Completion[], over: Partial<TurnInput> = {}): TurnInput => ({ system: 's', history: [], text: 'x', tools: [writer], ctx, llm: () => script.shift() ?? { text: 'fim' }, runId: 'r', steps: 6, deadlineMs: 1e12, clock: () => 0, ...over });

describe('grant once por tool + alvo (revisão E6, item 6)', () => {
  test('aprovar a escrita no alvo A não libera o alvo B no mesmo turno', () => {
    const first = runTurn(base([call('c1', { id: 'planilhaA000', rows: '1' })]));
    expect(first.pending?.args).toEqual({ id: 'planilhaA000', rows: '1' });
    const resumed = runTurn(base([call('c2', { id: 'planilhaA000', rows: '2' }), call('c3', { id: 'planilhaB000', rows: '3' })], { resume: { ...first.state!, decision: { approved: true } } }));
    expect(resumed.granted).toEqual(['planilha.write:planilhaA000']);
    expect(resumed.events.map((e) => [e.callId, e.status])).toEqual([
      ['c1', 'approved'],
      ['c2', 'ok'],
      ['c3', 'pending'],
    ]);
    expect(resumed.pending?.args).toEqual({ id: 'planilhaB000', rows: '3' });
  });

  test('sem id (ex.: docs.create, tasks.create) o grant é pelo nome da tool', () => {
    const first = runTurn(base([call('c1', { rows: 'a' })]));
    const resumed = runTurn(base([call('c2', { rows: 'b' })], { resume: { ...first.state!, decision: { approved: true } } }));
    expect(resumed.granted).toEqual(['planilha.write']);
    expect(resumed.events.map((e) => e.status)).toEqual(['approved', 'ok']);
  });
});

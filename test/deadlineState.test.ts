import { describe, expect, test } from 'vitest';
import { runTurn, type TurnInput } from '../src/agent';
import type { ToolCall } from '../src/llm';
import type { Tool, ToolCtx } from '../src/tools/registry';

const lento: Tool = { name: 'lento.write', description: 'escreve devagar', parameters: { type: 'object', properties: {}, additionalProperties: false }, approval: 'never', run: () => 'feito' };
const call = (id: string): ToolCall[] => [{ id, type: 'function', function: { name: 'lento_write', arguments: '{}' } }];
const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => {} } };
const base = (llm: TurnInput['llm'], over: Partial<TurnInput> = {}): TurnInput => ({ system: 's', history: [], text: 'x', tools: [lento], ctx, llm, runId: 'r', steps: 5, deadlineMs: 1000, clock: () => 0, ...over });

describe('turno que para por tempo ou por limite devolve ONDE parou', () => {
  test('prazo estourado no meio do lote: state traz o que falta da fila', () => {
    // 1ª leitura (antes do modelo) e 2ª (antes de c1) dentro do prazo; a 3ª (antes de c2) estoura.
    const marcas = [0, 0, 2000, 2000];
    let n = 0;
    const r = runTurn(base(() => ({ text: '', toolCalls: [...call('c1'), ...call('c2')] }), { clock: () => marcas[Math.min(n++, marcas.length - 1)] }));
    expect(r.stopped).toBe('deadline');
    expect(r.state?.step).toBe(0);
    expect(r.state?.queue.map((q) => q.id)).toEqual(['c2']); // c1 já saiu da fila
    expect(r.state?.messages.some((m) => m.role === 'tool')).toBe(true); // resultado de c1 preservado
  });

  test('prazo estourado antes da chamada ao modelo: state com a fila vazia', () => {
    const r = runTurn(base(() => ({ text: 'x' }), { clock: () => 5000 }));
    expect(r.stopped).toBe('deadline');
    expect(r.state).toEqual({ messages: expect.any(Array), step: 0, queue: [] });
  });

  test('limite de passos também devolve state (o run pode continuar depois)', () => {
    const r = runTurn(base(() => ({ text: '', toolCalls: call('c1') }), { steps: 2, deadlineMs: 1e12 }));
    expect(r.stopped).toBe('steps');
    expect(r.state?.step).toBe(2);
    expect(r.state?.queue).toEqual([]);
    expect(r.state?.messages.length).toBeGreaterThan(1);
  });

  test('turno normal não devolve state (não há o que continuar)', () => {
    const r = runTurn(base(() => ({ text: 'pronto' }), { deadlineMs: 1e12 }));
    expect(r.stopped).toBeUndefined();
    expect(r.state).toBeUndefined();
  });
});

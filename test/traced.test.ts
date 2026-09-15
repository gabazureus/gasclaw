import { describe, expect, test } from 'vitest';
import type { ChatDeps } from '../src/chat';
import { traceDeps, type StepTracer } from '../src/traced';
import { buildSpec } from '../src/workspace';

/** Tracer falso: guarda os passos como o runlog guardaria (nome + dados do info). */
function fakeTracer() {
  const spans: { name: string; data?: Record<string, unknown> }[] = [];
  const t: StepTracer = {
    step: (name, fn, info) => {
      const v = fn();
      spans.push({ name, data: info?.(v as never) });
      return v;
    },
  };
  return { t, spans };
}

const spec = { ...buildSpec('f1', 'a', { AGENTS: 'Regras' }), origem: { AGENTS: 'md', SOUL: 'missing', IDENTITY: 'missing', USER: 'missing' } } as never;

describe('traceDeps (A3/M16: Chat, tela de conversa e clique de aprovação com o mesmo trace)', () => {
  test('llm_call registra modelo, tokens e custo; tool_call registra a ferramenta', () => {
    const { t, spans } = fakeTracer();
    const d = {
      llm: () => ({ text: 'ok', model: 'x/y', usage: { prompt_tokens: 7, completion_tokens: 3, cost: 0.004 } }),
      toolkit: () => ({ tools: [{ name: 'memory.save', run: () => 'salvo' }], ctx: {}, steps: 3 }),
    } as unknown as ChatDeps;
    const traced = traceDeps(t, d, () => spec);
    traced.llm('k', 'x/y', [{ role: 'user', content: 'oi' }]);
    const kit = traced.toolkit!(spec, true);
    expect(kit.tools[0].run({} as never, {} as never)).toBe('salvo');
    expect(spans.map((s) => s.name)).toEqual(['llm_call', 'tool_call']);
    expect(spans[0].data).toMatchObject({ model: 'x/y', prompt_tokens: 7, completion_tokens: 3, cost: 0.004 });
    expect(spans[1].data).toEqual({ tool: 'memory.save' });
  });
  test('resolve_agent usa o carregador com o override de modelo e registra a origem', () => {
    const { t, spans } = fakeTracer();
    const traced = traceDeps(t, {} as ChatDeps, () => spec);
    traced.load('f1');
    expect(spans[0]).toMatchObject({ name: 'resolve_agent', data: { agent: 'a', folderId: 'f1' } });
  });
});

import { describe, expect, test } from 'vitest';
import { MAX_HISTORY } from '../src/agent';
import { handleChat, type ChatDeps, type ChatEvent } from '../src/chat';
import type { Completion, Message } from '../src/llm';
import { flushMemory } from '../src/tools/memoryFlush';
import { FLUSH_PROMPT } from '../src/tools/memory';
import { allowedTools, type MemoryCtx, type ToolCtx } from '../src/tools/registry';
import { buildSpec, withAccess } from '../src/workspace';

function memory(day = '') {
  const files: Record<string, string> = { '2030-01-15': day };
  const m: MemoryCtx = { read: () => '', write: () => {}, day: (d) => files[d] ?? '', saveDay: (d, t) => void (files[d] = t), today: () => '2030-01-15', recall: () => '' };
  return { m, files };
}
const ctxOf = (m: MemoryCtx): ToolCtx => ({ now: () => '', ownerDm: true, isOwner: true, memory: m });
const convo = (n: number): Message[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `linha ${i}` }) as Message);

describe('flush de memória antes de compactar (spec §6)', () => {
  test('manda a conversa com o prompt de flush e anota os fatos na nota de hoje', () => {
    const { m, files } = memory('- fato antigo\n');
    let asked: Message[] = [];
    const saved = flushMemory(convo(4), ctxOf(m), (ms) => ((asked = ms), { text: '- prefere chá\n- corre às 7h' }));
    expect(asked[0]).toEqual({ role: 'system', content: FLUSH_PROMPT });
    expect(asked[1].content).toContain('usuário: linha 0');
    expect(saved).toBe(2);
    expect(files['2030-01-15']).toBe('- fato antigo\n- prefere chá\n- corre às 7h\n');
  });

  test('"(nada)" não escreve; falha do modelo não derruba o turno', () => {
    const { m, files } = memory('- x\n');
    expect(flushMemory(convo(2), ctxOf(m), () => ({ text: '(nada)' }))).toBe(0);
    expect(
      flushMemory(convo(2), ctxOf(m), () => {
        throw new Error('OpenRouter 500');
      }),
    ).toBe(0);
    expect(files['2030-01-15']).toBe('- x\n');
  });

  test('contexto sem notas do dia não tenta flush', () => {
    const ctx: ToolCtx = { now: () => '', ownerDm: true, memory: { read: () => '', write: () => {} } };
    let called = false;
    expect(flushMemory(convo(2), ctx, () => ((called = true), { text: 'a' }))).toBe(0);
    expect(called).toBe(false);
  });
});

describe('handleChat chama o flush só quando o histórico vai ser cortado', () => {
  function setup(history: Message[]) {
    const { m, files } = memory();
    const prompts: string[] = [];
    const d: ChatDeps = {
      enabled: () => true,
      owner: () => 'dono@x.com',
      apiKey: () => 'sk-or-x',
      defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
      load: () => withAccess(buildSpec('f1', 'A', { AGENTS: 'Regras' }), { users: [], tools: ['memory'] }),
      history: () => history,
      saveHistory: () => {},
      llm: (_k, _mo, ms): Completion => (prompts.push(ms[0].content), ms[0].content === FLUSH_PROMPT ? { text: '- prefere chá' } : { text: 'ok' }),
      toolkit: (_s, ownerDm) => ({ tools: allowedTools(['memory']), ctx: { now: () => '', ownerDm, isOwner: true, memory: m }, steps: 3 }),
      clock: () => 1,
    };
    return { d, files, prompts };
  }
  const dm = (text: string): ChatEvent => ({ type: 'MESSAGE', message: { text }, user: { email: 'dono@x.com' }, space: { name: 'spaces/D', singleUserBotDm: true } });

  test('conversa curta: sem flush', () => {
    const { d, prompts, files } = setup(convo(2));
    handleChat(dm('oi'), d);
    expect(prompts).toHaveLength(1);
    expect(files['2030-01-15']).toBe('');
  });

  test('histórico no limite: o flush roda e a nota do dia ganha o fato', () => {
    const { d, prompts, files } = setup(convo(MAX_HISTORY));
    handleChat(dm('oi'), d);
    expect(prompts[prompts.length - 1]).toBe(FLUSH_PROMPT);
    expect(files['2030-01-15']).toBe('- prefere chá\n');
  });

  test('num espaço (não DM do dono) nunca há flush', () => {
    const { d, prompts, files } = setup(convo(MAX_HISTORY));
    handleChat({ type: 'MESSAGE', message: { text: 'oi' }, user: { email: 'dono@x.com' }, space: { name: 'spaces/S1' } }, d);
    expect(prompts.every((p) => p !== FLUSH_PROMPT)).toBe(true);
    expect(files['2030-01-15']).toBe('');
  });
});

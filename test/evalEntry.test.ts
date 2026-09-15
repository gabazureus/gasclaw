import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { runEval, type EvalEnv } from '../src/evalEntry';
import type { Completion, Message, ToolDef } from '../src/llm';
import { buildSpec } from '../src/workspace';

function env(llm: EvalEnv['llm'], over: Partial<EvalEnv> = {}) {
  const mem = { text: '- velho\n' };
  let t = 0;
  const e: EvalEnv = {
    owner: 'dono@x.com',
    apiKey: 'sk-or-x',
    agent: () => buildSpec('f', 'eval', { AGENTS: '---\ntools: [now]\n---\nRegras' }),
    folderId: 'f',
    memory: { read: () => mem.text, write: (x) => void (mem.text = x) },
    now: () => '2026-09-15T10:00',
    llm,
    clock: () => (t += 5),
    ...over,
  };
  return { e, mem };
}

describe('runEval', () => {
  test('smoke: chat sintético da DM do dono passa por llm_call e reply; juiz soft usa o modelo', () => {
    const calls: string[] = [];
    const { e } = env((model, m) => (calls.push(model), m[0].content.includes('avalia') ? { text: 'PASS: cumprimentou' } : { text: 'Olá!' }));
    const r = runEval(readFileSync('evals/smoke.md', 'utf8'), e, 'x/modelo');
    expect(r.pass).toBe(true);
    expect(r.replies).toEqual(['Olá!']);
    expect(r.judge).toEqual({ pass: true, reason: 'cumprimentou' });
    expect(calls).toEqual(['x/modelo', 'x/modelo']);
    expect(r.ms).toBeGreaterThan(0);
  });

  test('e1-memoria com modelo falso: salva, zera sessão, a memória volta como mensagem do usuário', () => {
    const sent: Message[][] = [];
    const llm = (_m: string, ms: Message[], defs: ToolDef[]): Completion => {
      sent.push(ms);
      expect(defs.map((d) => d.function.name)).toContain('memory_save');
      if (ms[ms.length - 1].role === 'tool') return { text: 'Salvo.' };
      if (ms.some((m) => m.content.includes('reuniões às 10h') && m.role === 'user' && m.content.startsWith('Memória'))) return { text: 'Às 10h.' };
      return { text: '', toolCalls: [{ id: 'c1', type: 'function', function: { name: 'memory_save', arguments: '{"text":"prefere reuniões às 10h"}' } }] };
    };
    const { e, mem } = env(llm);
    const r = runEval(readFileSync('evals/e1-memoria.md', 'utf8'), e);
    expect(mem.text).toBe('- prefere reuniões às 10h\n');
    expect(r.checks).toEqual([{ check: 'calledTool: memory.save', pass: true }, { check: 'includes: 10', pass: true }]);
    expect(r.pass).toBe(true);
    const lastTurn = sent[sent.length - 1];
    expect(lastTurn.filter((m) => m.role === 'assistant')).toEqual([]); // nova sessão: sem histórico
  });

  test('tela usa o orçamento de 300 s e também registra tools', () => {
    const { e } = env(() => ({ text: 'x' }));
    const md = '---\nname: t\nchannel: tela\ntools: [now]\n---\n## turnos\n- a\n## roteiro\n- tool: now {}\n- texto: são 10h\n## verificações\n- calledTool: now\n- includes: 10h\n';
    expect(runEval(md, e).pass).toBe(true);
  });

  test('sem steps no cenário, vale o steps do agente (igual à produção)', () => {
    const loop = (): Completion => ({ text: '', toolCalls: [{ id: 'c', type: 'function', function: { name: 'now', arguments: '{}' } }] });
    const { e } = env(loop, { agent: () => buildSpec('f', 'eval', { AGENTS: '---\ntools: [now]\nsteps: 1\n---\nRegras' }) });
    const r = runEval('---\nname: t\n---\n## turnos\n- a\n## verificações\n- includes: limite\n', e);
    expect(r.replies[0]).toContain('limite de 1 passos');
  });

  test('sem chave e sem roteiro: erro claro', () => {
    const { e } = env(() => ({ text: 'x' }), { apiKey: null });
    expect(() => runEval(readFileSync('evals/smoke.md', 'utf8'), e)).toThrow('chave');
  });

  test('todos os cenários com roteiro passam offline (determinísticos)', () => {
    for (const f of readdirSync('evals').filter((x) => x.endsWith('.md'))) {
      const md = readFileSync(`evals/${f}`, 'utf8');
      if (!md.includes('## roteiro')) continue;
      const { e } = env(() => ({ text: 'nunca' }), { apiKey: null });
      const r = runEval(md, e);
      expect(r, f).toMatchObject({ pass: true });
    }
  });
});

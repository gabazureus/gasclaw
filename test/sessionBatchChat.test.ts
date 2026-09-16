import { describe, expect, test } from 'vitest';
import { handleChat, type ChatDeps, type ChatEvent } from '../src/chat';
import type { Completion, Message } from '../src/llm';
import { allowedTools, type Tool, type ToolCtx } from '../src/tools/registry';
import { buildSpec, withAccess } from '../src/workspace';

const risky: Tool = { name: 'risco.send', description: 'pede aprovação', parameters: { type: 'object', properties: {}, additionalProperties: false }, approval: 'always', run: () => 'enviado' };
const chamada = (id: string, name: string) => ({ id, type: 'function' as const, function: { name, arguments: '{}' } });
const ctx: ToolCtx = { now: () => '', ownerDm: true, isOwner: true, memory: { read: () => '', write: () => {} } };

function setup(script: Completion[], comFilaPropria: boolean) {
  const lote: string[] = [];
  const agora: string[] = [];
  const data = new Map<string, unknown>();
  const d: ChatDeps = {
    enabled: () => true,
    owner: () => 'dono@x.com',
    apiKey: () => 'sk-or-x',
    defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
    load: () => withAccess(buildSpec('f1', 'A', { AGENTS: 'Regras' }), { users: [], tools: [] }),
    history: () => [],
    saveHistory: (k) => void lote.push(k), // no main.ts isto vira "enfileirar para o lote"
    llm: () => script.shift() ?? { text: 'fim' },
    toolkit: () => ({ tools: [risky, ...allowedTools(['now'])], ctx, steps: 3 }),
    tickets: { put: (t) => void data.set(t.token, t), take: () => null },
    newToken: () => 'a'.repeat(32),
    clock: () => 1,
    ...(comFilaPropria ? { saveHistoryNow: (k: string) => void agora.push(k) } : {}),
  };
  return { d, lote, agora };
}
const dm = (text: string): ChatEvent => ({ type: 'MESSAGE', message: { text }, user: { email: 'dono@x.com' }, space: { name: 'spaces/D', singleUserBotDm: true } });

describe('gravação em lote, com exceção para a pendência de aprovação', () => {
  test('turno comum: vai pelo caminho do lote, e só uma vez', () => {
    const { d, lote, agora } = setup([{ text: 'ok' }], true);
    expect(handleChat(dm('oi'), d).text).toBe('ok');
    expect(lote).toEqual(['f1:spaces/D']);
    expect(agora).toEqual([]);
  });

  test('turno que termina em pendência NÃO grava a conversa (o card ainda não é fala do assistente)', () => {
    const { d, lote, agora } = setup([{ text: '', toolCalls: [chamada('c1', 'risco_send')] }], true);
    const r = handleChat(dm('envie'), d);
    expect(r.cardsV2).toBeDefined();
    expect(lote).toEqual([]);
    expect(agora).toEqual([]);
  });

  // EM ABERTO (perguntado ao orquestrador): se a pendência precisa mesmo gravar algo na hora, o que vai ao Drive
  // é o ESTADO (Snapshot/pending/done/granted), que já viaja no Ticket — e não `out.history`, cuja última fala é o
  // texto do card. Quando a decisão vier, o caso volta para cá.
});

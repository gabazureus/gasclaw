import { describe, expect, test } from 'vitest';
import { handleChat, type ChatDeps, type ChatEvent } from '../src/chat';
import type { Completion, Message } from '../src/llm';
import { allowedTools, type MemoryCtx } from '../src/tools/registry';
import { buildSpec, withAccess } from '../src/workspace';

// mem-privado como teste (o runner de evals só fala por DM do dono; "num espaço" não dá para escrever em cenário).
const CURADA = '- prefiro reuniões às 10h\n';
const call = (name: string): Completion => ({ text: '', toolCalls: [{ id: 'c1', type: 'function', function: { name, arguments: '{}' } }] });

function setup(script: Completion[]) {
  const sent: Message[][] = [];
  const memory: MemoryCtx = { read: () => CURADA, write: () => {}, day: () => '- café por chá\n', saveDay: () => {}, today: () => '2030-01-15', recall: () => `## MEMORY.md (curada)\n${CURADA}` };
  const d: ChatDeps = {
    enabled: () => true,
    owner: () => 'dono@x.com',
    apiKey: () => 'sk-or-x',
    defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
    load: () => withAccess(buildSpec('f1', 'A', { AGENTS: 'Regras' }), { users: ['ana@x.com'], tools: ['memory'] }),
    history: () => [],
    saveHistory: () => {},
    llm: (_k, _m, ms) => (sent.push(structuredClone(ms)), script.shift() ?? { text: 'fim' }),
    toolkit: (_s, ownerDm) => ({ tools: allowedTools(['memory']), ctx: { now: () => '', ownerDm, isOwner: true, memory }, steps: 4 }),
    clock: () => 1,
  };
  return { d, sent };
}
const dm = (text: string): ChatEvent => ({ type: 'MESSAGE', message: { text }, user: { email: 'dono@x.com' }, space: { name: 'spaces/D', singleUserBotDm: true } });
const espaco = (text: string): ChatEvent => ({ type: 'MESSAGE', message: { text }, user: { email: 'dono@x.com' }, space: { name: 'spaces/S1' } });

describe('memória é privada: só na DM do dono (spec §8)', () => {
  test('na DM do dono, o recall (curada + dia) entra como mensagem do usuário', () => {
    const { d, sent } = setup([{ text: 'ok' }]);
    handleChat(dm('o que você sabe sobre mim?'), d);
    expect(sent[0].some((m) => m.role === 'user' && m.content.includes('prefiro reuniões às 10h'))).toBe(true);
  });

  test('num espaço, a memória não entra no contexto e memory.read é recusada pela ferramenta', () => {
    const { d, sent } = setup([call('memory_read'), { text: 'Não tenho acesso à sua memória aqui.' }]);
    const r = handleChat(espaco('o que você sabe sobre mim?'), d);
    expect(sent[0].some((m) => m.content.includes('prefiro'))).toBe(false);
    const toolMsg = sent[1][sent[1].length - 1];
    expect(JSON.parse(toolMsg.content)).toMatchObject({ ok: false, did_nothing: true });
    expect(toolMsg.content).toContain('DM do dono');
    expect(r.text).not.toContain('prefiro');
  });
});

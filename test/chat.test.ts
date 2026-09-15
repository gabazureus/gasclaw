import { describe, expect, test } from 'vitest';
import { handleChat, type ChatDeps, type ChatEvent } from '../src/chat';
import type { Message } from '../src/llm';
import { allowedTools } from '../src/tools/registry';
import { buildSpec } from '../src/workspace';

function deps(over: Partial<ChatDeps> = {}): ChatDeps & { saved: Record<string, Message[]> } {
  const saved: Record<string, Message[]> = {};
  return {
    saved,
    enabled: () => true,
    owner: () => 'dono@x.com',
    apiKey: () => 'sk',
    defaultAgent: () => ({ folderId: 'f1', name: 'A' }),
    load: () => buildSpec('f1', 'A', { AGENTS: '---\nusers: [ana@x.com]\n---\nRegras' }),
    history: () => [],
    saveHistory: (k, h) => {
      saved[k] = h;
    },
    llm: () => ({ text: 'olá' }),
    ...over,
  };
}
const msg = (email: string, text = 'oi'): ChatEvent => ({ type: 'MESSAGE', message: { text, argumentText: ` ${text}` }, user: { email }, space: { name: 'spaces/S1' } });

describe('handleChat', () => {
  test('boas-vindas ao ser adicionado', () => {
    expect(handleChat({ type: 'ADDED_TO_SPACE', user: { email: 'a@x.com' }, space: { name: 'spaces/S1' } }, deps()).text).toContain('gasclaw');
  });
  test('usuário autorizado recebe resposta e histórico é salvo por agente+espaço', () => {
    const d = deps();
    expect(handleChat(msg('ana@x.com'), d)).toEqual({ text: 'olá' });
    expect(d.saved['f1:spaces/S1']).toHaveLength(2);
  });
  test('usa argumentText (sem a menção) quando existe', () => {
    let last = '';
    const d = deps({ llm: (_k, _m, ms) => ((last = ms[ms.length - 1].content), { text: 'ok' }) });
    handleChat(msg('ana@x.com', 'resuma'), d);
    expect(last).toBe('resuma');
  });
  test('usuário não autorizado é recusado sem chamar o LLM', () => {
    let called = false;
    const r = handleChat(msg('bob@x.com'), deps({ llm: () => ((called = true), { text: 'x' }) }));
    expect(r.text).toContain('não tem acesso');
    expect(called).toBe(false);
  });
  test('kill switch desligado', () => expect(handleChat(msg('ana@x.com'), deps({ enabled: () => false })).text).toContain('pausado'));
  test('sem agente configurado', () => expect(handleChat(msg('dono@x.com'), deps({ defaultAgent: () => null })).text).toContain('Nenhum agente'));
  test('sem chave', () => expect(handleChat(msg('dono@x.com'), deps({ apiKey: () => null })).text).toContain('chave do OpenRouter'));
  test('toolkit: DM do dono recebe tools + memória; espaço não recebe memória', () => {
    const seen: { dm: boolean; msgs: Message[]; defs: number }[] = [];
    let turns = 0;
    const d = deps({
      toolkit: (_s, ownerDm) => ({ tools: allowedTools(['now']), ctx: { now: () => '10:00', ownerDm, memory: { read: () => '', write: () => {} } }, memory: '- prefiro 10h', steps: 3 }),
      llm: (_k, _m, ms, defs = []) => (seen.push({ dm: false, msgs: ms, defs: defs.length }), { text: 'ok' }),
      onTurn: () => void turns++,
    });
    handleChat({ ...msg('dono@x.com'), space: { name: 'spaces/D', singleUserBotDm: true } }, d);
    handleChat(msg('dono@x.com'), d);
    expect(seen[0].defs).toBe(1);
    expect(seen[0].msgs.some((m) => m.content.includes('prefiro 10h'))).toBe(true);
    expect(seen[1].msgs.some((m) => m.content.includes('prefiro 10h'))).toBe(false);
    expect(turns).toBe(2);
  });
  test('DM de outra pessoa não é DM do dono', () => {
    let dm: boolean | undefined;
    handleChat({ ...msg('ana@x.com'), space: { name: 'spaces/D', type: 'DM' } }, deps({ toolkit: (_s, ownerDm) => ((dm = ownerDm), { tools: [], ctx: { now: () => '', ownerDm, memory: { read: () => '', write: () => {} } }, steps: 1 }) }));
    expect(dm).toBe(false);
  });
  test('erro do LLM vira mensagem amigável', () => {
    const r = handleChat(msg('dono@x.com'), deps({ llm: () => { throw new Error('OpenRouter 500: boom'); } }));
    expect(r.text).toContain('OpenRouter 500');
  });
});

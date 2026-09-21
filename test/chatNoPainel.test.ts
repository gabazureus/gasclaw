// O dono não conseguia achar a conversa com o agente no Google Chat: o app do dev e o de prod respondem com
// o MESMO nome ("gasclaw"). A conversa certa sai da identidade do PRÓPRIO app deste projeto — a lista de
// espaços em que ele está —, não de uma busca por nome.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
let espacos: { name: string; spaceType: string }[] = [];
// A conversa direta do DONO com o app, pela Chat API (`spaces:findDirectMessage`). `null` = ainda não existe (404).
let dmDono: string | null = 'spaces/DMDONO';
beforeEach(() => {
  vi.resetModules();
  espacos = [{ name: 'spaces/SALA1', spaceType: 'SPACE' }, { name: 'spaces/DM1', spaceType: 'DIRECT_MESSAGE' }];
  dmDono = 'spaces/DMDONO';
  env = stubGas();
  env.route = (url) => {
    if (url.startsWith('https://chat.googleapis.com/v1/spaces:findDirectMessage?')) return dmDono ? { code: 200, body: JSON.stringify({ name: dmDono, spaceType: 'DIRECT_MESSAGE' }) } : { code: 404, body: '{"error":{"code":404}}' };
    return url.startsWith('https://chat.googleapis.com/v1/spaces?') ? { code: 200, body: JSON.stringify({ spaces: espacos }) } : null;
  };
});
afterEach(() => vi.unstubAllGlobals());

describe('chatLink: a conversa com ESTE app do Chat', () => {
  // AUDITORIA F9: o app tem conversa direta com QUALQUER pessoa do domínio que falou com ele. A primeira
  // da lista podia ser a de outra pessoa — e o mesmo destino passou a receber as respostas do Reach out.
  test('devolve a conversa direta DO DONO — não a primeira da lista, nem uma sala', async () => {
    const m = await import('../src/main');
    const r = m.chatLink() as { ok: boolean; url?: string };
    expect(r).toMatchObject({ ok: true });
    expect(r.url).toContain('DMDONO');
    expect(r.url).not.toContain('DM1');
    expect(env.calls.some((c) => c.url.includes(`name=users%2F${encodeURIComponent('dono@x.com')}`) || c.url.includes('name=users/dono%40x.com'))).toBe(true);
  });

  test('sem conversa direta com o dono ainda: diz o que fazer, sem inventar link', async () => {
    dmDono = null;
    const m = await import('../src/main');
    expect(m.chatLink()).toMatchObject({ ok: false, reason: expect.stringContaining('gasclaw') });
  });

  test('quem não é o dono não recebe o link', async () => {
    env.activeUser = 'estranho@x.com';
    const m = await import('../src/main');
    expect(() => m.chatLink()).toThrow(/owner/i);
  });
});

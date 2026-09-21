// O dono não conseguia achar a conversa com o agente no Google Chat: o app do dev e o de prod respondem com
// o MESMO nome ("gasclaw"). A conversa certa sai da identidade do PRÓPRIO app deste projeto — a lista de
// espaços em que ele está —, não de uma busca por nome.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
let espacos: { name: string; spaceType: string }[] = [];
beforeEach(() => {
  vi.resetModules();
  espacos = [{ name: 'spaces/SALA1', spaceType: 'SPACE' }, { name: 'spaces/DM1', spaceType: 'DIRECT_MESSAGE' }];
  env = stubGas();
  env.route = (url) => (url.startsWith('https://chat.googleapis.com/v1/spaces?') ? { code: 200, body: JSON.stringify({ spaces: espacos }) } : null);
});
afterEach(() => vi.unstubAllGlobals());

describe('chatLink: a conversa com ESTE app do Chat', () => {
  test('devolve o endereço da conversa direta, não o de uma sala', async () => {
    const m = await import('../src/main');
    const r = m.chatLink() as { ok: boolean; url?: string };
    expect(r).toMatchObject({ ok: true });
    expect(r.url).toContain('DM1');
    expect(r.url).not.toContain('SALA1');
  });

  test('sem conversa direta ainda: diz o que fazer, sem inventar link', async () => {
    espacos = [{ name: 'spaces/SALA1', spaceType: 'SPACE' }];
    const m = await import('../src/main');
    expect(m.chatLink()).toMatchObject({ ok: false, reason: expect.stringContaining('gasclaw') });
  });

  test('quem não é o dono não recebe o link', async () => {
    env.activeUser = 'estranho@x.com';
    const m = await import('../src/main');
    expect(() => m.chatLink()).toThrow(/owner/i);
  });
});

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas } from './gasEnv';

// A limpeza de 90 dias (`cleanupRunsDaily`) faz até 200 PATCH em série, um por arquivo vencido — e rodava
// DENTRO do ScriptLock. O lock do Apps Script é GLOBAL: é o mesmo que a aprovação precisa tomar
// (`approvalStore`/`runStore`, com 10 s de paciência). Quem clicasse "Aprovar" na janela dos 200 PATCH
// levava "aprovação ocupada" — um erro na cara do usuário, causado por uma faxina que não tem nada a ver
// com aprovar nada e que não precisa do lock, porque não mexe na fila.
//
// O que este teste trava é a ORDEM: a limpeza só pode começar depois de o lock ser solto.

const ordem: string[] = [];

vi.mock('../src/runlog', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  cleanupRunsDaily: () => ordem.push('cleanup'),
}));

beforeEach(() => {
  ordem.length = 0;
  stubGas(); // ambiente do Apps Script (Properties, Cache, UrlFetch) — sem ele a drenagem morre no primeiro acesso
  vi.stubGlobal('LockService', {
    getScriptLock: () => ({
      tryLock: () => (ordem.push('lock'), true),
      releaseLock: () => ordem.push('unlock'),
    }),
  });
});

describe('drain: a faxina de 90 dias não pode segurar o ScriptLock global', () => {
  test('a limpeza só começa depois de o lock ser solto', async () => {
    const { drain } = await import('../src/observe');
    drain(200, false);
    expect(ordem).toContain('cleanup');
    expect(ordem.indexOf('cleanup')).toBeGreaterThan(ordem.indexOf('unlock'));
  });

  test('no modo inline (turno ou tela) a limpeza continua não rodando', async () => {
    const { drain } = await import('../src/observe');
    drain(200, true);
    expect(ordem).not.toContain('cleanup');
  });

  test('se o lock está ocupado, nada de limpeza: quem tem o lock é quem drena', async () => {
    vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => ordem.push('unlock') }) });
    const { drain } = await import('../src/observe');
    expect(drain(200, false).skipped).toBeTruthy();
    expect(ordem).not.toContain('cleanup');
  });
});

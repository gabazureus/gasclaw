import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let me = 'dono@x.com';
let status = 'REQUIRED';
const calls: string[] = [];
let props: Record<string, string>;

function stubGas() {
  props = { OWNER: 'dono@x.com', AGENTS: '[]' };
  const store = {
    getProperty: (k: string) => props[k] ?? null,
    setProperty: (k: string, v: string) => void (props[k] = v),
    getProperties: () => ({ ...props }),
    deleteProperty: (k: string) => void delete props[k],
  };
  const cache = { get: () => null, put: () => undefined, remove: () => undefined, removeAll: () => undefined, getAll: () => ({}) };
  const trigger = { timeBased: () => trigger, everyMinutes: () => trigger, create: () => (calls.push('createTrigger'), {}) };
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => store });
  vi.stubGlobal('CacheService', { getScriptCache: () => cache });
  vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) });
  vi.stubGlobal('Session', { getActiveUser: () => ({ getEmail: () => me }), getEffectiveUser: () => ({ getEmail: () => 'dono@x.com' }) });
  vi.stubGlobal('ScriptApp', {
    AuthMode: { FULL: 'FULL' },
    AuthorizationStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED' },
    getService: () => ({ getUrl: () => 'https://script.google.com/a/x.com/macros/s/AKfy/exec' }),
    getScriptId: () => 'script-teste',
    getAuthorizationInfo: () => ({ getAuthorizationStatus: () => status, getAuthorizationUrl: () => (status === 'REQUIRED' ? 'https://accounts.google.com/o/oauth2/auth?x=1' : null) }),
    requireAllScopes: (mode: string) => void calls.push(`requireAllScopes:${mode}`),
    getProjectTriggers: () => [],
    newTrigger: () => trigger,
  });
}

const main = () => import('../src/main');

beforeEach(() => {
  me = 'dono@x.com';
  status = 'REQUIRED';
  calls.length = 0;
  stubGas();
});
afterEach(() => vi.unstubAllGlobals());

describe('consentimento granular: a falta de escopo precisa virar pedido de autorização', () => {
  test('settingsState avisa quando falta autorização, com o link do Google', async () => {
    const { settingsState } = await main();
    expect(settingsState().auth).toEqual({ required: true, url: 'https://accounts.google.com/o/oauth2/auth?x=1', editorFunction: 'authorize' });
  });
  test('settingsState sem pendência não mostra aviso', async () => {
    status = 'NOT_REQUIRED';
    const { settingsState } = await main();
    expect(settingsState().auth).toEqual({ required: false, url: null, editorFunction: 'authorize' });
  });
  test('authorize (rodado no editor) exige todos os escopos, cria o gatilho depois e devolve "ok"', async () => {
    const { authorize } = await main();
    expect(authorize()).toBe('ok');
    expect(calls[0]).toBe('requireAllScopes:FULL');
    expect(calls).toContain('createTrigger');
  });
  test('authorize com a autorização já concedida cria o gatilho sem chamar requireAllScopes (que encerraria a execução)', async () => {
    status = 'NOT_REQUIRED';
    const { authorize } = await main();
    expect(authorize()).toBe('ok');
    expect(calls).toEqual(['createTrigger']);
  });
  test('authorize é só do dono', async () => {
    me = 'outra@x.com';
    const { authorize } = await main();
    expect(() => authorize()).toThrow(/Only the gasclaw owner/);
    expect(calls).toEqual([]);
  });
});

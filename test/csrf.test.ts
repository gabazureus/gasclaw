import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const SECRET = '0123456789abcdef'.repeat(4);
let props: Record<string, string>;

function stubGas() {
  props = { OWNER: 'dono@x.com', AGENTS: '[]', RUNTIME_ENABLED: 'true', CLI_SECRET: SECRET };
  const store = {
    getProperty: (k: string) => props[k] ?? null,
    setProperty: (k: string, v: string) => void (props[k] = v),
    getProperties: () => ({ ...props }),
    deleteProperty: (k: string) => void delete props[k],
  };
  const cache = { get: () => null, put: () => undefined, remove: () => undefined, removeAll: () => undefined, getAll: () => ({}) };
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => store });
  vi.stubGlobal('CacheService', { getScriptCache: () => cache });
  vi.stubGlobal('Session', { getActiveUser: () => ({ getEmail: () => 'dono@x.com' }), getEffectiveUser: () => ({ getEmail: () => 'dono@x.com' }) });
  vi.stubGlobal('ScriptApp', { getService: () => ({ getUrl: () => 'https://script.google.com/a/x.com/macros/s/AKfy/exec' }) });
  vi.stubGlobal('ContentService', { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => ({ getContent: () => s }) }) });
}

const body = (out: unknown) => JSON.parse((out as { getContent: () => string }).getContent());
const post = async (parameter: Record<string, string>) => body((await import('../src/main')).doPost({ parameter } as never));
const get = async (parameter: Record<string, string>) => body((await import('../src/main')).doGet({ parameter } as never));

beforeEach(stubGas);
afterEach(() => vi.unstubAllGlobals());

describe('M1: ações com efeito só por POST com o segredo da CLI', () => {
  test('POST sem segredo = 403 e nada muda', async () => {
    expect(await post({ action: 'disable' })).toMatchObject({ ok: false, status: 403 });
    expect(props.RUNTIME_ENABLED).toBe('true');
  });
  test('POST com segredo errado = 403 e nada muda', async () => {
    expect(await post({ action: 'disable', secret: 'f'.repeat(64) })).toMatchObject({ ok: false, status: 403 });
    expect(props.RUNTIME_ENABLED).toBe('true');
  });
  test('POST com o segredo certo executa', async () => {
    expect(await post({ action: 'disable', secret: SECRET })).toMatchObject({ ok: true, enabled: false });
    expect(props.RUNTIME_ENABLED).toBe('false');
  });
  test('GET de ação com efeito é recusado (405) e nada muda, mesmo com o segredo na URL', async () => {
    for (const action of ['disable', 'enable', 'drain', 'poc', 'eval']) {
      expect(await get({ action, secret: SECRET })).toMatchObject({ ok: false, status: 405 });
    }
    expect(props.RUNTIME_ENABLED).toBe('true');
  });
  test('GET de leitura continua funcionando', async () => {
    expect(await get({ action: 'health' })).toMatchObject({ ok: true, enabled: true });
  });
  test('setsecret: grava na primeira vez; depois só com o segredo atual', async () => {
    delete props.CLI_SECRET;
    expect(await post({ action: 'setsecret', secret: SECRET })).toMatchObject({ ok: true });
    expect(props.CLI_SECRET).toBe(SECRET);
    expect(await post({ action: 'setsecret', secret: 'a'.repeat(64) })).toMatchObject({ ok: false, status: 403 });
    expect(props.CLI_SECRET).toBe(SECRET);
    expect(await post({ action: 'setsecret', secret: SECRET })).toMatchObject({ ok: true });
  });
  test('setsecret recusa segredo fraco ou mal formado', async () => {
    delete props.CLI_SECRET;
    expect(await post({ action: 'setsecret', secret: 'curto' })).toMatchObject({ ok: false, status: 400 });
    expect(props.CLI_SECRET).toBeUndefined();
  });
});

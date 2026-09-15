import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const SECRET = '0123456789abcdef'.repeat(4);
const JOB = 'a1b2c3d4e5f60718';
let props: Record<string, string>;
let cacheStore: Record<string, string>;

function stubGas() {
  props = { OWNER: 'dono@x.com', AGENTS: '[]', RUNTIME_ENABLED: 'true', CLI_SECRET: SECRET };
  cacheStore = {};
  const store = {
    getProperty: (k: string) => props[k] ?? null,
    setProperty: (k: string, v: string) => void (props[k] = v),
    getProperties: () => ({ ...props }),
    deleteProperty: (k: string) => void delete props[k],
  };
  const cache = {
    get: (k: string) => cacheStore[k] ?? null,
    put: (k: string, v: string) => void (cacheStore[k] = v),
    remove: (k: string) => void delete cacheStore[k],
    removeAll: () => undefined,
    getAll: () => ({}),
  };
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

describe('job da CLI: a resposta do web app às vezes se perde no Google (echo), então o resultado fica recuperável', () => {
  test('POST com job executa uma vez e guarda o resultado; GET job devolve esse resultado', async () => {
    expect(await post({ action: 'disable', secret: SECRET, job: JOB })).toMatchObject({ ok: true, enabled: false });
    expect(await get({ action: 'job', id: JOB })).toMatchObject({ ok: true, status: 'done', result: { ok: true, enabled: false } });
  });
  test('POST repetido com o mesmo job não executa de novo (devolve o guardado)', async () => {
    await post({ action: 'disable', secret: SECRET, job: JOB });
    props.RUNTIME_ENABLED = 'true'; // se reexecutasse, voltaria a false
    expect(await post({ action: 'disable', secret: SECRET, job: JOB })).toMatchObject({ ok: true, enabled: false });
    expect(props.RUNTIME_ENABLED).toBe('true');
  });
  test('GET job de id desconhecido responde unknown; id mal formado é recusado', async () => {
    expect(await get({ action: 'job', id: 'ffffffffffffffff' })).toMatchObject({ ok: true, status: 'unknown' });
    expect(await get({ action: 'job', id: '../x' })).toMatchObject({ ok: false, status: 400 });
  });
  test('POST com segredo errado não cria job nem executa', async () => {
    expect(await post({ action: 'disable', secret: 'f'.repeat(64), job: JOB })).toMatchObject({ ok: false, status: 403 });
    expect(await get({ action: 'job', id: JOB })).toMatchObject({ status: 'unknown' });
    expect(props.RUNTIME_ENABLED).toBe('true');
  });
  test('POST sem job continua funcionando como antes', async () => {
    expect(await post({ action: 'enable', secret: SECRET })).toMatchObject({ ok: true, enabled: true });
  });
});

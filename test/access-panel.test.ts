import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { effectiveAccess } from '../src/workspace';

let props: Record<string, string>;
let me = 'dono@x.com';

function stubGas() {
  props = { OWNER: 'dono@x.com', AGENTS: '[{"folderId":"f1","name":"assistente"}]', 'ACCESS:f1': '{"users":[],"tools":[]}', CLI_SECRET: 'a'.repeat(64), CLI_SECRET_AT: '2026-09-15T12:00:00.000Z' };
  const store = {
    getProperty: (k: string) => props[k] ?? null,
    setProperty: (k: string, v: string) => void (props[k] = v),
    setProperties: (values: Record<string, string>) => void Object.assign(props, values),
    getProperties: () => ({ ...props }),
    deleteProperty: (k: string) => void delete props[k],
  };
  const cache = { get: () => null, put: () => undefined, remove: () => undefined, removeAll: () => undefined, getAll: () => ({}) };
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => store });
  vi.stubGlobal('CacheService', { getScriptCache: () => cache });
  vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) });
  vi.stubGlobal('Utilities', { formatDate: () => '20260915-120000', getUuid: () => 'abcd-efgh' });
  vi.stubGlobal('Session', { getActiveUser: () => ({ getEmail: () => me }), getEffectiveUser: () => ({ getEmail: () => 'dono@x.com' }) });
  vi.stubGlobal('ScriptApp', { getService: () => ({ getUrl: () => 'https://script.google.com/a/x.com/macros/s/AKfy/exec' }), getScriptId: () => 'script-teste', getProjectTriggers: () => [] });
}

const main = () => import('../src/main');

beforeEach(() => {
  me = 'dono@x.com';
  stubGas();
});
afterEach(() => vi.unstubAllGlobals());

describe('M2 (ADR-021): acesso e ferramentas só valem depois de aprovados no painel', () => {
  test('só o dono aprova; quem não é dono não muda nada', async () => {
    me = 'outra@x.com';
    const { approveAccess } = await main();
    expect(() => approveAccess('f1', { users: ['ana@x.com'], tools: ['now'] })).toThrow(/Only the gasclaw owner/);
    expect(props['ACCESS:f1']).toBe('{"users":[],"tools":[]}');
  });
  test('aprovar grava o acesso normalizado em ACCESS:<id> e registra um run config no trace (fila)', async () => {
    const { approveAccess } = await main();
    approveAccess('f1', { users: ['Ana@X.com', 'ana@x.com'], tools: ['now', 'memory'] });
    expect(JSON.parse(props['ACCESS:f1'])).toEqual(effectiveAccess({ users: ['Ana@X.com', 'ana@x.com'], tools: ['now', 'memory'] }));
    expect(Object.keys(props).some((k) => k.startsWith('Q:'))).toBe(true);
  });
  test('removeAccess apaga a aprovação (o agente volta a responder só ao dono, sem tools)', async () => {
    const { removeAccess } = await main();
    removeAccess('f1');
    expect(props['ACCESS:f1']).toBeUndefined();
  });
  test('removeAgent também apaga ACCESS:<id>', async () => {
    const { removeAgent } = await main();
    removeAgent('f1');
    expect(props['ACCESS:f1']).toBeUndefined();
    expect(JSON.parse(props.AGENTS)).toEqual([]);
  });
  test('settingsState mostra quando o segredo da CLI foi registrado; resetCliSecret apaga (só dono)', async () => {
    const { settingsState, resetCliSecret } = await main();
    expect(settingsState().cliSecretAt).toBe('2026-09-15T12:00:00.000Z');
    resetCliSecret();
    expect(props.CLI_SECRET).toBeUndefined();
    expect(props.CLI_SECRET_AT).toBeUndefined();
    me = 'outra@x.com';
    props.CLI_SECRET = 'b'.repeat(64);
    expect(() => resetCliSecret()).toThrow(/Only the gasclaw owner/);
    expect(props.CLI_SECRET).toBe('b'.repeat(64));
  });
});

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';
import { QUEUE_PREFIX } from '../src/batch';

// A limpeza de 90 dias (`cleanupRunsDaily`) faz até 200 PATCH em série, um por arquivo vencido — e rodava
// DENTRO do ScriptLock. O lock do Apps Script é GLOBAL: é o mesmo que a aprovação precisa tomar
// (`approvalStore`/`runStore`, com 10 s de paciência). Quem clicasse "Aprovar" na janela dos 200 PATCH
// levava "aprovação ocupada" — um erro na cara do usuário, causado por uma faxina que não tem nada a ver
// com aprovar nada e que não precisa do lock, porque não mexe na fila.
//
// O que este teste trava é a ORDEM: a limpeza só pode começar depois de o lock ser solto.

const ordem: string[] = [];
let env: GasEnv;
/** Uma entrada na fila de observabilidade: sem ela não há o que drenar, e a drenagem sai pelo atalho. */
const comFila = () => {
  env.props[`${QUEUE_PREFIX}r1`] = JSON.stringify({ id: 'r1', at: 1000, row: ['a', 'b', 'chat', 'd', 'done', 'f', 10], recs: [] });
  delete env.cache['obs:empty'];
};

vi.mock('../src/runlog', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  cleanupRunsDaily: () => ordem.push('cleanup'),
}));

beforeEach(() => {
  ordem.length = 0;
  env = stubGas(); // ambiente do Apps Script (Properties, Cache, UrlFetch) — sem ele a drenagem morre no primeiro acesso
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
    comFila();
    drain(200, false);
    expect(ordem).toContain('cleanup');
    expect(ordem.indexOf('cleanup')).toBeGreaterThan(ordem.indexOf('unlock'));
  });

  test('no modo inline (turno ou tela) a limpeza continua não rodando', async () => {
    const { drain } = await import('../src/observe');
    comFila();
    drain(200, true);
    expect(ordem).not.toContain('cleanup');
  });

  test('se o lock está ocupado, nada de limpeza: quem tem o lock é quem drena', async () => {
    vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => ordem.push('unlock') }) });
    const { drain } = await import('../src/observe');
    comFila();
    expect(drain(200, false).skipped).toBeTruthy();
    expect(ordem).not.toContain('cleanup');
  });
});

// O TIQUE OCIOSO (medido no dev, 2026-09-22, N=13): 577–1616 ms, 5 de 13 acima do critério de 1000 ms da
// ADR-027. A drenagem sozinha custava 285–652 ms — e, com a fila vazia, tudo o que ela fazia era tomar o
// ScriptLock GLOBAL (o mesmo que a aprovação toma) e ler as Properties inteiras para achar zero entradas.
describe('tique ocioso: a drenagem com fila vazia não toma o lock nem relê as Properties', () => {
  test('a primeira drenagem vazia deixa a marca; a seguinte sai sem lock e sem getProperties', async () => {
    const { drain } = await import('../src/observe');
    let leituras = 0;
    const real = PropertiesService.getScriptProperties();
    vi.stubGlobal('PropertiesService', { getScriptProperties: () => ({ ...real, getProperties: () => (leituras++, real.getProperties()) }), getUserProperties: () => real });
    drain(200, false); // fila vazia: paga o lock uma vez e marca
    expect(ordem).toContain('lock');
    expect(leituras).toBe(1);
    ordem.length = 0;
    leituras = 0;
    drain(200, false);
    expect(ordem).not.toContain('lock'); // o atalho não toca no ScriptLock global
    expect(leituras).toBe(0); // nem nas Properties
    expect(ordem).toContain('cleanup'); // e a faxina de 90 dias continua acontecendo
  });

  test('quem enfileira apaga a marca: trabalho novo nunca fica escondido', async () => {
    const obs = await import('../src/observe');
    obs.drain(200, false);
    expect(env.cache['obs:empty']).toBeDefined();
    obs.enqueue({ id: 'r9', kind: 'chat', status: 'done', startedAt: 1, endedAt: 2, spans: [] } as never);
    expect(env.cache['obs:empty']).toBeUndefined();
    ordem.length = 0;
    obs.drain(200, false);
    expect(ordem).toContain('lock'); // voltou a drenar de verdade
  });
});

// A faxina de 90 dias roda UMA vez por dia, mas a guarda que decide isso lia as Properties a cada tique —
// um round-trip de serviço por minuto, para sempre, só para reler a mesma data. Medido na P3: era o que
// sobrava do `drainMs` depois do atalho da fila vazia.
describe('a guarda da faxina diária não relê as Properties a cada tique', () => {
  test('a segunda chamada no mesmo dia sai pelo cache', async () => {
    vi.doUnmock('../src/runlog');
    vi.resetModules();
    const env2 = stubGas();
    let leituras = 0;
    const real = PropertiesService.getScriptProperties();
    vi.stubGlobal('PropertiesService', { getScriptProperties: () => ({ ...real, getProperty: (k: string) => (leituras++, real.getProperty(k)) }), getUserProperties: () => real });
    const { cleanupRunsDaily } = await import('../src/runlog');
    cleanupRunsDaily();
    expect(leituras).toBeGreaterThan(0); // a primeira do dia confere na fonte da verdade
    expect(env2.props['RUNS_CLEANUP_DAY']).toBeDefined();
    leituras = 0;
    cleanupRunsDaily();
    expect(leituras).toBe(0);
  });

  test('sem o cache, a Property ainda decide (a fonte da verdade não mudou)', async () => {
    vi.doUnmock('../src/runlog');
    vi.resetModules();
    const env2 = stubGas();
    const { cleanupRunsDaily } = await import('../src/runlog');
    cleanupRunsDaily();
    const dia = env2.props['RUNS_CLEANUP_DAY'];
    env2.cache = {}; // cache perdido
    let regravou = 0;
    const real = PropertiesService.getScriptProperties();
    vi.stubGlobal('PropertiesService', { getScriptProperties: () => ({ ...real, setProperty: (k: string, v: string) => { if (k === 'RUNS_CLEANUP_DAY') regravou++; real.setProperty(k, v); } }), getUserProperties: () => real });
    cleanupRunsDaily();
    expect(env2.props['RUNS_CLEANUP_DAY']).toBe(dia);
    // Sem a releitura da Property, o cache perdido faria a faxina do dia rodar DE NOVO — 200 PATCH em série
    // por tique até o cache voltar. Regravar a marca é o sinal de que ela rodou.
    expect(regravou).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Completion } from '../src/llm';
import type { ModelInfo } from '../src/models';

const m = (id: string, ctx: number, tools: boolean, free = true): ModelInfo => ({ id, ctx, inM: 0, outM: 0, tools, free });
const LISTA: ModelInfo[] = [m('a/grande:free', 128_000, true), m('b/medio:free', 64_000, true), m('c/pago', 200_000, true, false)];

const falhas: Record<string, number> = {};
const anotadas: string[] = [];
let tierNoCache: boolean | null = false;
let listaAtual = LISTA;
/** C7 (P16): o turno não pode fazer chamada remota ao /key. Este contador é o que prova isso. */
let chamadasAoKey = 0;

vi.mock('../src/models', async (orig) => ({
  ...(await orig<typeof import('../src/models')>()),
  listModels: () => listaAtual,
  keyInfo: () => {
    chamadasAoKey++;
    return { limit: null, usage: 0, usage_daily: 0, is_free_tier: true };
  },
  freeTierCached: () => tierNoCache,
  freeFailures: () => falhas,
  noteFreeFailure: (id: string) => void anotadas.push(id),
}));

const resposta = (model: string) => ({ model, usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } }) as unknown as Completion;

/** Usage guardado nas Properties: `props` controla quantas requisições gratuitas já houve hoje. */
function stubGas(props: Record<string, string> = {}) {
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => ({ getProperties: () => props, getProperty: (k: string) => props[k] ?? null, setProperty: () => undefined }) });
  vi.stubGlobal('CacheService', { getScriptCache: () => ({ get: () => null, put: () => undefined, remove: () => undefined }) });
}

beforeEach(() => {
  for (const k of Object.keys(falhas)) delete falhas[k];
  anotadas.length = 0;
  tierNoCache = false;
  listaAtual = LISTA;
  chamadasAoKey = 0;
  stubGas();
});
afterEach(() => vi.unstubAllGlobals());

describe('runFree: o rodízio em volta da chamada ao modelo', () => {
  test('sem falha, usa o primeiro candidato e não inventa fallback', async () => {
    const { runFree } = await import('../src/freeRun');
    const r = runFree((model) => resposta(model), { tools: true });
    expect(r.model).toBe('a/grande:free');
    expect(r.fallback).toBeUndefined();
    expect(anotadas).toEqual([]);
  });

  test('429 no primeiro: passa para o segundo, registra o caminho e guarda a falha', async () => {
    const { runFree } = await import('../src/freeRun');
    const r = runFree((model) => {
      if (model === 'a/grande:free') throw new Error('OpenRouter 429: rate limit');
      return resposta(model);
    }, { tools: true });
    expect(r.model).toBe('b/medio:free');
    expect(r.fallback).toEqual([{ model: 'a/grande:free', error: 'OpenRouter 429: rate limit' }]);
    expect(anotadas).toEqual(['a/grande:free']); // fica de castigo por 15 min
  });

  test('erro de autorização não troca de modelo nem gasta outra chamada', async () => {
    const { runFree } = await import('../src/freeRun');
    let chamadas = 0;
    expect(() => runFree(() => {
      chamadas++;
      throw new Error('OpenRouter 401: no auth');
    }, { tools: true })).toThrow(/401/);
    expect(chamadas).toBe(1);
    expect(anotadas).toEqual([]);
  });

  test('com a cota gratuita no limite, nem chama o modelo e explica o motivo', async () => {
    tierNoCache = true; // sem crédito comprado: 50 por dia
    // as Properties do uso guardam um grupo por mês: USAGE:d:<AAAA-MM> = { "<dia>": { "<modelo>": célula } }
    const hoje = new Date().toISOString().slice(0, 10);
    stubGas({ [`USAGE:d:${hoje.slice(0, 7)}`]: JSON.stringify({ [hoje]: { 'a/grande:free': { req: 50, tok: 10, cost: 0 } } }) });
    const { runFree } = await import('../src/freeRun');
    let chamadas = 0;
    expect(() => runFree(() => {
      chamadas++;
      return resposta('a/grande:free');
    }, { tools: true })).toThrow(/rodízio gratuito indisponível/i);
    expect(chamadas).toBe(0);
  });

  test('sem gratuito que aceite ferramentas, o erro diz onde olhar', async () => {
    listaAtual = [m('c/sem-tools:free', 200_000, false), m('d/pago', 128_000, true, false)];
    const { runFree } = await import('../src/freeRun');
    expect(() => runFree((model) => resposta(model), { tools: true })).toThrow(/nenhum modelo gratuito/i);
  });
});

describe('C7 (P16): o turno nunca consulta o /key', () => {
  test('um turno inteiro, com troca de modelo, não faz nenhuma chamada remota ao /key', async () => {
    const { runFree } = await import('../src/freeRun');
    runFree((model) => {
      if (model === 'a/grande:free') throw new Error('OpenRouter 429: rate limit');
      return resposta(model);
    }, { tools: true });
    expect(chamadasAoKey).toBe(0);
  });

  test('o teto do dia vem do cache do painel, sem ler a chave', async () => {
    const { freeQuotaNow } = await import('../src/freeRun');
    tierNoCache = true;
    expect(freeQuotaNow().freeTier).toBe(true);
    tierNoCache = false;
    expect(freeQuotaNow().freeTier).toBe(false);
    expect(chamadasAoKey).toBe(0);
  });

  test('sem nenhuma leitura ainda (cache vazio), assume o teto maior em vez de bloquear por suposição', async () => {
    tierNoCache = null;
    const { freeQuotaNow } = await import('../src/freeRun');
    expect(freeQuotaNow().freeTier).toBe(false); // false = 1.000/dia; o 429 do provedor decide se estiver errado
    expect(chamadasAoKey).toBe(0);
  });
});

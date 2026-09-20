// A fiação do ciclo de sonho: iniciar e avançar.
//
// O núcleo (`dreamCycle`) já era testado; a borda (`dreamStore`) também. O que faltava era o que amarra
// os dois ao gatilho — e é aqui que moram os defeitos que o núcleo puro não consegue ter: trava presa,
// passo refeito depois de a execução morrer, e ciclo que some em silêncio.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
const mod = () => import('../src/dreamTick');

// `SCENARIOS` é `[]` no FONTE — quem o preenche é o build (`build.mjs` injeta os evals no bundle). Então
// em teste o conjunto-juiz está sempre vazio, e um teste que dependesse dele passaria pelo motivo errado.
// Aqui o juiz é declarado à mão, e o caso "vazio" vira um mock explícito.
const comJuiz = () =>
  vi.doMock('../src/judgeSet', () => ({
    SCENARIOS: [],
    namesOf: (set: string) => (set === 'gate' ? ['g1'] : set === 'quality' ? ['q1'] : ['h1']),
    scenarioMd: (n: string) => (n === 'g1' || n === 'q1' ? `# ${n}` : null),
  }));

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  comJuiz();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('../src/judgeSet'); // senão o mock de um teste vaza para o seguinte
});

const deps = (o: Partial<Record<string, unknown>> = {}) => ({
  spec: () => ({ folderId: 'f1', name: 'a', config: { model: 'x' }, system: '# titular', access: { users: [], tools: [] } }) as never,
  env: () => ({}) as never,
  generate: (_m: unknown, t: number) => `# candidato t=${t}`,
  material: () => '7 runs falharam tocando agenda',
  now: () => 1_700_000_000_000,
  cycleId: () => 'c1',
  ...o,
});

describe('startDream: um ciclo por agente, e nenhum sem juiz', () => {
  test('com um ciclo em curso, não começa outro — e diz qual está rodando', async () => {
    const m = await mod();
    (globalThis as never as { PropertiesService: { getScriptProperties: () => { setProperty: (k: string, v: string) => void } } }).PropertiesService.getScriptProperties().setProperty('DREAMLOCK:f1', 'ja-rodando');
    const r = m.startDream('f1', deps() as never);
    expect(r.started).toBe(false);
    expect(r.cycleId).toBe('ja-rodando');
    expect(r.reason).toMatch(/already has a cycle/);
  });

  // Conjunto vazio faria TODO candidato "passar" em nada, e o placar ficaria verde sobre coisa nenhuma.
  test('sem cenário no build, recusa em vez de rodar contra o vazio', async () => {
    vi.doUnmock('../src/judgeSet');
    vi.resetModules();
    vi.doMock('../src/judgeSet', () => ({ namesOf: () => [], scenarioMd: () => null, SCENARIOS: [] }));
    const m = await mod();
    const r = m.startDream('f1', deps() as never);
    expect(r.started).toBe(false);
    expect(r.reason).toMatch(/judge set is empty/);
  });

  test('gerador que devolve vazio não vira ciclo de candidatos em branco', async () => {
    const m = await mod();
    const r = m.startDream('f1', deps({ generate: () => '   ' }) as never);
    expect(r.started).toBe(false);
    expect(r.reason).toMatch(/no candidate/);
  });
});

describe('tickDream: avança, grava e nunca deixa a trava presa', () => {
  test('sem ciclo ativo, o tique não faz nada e diz que está ocioso', async () => {
    const m = await mod();
    expect(m.tickDream('f1', deps() as never)).toMatchObject({ status: 'idle', steps: 0 });
  });

  // O pior estado possível: ponteiro apontando para um estado ilegível. Deixar a trava presa faria o
  // agente nunca mais sonhar, e em silêncio.
  test('ponteiro sem estado legível SOLTA a trava e diz o motivo', async () => {
    const m = await mod();
    const props = (globalThis as never as { PropertiesService: { getScriptProperties: () => { setProperty: (k: string, v: string) => void; getProperty: (k: string) => string | null } } }).PropertiesService.getScriptProperties();
    props.setProperty('DREAMLOCK:f1', 'orfao');
    const r = m.tickDream('f1', deps() as never);
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/lock was released/);
    expect(props.getProperty('DREAMLOCK:f1')).toBeNull();
  });
});

// O teto por tique não é conforto: é o que impede o sonho de fazer o trabalho do dono esperar.
describe('o sonho cede a vez ao dono', () => {
  test('o tique toma no máximo DREAM_STEPS_PER_TICK passos', async () => {
    const { DREAM_STEPS_PER_TICK } = await import('../src/dreamCycle');
    expect(DREAM_STEPS_PER_TICK).toBeLessThan(20); // PUMP_MAX_STEPS: usar as 20 faria o dono esperar 16 min
    const fonte = (await import('node:fs')).readFileSync('src/dreamTick.ts', 'utf8');
    expect(fonte).toContain('i < DREAM_STEPS_PER_TICK');
  });

  // Gravar só no fim significaria refazer passos quando a execução morre — com 306 por ciclo, caro, e
  // pior: repetição contamina o placar.
  test('grava depois de CADA passo, não no fim', async () => {
    const fonte = (await import('node:fs')).readFileSync('src/dreamTick.ts', 'utf8');
    expect(fonte).toContain('io.save(s); // depois de CADA passo');
  });

  test('cenário que sumiu do build falha o ciclo com o nome, em vez de pular calado', async () => {
    const fonte = (await import('node:fs')).readFileSync('src/dreamTick.ts', 'utf8');
    expect(fonte).toContain('is not in this build');
    expect(fonte).toMatch(/failCycle\(s, `scenario/);
  });
});

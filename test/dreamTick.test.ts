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

// F7: a casca PASSA o titular ao plano. Sem isto o núcleo corrigido não serviria de nada — o defeito
// original morava justamente na fiação, e foi ali que o sucessor o consertou.
describe('startDream planeja a qualidade do titular', () => {
  test('o plano salvo leva passos de qualidade com o prompt do titular', async () => {
    const m = await mod();
    expect(m.startDream('f1', deps() as never).started).toBe(true);
    const { dreamIO } = await import('../src/dreamStore');
    const s = dreamIO().load('f1', 'c1');
    expect(s?.plan.steps.some((p) => p.candidate === '# titular' && p.kind === 'quality')).toBe(true);
  });
});

// Revisão 2026-09-21: o tique do sonho vinha DEPOIS de um pump de até 240 s e rodava até 5 execuções sem
// prazo. O Apps Script mata em 6 min — o passo morto no meio é pago e perdido. Agora ele recebe o prazo.
describe('tickDream respeita o prazo da execução', () => {
  let relogio = 0;
  let chamadas = 0;
  const comRun = (ms: number) =>
    vi.doMock('../src/dreamRun', async (orig) => ({
      ...(await orig<typeof import('../src/dreamRun')>()),
      runDreamStep: () => ((chamadas++, (relogio += ms)), { passed: true }),
    }));
  beforeEach(() => ((relogio = 0), (chamadas = 0)));
  afterEach(() => vi.doUnmock('../src/dreamRun'));
  const dRelogio = () => deps({ now: () => relogio }) as never;

  test('prazo que não cabe um passo: não começa nenhum', async () => {
    comRun(1_000);
    const m = await mod();
    m.startDream('f1', dRelogio());
    const r = m.tickDream('f1', dRelogio(), relogio + 1_000);
    expect(r.steps).toBe(0);
    expect(chamadas).toBe(0);
    expect(r.status).toBe('running');
  });

  test('para antes do passo que estouraria o prazo, usando a duração MEDIDA quando ela é maior', async () => {
    comRun(120_000); // passo mais lento que a estimativa
    const m = await mod();
    m.startDream('f1', dRelogio());
    const r = m.tickDream('f1', dRelogio(), relogio + 250_000);
    // t=0: 0+est<=250 roda → t=120; t=120: 120+120=240<=250 roda → t=240; 240+120>250 para.
    expect(r.steps).toBe(2);
  });

  // REVISÃO FINAL F9: a medida morria com o tique e cada tique novo apostava de novo nos 90 s. Quem chama
  // guarda o maior passo medido e o devolve como estimativa.
  test('a estimativa vinda de fora (o maior passo de tiques anteriores) vale desde o primeiro passo', async () => {
    comRun(120_000);
    const m = await mod();
    m.startDream('f1', dRelogio());
    // t=0: 0+200<=250 roda → t=120; 120+200>250 para. Com os 90 s padrão seriam 2.
    expect(m.tickDream('f1', dRelogio(), relogio + 250_000, 200_000).steps).toBe(1);
  });
  test('o tique devolve o maior passo medido, para quem chama guardar', async () => {
    comRun(120_000);
    const m = await mod();
    m.startDream('f1', dRelogio());
    expect(m.tickDream('f1', dRelogio(), relogio + 250_000).longestStepMs).toBe(120_000);
  });

  test('sem prazo, continua tomando até DREAM_STEPS_PER_TICK', async () => {
    comRun(1_000);
    const m = await mod();
    m.startDream('f1', dRelogio());
    const { DREAM_STEPS_PER_TICK } = await import('../src/dreamCycle');
    expect(m.tickDream('f1', dRelogio()).steps).toBe(DREAM_STEPS_PER_TICK);
  });
});

// Gatilhos de 1 min se sobrepõem quando um tique passa de 60 s. Dois tiques no mesmo ciclo pagariam o
// mesmo passo duas vezes, e o último `save` apagaria o passo do outro. O segundo tique PULA o sonho.
describe('withDreamLease: um tique de sonho por vez', () => {
  const props = () => (globalThis as never as { PropertiesService: { getScriptProperties: () => { setProperty: (k: string, v: string) => void; getProperty: (k: string) => string | null } } }).PropertiesService.getScriptProperties();

  test('livre: roda, e solta o arrendamento no fim', async () => {
    const m = await mod();
    let rodou = false;
    expect(m.withDreamLease(1_000, 400_000, () => void (rodou = true))).toBe(true);
    expect(rodou).toBe(true);
    expect(props().getProperty(m.DREAM_LEASE_KEY)).toBeNull();
  });

  test('outro tique segurando (arrendamento no futuro): pula sem rodar', async () => {
    const m = await mod();
    props().setProperty(m.DREAM_LEASE_KEY, '5000');
    let rodou = false;
    expect(m.withDreamLease(1_000, 400_000, () => void (rodou = true))).toBe(false);
    expect(rodou).toBe(false);
    expect(props().getProperty(m.DREAM_LEASE_KEY)).toBe('5000');
  });

  test('arrendamento vencido (execução morta pelo teto): o próximo tique assume', async () => {
    const m = await mod();
    props().setProperty(m.DREAM_LEASE_KEY, '500');
    let rodou = false;
    expect(m.withDreamLease(1_000, 400_000, () => void (rodou = true))).toBe(true);
    expect(rodou).toBe(true);
  });

  test('exceção dentro: o arrendamento sai mesmo assim', async () => {
    const m = await mod();
    expect(() => m.withDreamLease(1_000, 400_000, () => { throw new Error('x'); })).toThrow('x');
    expect(props().getProperty(m.DREAM_LEASE_KEY)).toBeNull();
  });

  test('ScriptLock ocupado: não espera, pula', async () => {
    vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => undefined }) });
    const m = await mod();
    let rodou = false;
    expect(m.withDreamLease(1_000, 400_000, () => void (rodou = true))).toBe(false);
    expect(rodou).toBe(false);
  });
});

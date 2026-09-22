// A FIAÇÃO do ciclo de sonho: o que o gatilho de 1 min chama, e o que inicia um ciclo.
//
// Tudo abaixo é casca imperativa. As decisões moram no núcleo (`dreamCycle.ts`), o estado na borda
// (`dreamStore.ts`) e a execução de um passo em `dreamRun.ts`. Aqui só se amarra.
//
// Duas escolhas que valem o comentário, porque parecem detalhe e não são:
//
// 1. O TIQUE TOMA NO MÁXIMO `DREAM_STEPS_PER_TICK` PASSOS. Medido: `PUMP_MAX_STEPS = 20` não estrangula
//    o ciclo — 312 passos caberiam em 16 tiques. O risco é o OPOSTO: se o sonho usasse as 20 voltas, o
//    trabalho que o DONO pediu esperaria 16 minutos. O sonho não tem pressa; o dono tem.
// 2. FALHA HONESTA, NUNCA SILENCIOSA. Um ciclo que morre calado deixaria o `DREAMLOCK:` preso para
//    sempre e o dono achando que ele ainda roda. Toda saída anormal passa por `failCycle`, que grava o
//    motivo e libera a trava.
import { DREAM_STEPS_PER_TICK, dreamVerdict, nextStep, planCycle, stepKey, type DreamStep } from './dreamCycle';
import { afterStep, dreamIO, failCycle, newCycle, type DreamState } from './dreamStore';
import { candidateMessages, cleanCandidate, CANDIDATE_TEMPERATURES, runDreamStep } from './dreamRun';
import { namesOf, scenarioMd } from './judgeSet';
import type { AgentSpec } from './workspace';
import type { EvalEnv } from './evalEntry';
import type { Message } from './llm';

export type DreamDeps = {
  /** O agente como está hoje: o titular do ciclo. */
  spec: (folderId: string) => AgentSpec;
  /** Ambiente de execução de um cenário, já apontado para a pasta do agente. */
  env: (folderId: string) => EvalEnv;
  /** Gera um candidato. Recebe a temperatura: candidatos idênticos seriam amostra repetida, não busca. */
  generate: (messages: Message[], temperature: number) => string;
  /** Resumo determinístico das falhas reais que motivaram o ciclo (contagem, nunca impressão do modelo). */
  material: (folderId: string) => string;
  now: () => number;
  cycleId: () => string;
};

/** Um ciclo por agente: a trava É o ponteiro. Começar com um em curso é engano, não dois ciclos. */
export function startDream(folderId: string, d: DreamDeps): { started: boolean; cycleId: string | null; reason: string } {
  const io = dreamIO();
  const emCurso = io.active(folderId);
  if (emCurso) return { started: false, cycleId: emCurso, reason: 'this agent already has a cycle running' };

  const gate = namesOf('gate');
  const quality = namesOf('quality');
  // Sem juiz não há ciclo. Isso não é defensividade: um conjunto vazio faria TODO candidato "passar" em
  // nada, e o placar ficaria verde sobre coisa nenhuma.
  if (gate.length === 0 || quality.length === 0) return { started: false, cycleId: null, reason: 'the judge set is empty in this build — nothing to measure against' };

  const base = d.spec(folderId);
  const material = d.material(folderId);
  // D5: CICLO SEM MATERIAL NÃO RODA, e diz por quê. Sonho sem falha real é o modelo inventando o
  // problema, a solução e a nota — o modo de falha que a decisão recusa. A P25 mediu zero falhas
  // agrupáveis no trace, então esta recusa é o estado honesto até haver uso real.
  if (!material) return { started: false, cycleId: null, reason: 'no real failures to dream about: the cluster count has nothing above the threshold yet' };
  const candidatos = CANDIDATE_TEMPERATURES.map((t) => cleanCandidate(d.generate(candidateMessages(base.system, material), t))).filter((c) => c.length > 0);
  if (candidatos.length === 0) return { started: false, cycleId: null, reason: 'no candidate was generated' };

  const cycleId = d.cycleId();
  const plan = planCycle({ cycleId, candidates: candidatos, gate, quality, k: 17, incumbent: base.system });
  io.save(newCycle({ cycleId, folderId, incumbent: base.system, plan, now: d.now() }));
  io.setActive(folderId, cycleId);
  return { started: true, cycleId, reason: '' };
}

export type TickResult = { cycleId: string | null; steps: number; status: string; error?: string; summary?: string; longestStepMs?: number };

/**
 * Avança o ciclo ativo deste agente em até `DREAM_STEPS_PER_TICK` passos.
 *
 * Grava DEPOIS DE CADA PASSO, não no fim: a execução pode morrer a qualquer momento (6 min de teto), e
 * um passo feito que não foi gravado seria refeito — com 306 passos por ciclo, refazer custa caro e,
 * pior, contamina o placar com repetição.
 */
/**
 * Estimativa CONSERVADORA de um passo (agente + juiz), usada até haver um passo measured neste tique.
 * minimal: ponto de partida declarado, não calibrado — o maior passo measured no tique a substitui se for maior.
 */
export const DREAM_STEP_ESTIMATE_MS = 90_000;

/**
 * Quantos tiques COM passo measured a estimativa lembra. Um passo fora da curva (o modelo lento numa hora ruim)
 * pesa por 5 tiques com sonho e então sai — antes ele valia para sempre, porque a estimativa só crescia.
 */
export const DREAM_STEP_WINDOW = 5;
/**
 * Teto da estimativa: 4 dos 5,5 min que o sonho tem por tique (prazo de 330 s). Sem teto, uma medida acima do
 * prazo impedia qualquer passo de começar — e sem passo não há medida nova, então o sonho parava para sempre.
 * Com 240 s, um tique que chega ao sonho cedo ainda tenta; um passo que realmente não cabe morre no teto do
 * Apps Script, como morreria de qualquer jeito.
 */
export const DREAM_STEP_CAP_MS = 240_000;

/** A janela depois deste tique: entra a maior medida dele (se houve passo), sai a mais velha. */
export const nextStepWindow = (prev: readonly number[], measured?: number): number[] =>
  measured && measured > 0 ? [...prev, measured].slice(-DREAM_STEP_WINDOW) : [...prev];

/** A estimativa do próximo tique: o maior passo da janela, nunca abaixo da conservadora nem acima do teto. */
export const stepEstimate = (window: readonly number[]): number =>
  Math.min(DREAM_STEP_CAP_MS, Math.max(DREAM_STEP_ESTIMATE_MS, ...window.filter((n) => Number.isFinite(n) && n > 0)));

/** A janela gravada nas Properties; valor podre vale janela vazia (a estimativa volta à conservadora). */
export function parseStepWindow(raw: string | null | undefined): number[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0).slice(-DREAM_STEP_WINDOW) : [];
  } catch {
    return [];
  }
}

export function tickDream(folderId: string, d: DreamDeps, deadline = Infinity, estimateMs = DREAM_STEP_ESTIMATE_MS): TickResult {
  const io = dreamIO();
  const cycleId = io.active(folderId);
  if (!cycleId) return { cycleId: null, steps: 0, status: 'idle' };

  let s = io.load(folderId, cycleId);
  if (!s) {
    // Ponteiro sem estado: o arquivo sumiu ou não pôde ser lido. Soltar a trava é o certo — deixá-la
    // presa faria o agente nunca mais sonhar, e em silêncio.
    io.setActive(folderId, null);
    return { cycleId, steps: 0, status: 'failed', error: 'the cycle state could not be read; the lock was released' };
  }

  const env = d.env(folderId);
  const base = d.spec(folderId);
  let stepsDone = 0;
  let longestStep = Math.max(DREAM_STEP_ESTIMATE_MS, estimateMs); // a medida de tiques anteriores (revisão F9)
  let measured = 0;
  for (let i = 0; i < DREAM_STEPS_PER_TICK; i++) {
    // Passo que não cabe até o prazo nem começa: morto pelo teto de 6 min, seria pago e perdido.
    const t0 = d.now();
    if (t0 + longestStep > deadline) break;
    const step = nextStep(s.plan, new Set(s.done), s.tally);
    if (!step) break;
    const md = scenarioMd(step.scenario);
    if (md === null) {
      s = failCycle(s, `scenario "${step.scenario}" is not in this build`, d.now());
      io.save(s);
      io.setActive(folderId, null);
      return { cycleId, steps: stepsDone, status: s.status, error: s.error };
    }
    try {
      const r = runDreamStep(md, candidateSystem(s, step), base, env, step);
      s = afterStep(s, step, r.passed, d.now());
      io.save(s); // depois de CADA passo
      stepsDone++;
      measured = Math.max(measured, d.now() - t0);
      longestStep = Math.max(longestStep, measured);
    } catch (err) {
      s = failCycle(s, `step ${stepKey(step)} threw: ${String((err as Error)?.message ?? err)}`, d.now());
      io.save(s);
      io.setActive(folderId, null);
      return { cycleId, steps: stepsDone, status: s.status, error: s.error };
    }
  }

  // O ciclo acabou: a trava sai, o estado fica para o dono ler. O resumo vai junto no retorno, para
  // quem chamou não precisar reabrir o arquivo só para saber no que deu.
  if (s.status === 'done') io.setActive(folderId, null);
  return { cycleId, steps: stepsDone, status: s.status, ...(measured ? { longestStepMs: measured } : {}), ...(s.status === 'done' ? { summary: summarize(s) } : {}) };
}

/** O prompt do candidato daquele passo. O titular é o próprio `incumbent` guardado no estado. */
const candidateSystem = (s: DreamState, step: DreamStep): string => (step.candidate === s.incumbent ? s.incumbent : step.candidate);

/** Uma linha por candidato, com o veredito que DECLARA o próprio alcance. */
function summarize(s: DreamState): string {
  return s.plan.candidates
    .map((c) => {
      const v = dreamVerdict(c, s.incumbent, s.tally, namesOf('quality'), s.plan.k);
      return `${v.reason} (${v.sees})`;
    })
    .join(' · ');
}

/** Arrendamento do tique de sonho nas Script Properties: o valor é até quando ele vale (ms). */
export const DREAM_LEASE_KEY = 'DREAMTICK_LEASE';

/**
 * Um tique de sonho por vez. Gatilhos de 1 min se sobrepõem quando um tique passa de 60 s, e dois tiques
 * no mesmo ciclo pagariam o mesmo passo duas vezes — e o último `save` apagaria o passo do outro.
 *
 * O ScriptLock é GLOBAL (o mesmo da aprovação, ver `observe.ts`): segurá-lo durante minutos de passos
 * travaria o "Aprovar" do dono. Então ele guarda só a TROCA do arrendamento, sem espera (`tryLock(0)`), e
 * o arrendamento vale até `until` — o teto da execução —, de modo que uma execução morta não o deixa preso.
 * Devolve `false` quando pulou.
 */
export function withDreamLease(now: number, until: number, f: () => void): boolean {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return false;
  try {
    if (Number(props.getProperty(DREAM_LEASE_KEY)) > now) return false;
    props.setProperty(DREAM_LEASE_KEY, String(until));
  } finally {
    lock.releaseLock();
  }
  try {
    f();
  } finally {
    props.deleteProperty(DREAM_LEASE_KEY);
  }
  return true;
}

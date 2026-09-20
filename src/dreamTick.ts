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
  const candidatos = CANDIDATE_TEMPERATURES.map((t) => cleanCandidate(d.generate(candidateMessages(base.system, material), t))).filter((c) => c.length > 0);
  if (candidatos.length === 0) return { started: false, cycleId: null, reason: 'no candidate was generated' };

  const cycleId = d.cycleId();
  const plan = planCycle({ cycleId, candidates: candidatos, gate, quality, k: 17 });
  io.save(newCycle({ cycleId, folderId, incumbent: base.system, plan, now: d.now() }));
  io.setActive(folderId, cycleId);
  return { started: true, cycleId, reason: '' };
}

export type TickResult = { cycleId: string | null; steps: number; status: string; error?: string; summary?: string };

/**
 * Avança o ciclo ativo deste agente em até `DREAM_STEPS_PER_TICK` passos.
 *
 * Grava DEPOIS DE CADA PASSO, não no fim: a execução pode morrer a qualquer momento (6 min de teto), e
 * um passo feito que não foi gravado seria refeito — com 306 passos por ciclo, refazer custa caro e,
 * pior, contamina o placar com repetição.
 */
export function tickDream(folderId: string, d: DreamDeps): TickResult {
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
  let feitos = 0;
  for (let i = 0; i < DREAM_STEPS_PER_TICK; i++) {
    const step = nextStep(s.plan, new Set(s.done), s.tally);
    if (!step) break;
    const md = scenarioMd(step.scenario);
    if (md === null) {
      s = failCycle(s, `scenario "${step.scenario}" is not in this build`, d.now());
      io.save(s);
      io.setActive(folderId, null);
      return { cycleId, steps: feitos, status: s.status, error: s.error };
    }
    try {
      const r = runDreamStep(md, candidateSystem(s, step), base, env, step);
      s = afterStep(s, step, r.passed, d.now());
      io.save(s); // depois de CADA passo
      feitos++;
    } catch (err) {
      s = failCycle(s, `step ${stepKey(step)} threw: ${String((err as Error)?.message ?? err)}`, d.now());
      io.save(s);
      io.setActive(folderId, null);
      return { cycleId, steps: feitos, status: s.status, error: s.error };
    }
  }

  // O ciclo acabou: a trava sai, o estado fica para o dono ler. O resumo vai junto no retorno, para
  // quem chamou não precisar reabrir o arquivo só para saber no que deu.
  if (s.status === 'done') io.setActive(folderId, null);
  return { cycleId, steps: feitos, status: s.status, ...(s.status === 'done' ? { summary: summarize(s) } : {}) };
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

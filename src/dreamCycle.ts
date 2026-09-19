// O ciclo de sonho como PLANO DE PASSOS. NÚCLEO PURO — sem Drive, sem Properties, sem relógio,
// sem chamada de modelo. Quem executa é a casca; aqui só se decide o que fazer a seguir.
//
// A forma vem de três coisas medidas, não de preferência:
//
// 1. **k = 17 por cenário de qualidade.** A P23 mediu que a variância é da AMOSTRAGEM DO AGENTE:
//    com a resposta congelada o juiz deu desvio 0,00 em 6 leituras, e com o modelo fixo o agente
//    oscilou 0, 4, 4, 0. Uma execução por cenário não mede nada.
//
// 2. **O portão vem antes da qualidade, e isso é custo.** Um candidato que morre no portão custa
//    2 execuções em vez de 2 + 6×17 = 104. Ordenar o plano é a otimização mais barata que existe
//    aqui, e ela cai de graça ao separar as duas naturezas.
//
// 3. **O ciclo não monopoliza o pump.** `PUMP_MAX_STEPS` é 20 por tique (`main.ts:424`), e um ciclo
//    tem ~312 passos. Se o sonho usasse as 20 voltas, o trabalho normal do dono esperaria 16
//    minutos. Ele usa uma FATIA, e o resto do pump continua atendendo.

import { beatsIncumbent, kSees } from './dream';

export type StepKind = 'gate' | 'quality';
export type DreamStep = { kind: StepKind; candidate: string; scenario: string; rep: number };

export type DreamPlan = { cycleId: string; candidates: string[]; k: number; steps: DreamStep[] };

/**
 * Fatia do pump que o sonho pode usar por tique. `PUMP_MAX_STEPS` é 20; cinco deixa três quartos
 * das voltas para o trabalho que o dono pediu. Um ciclo de 312 passos leva ~63 tiques (~1 h), e
 * essa lentidão é deliberada: o sonho não tem pressa, o dono tem.
 */
export const DREAM_STEPS_PER_TICK = 5;

/** Chave única do passo. É ela que torna o checkpoint seguro: passo feito nunca repete. */
export const stepKey = (s: DreamStep): string => `${s.kind}:${s.candidate}:${s.scenario}:${s.rep}`;

export type PlanInput = { cycleId: string; candidates: string[]; gate: string[]; quality: string[]; k: number };

/**
 * Monta o plano inteiro, na ordem em que será executado: **todo o portão primeiro**, depois a
 * qualidade. O `holdout` não entra — ele não participa da seleção, e deixá-lo de fora aqui é o que
 * impede alguém de usá-lo por engano.
 */
export function planCycle(i: PlanInput): DreamPlan {
  const k = Math.max(1, Math.trunc(i.k) || 1);
  const steps: DreamStep[] = [];
  for (const candidate of i.candidates) for (const scenario of i.gate) steps.push({ kind: 'gate', candidate, scenario, rep: 0 });
  for (const candidate of i.candidates) for (const scenario of i.quality) for (let rep = 0; rep < k; rep++) steps.push({ kind: 'quality', candidate, scenario, rep });
  return { cycleId: i.cycleId, candidates: [...i.candidates], k, steps };
}

export type Tally = Record<string, { passes: number; runs: number }>;

const tallyKey = (kind: StepKind, candidate: string, scenario: string) => `${kind}:${candidate}:${scenario}`;

/** Soma um resultado. Imutável: o chamador guarda o que voltou, e o checkpoint grava isso. */
export function recordResult(t: Tally, s: DreamStep, passed: boolean): Tally {
  const key = tallyKey(s.kind, s.candidate, s.scenario);
  const cur = t[key] ?? { passes: 0, runs: 0 };
  return { ...t, [key]: { passes: cur.passes + (passed ? 1 : 0), runs: cur.runs + 1 } };
}

/**
 * Quem morreu no portão. **Uma** falha basta, e não há estatística: o portão é determinístico
 * (a injeção parou no card? a tool proibida foi recusada?) e somar as duas réguas destruiria a
 * propriedade boa de cada uma.
 */
export function eliminated(t: Tally): string[] {
  const out = new Set<string>();
  for (const [key, v] of Object.entries(t)) {
    const [kind, candidate] = key.split(':');
    if (kind === 'gate' && v.runs > 0 && v.passes < v.runs) out.add(candidate);
  }
  return [...out];
}

/** O próximo passo ainda não feito, pulando quem já morreu no portão. `null` = ciclo terminou. */
export function nextStep(p: DreamPlan, done: ReadonlySet<string>, t: Tally): DreamStep | null {
  const mortos = new Set(eliminated(t));
  for (const s of p.steps) {
    if (done.has(stepKey(s))) continue;
    if (mortos.has(s.candidate)) continue; // não se gasta execução em candidato já eliminado
    return s;
  }
  return null;
}

export type Cost = { steps: number; ticks: number };

/** O custo declarado ANTES de rodar. Um ciclo que não diz o que vai custar não pode ser aprovado. */
export const cycleCost = (p: DreamPlan): Cost => ({ steps: p.steps.length, ticks: Math.ceil(p.steps.length / DREAM_STEPS_PER_TICK) });

export type Verdict = { wins: boolean; reason: string; sees: string; candidatePasses: number; incumbentPasses: number };

/**
 * O candidato vence o titular? Três portas, nesta ordem:
 *   1. morreu no portão ⇒ não, sem olhar taxa;
 *   2. não rodou o suficiente ⇒ não afirma;
 *   3. vantagem ESTATÍSTICA pelo teste de proporções (`dream.ts`), nunca aritmética.
 *
 * O veredito carrega `sees`: o tamanho de efeito que este k consegue enxergar. **Um critério que
 * não declara o próprio alcance engana o dono** — ele leria "não venceu" como "não melhorou",
 * quando pode ser "melhorou menos do que este k enxerga".
 */
export function dreamVerdict(candidate: string, incumbent: string, t: Tally, qualityScenarios: readonly string[], k: number): Verdict {
  const sees = kSees(k);
  if (eliminated(t).includes(candidate)) return { wins: false, reason: 'failed a gate scenario: eliminated without statistics', sees, candidatePasses: 0, incumbentPasses: 0 };
  const soma = (who: string) =>
    qualityScenarios.reduce(
      (acc, sc) => {
        const v = t[tallyKey('quality', who, sc)] ?? { passes: 0, runs: 0 };
        return { passes: acc.passes + v.passes, runs: acc.runs + v.runs };
      },
      { passes: 0, runs: 0 },
    );
  const c = soma(candidate);
  const i = soma(incumbent);
  const esperado = qualityScenarios.length * k;
  if (c.runs < esperado || i.runs < esperado) return { wins: false, reason: `not enough runs yet (${c.runs}/${esperado} and ${i.runs}/${esperado})`, sees, candidatePasses: c.passes, incumbentPasses: i.passes };
  const wins = beatsIncumbent(c.passes, i.passes, esperado);
  return {
    wins,
    reason: wins ? `beats the incumbent with statistical significance (${c.passes}/${esperado} vs ${i.passes}/${esperado})` : `no statistically significant advantage (${c.passes}/${esperado} vs ${i.passes}/${esperado})`,
    sees,
    candidatePasses: c.passes,
    incumbentPasses: i.passes,
  };
}

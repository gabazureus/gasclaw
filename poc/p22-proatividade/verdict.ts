// POC P22 (custo da proatividade), veredito puro: decide a partir de cronômetros gravados DENTRO
// do gatilho. Mesma régua da P3 (ADR-027 §3): a API de processos chega atrasada demais para deltas
// curtos, então só valem os cronômetros internos.
//
// A pergunta: avaliar a agenda a cada tique e acordar o agente periodicamente cabe nas 6 h/dia de
// runtime de gatilho do Workspace, DEPOIS de somar os 8,47% que a P3 já mediu?

/** Cota oficial de runtime de gatilho do Google Workspace: 6 h/dia. */
export const P22_QUOTA_MS_PER_DAY = 21_600_000;
/** Custo fixo já medido e aceito pela P3 no dev v60. Esta POC mede o ACRÉSCIMO sobre ele. */
export const P22_BASELINE_PCT = 8.47;
/** Tetos, iguais aos da P3 para o ciclo curto. */
export const P22_IDLE_MAX_MS = 1_000;
export const P22_AGENDA_MAX_MS = 1_000;
/** Teto do custo fixo TOTAL (baseline da P3 + acréscimo desta POC). */
export const P22_FIXED_BUDGET_PCT = 20;
export const TICKS_PER_DAY = 1_440;

export type P22Input = {
  /** Tique com agenda vazia: a linha de base desta POC. */
  idle?: { ms: number };
  /** Tique avaliando `jobs` compromissos, nenhum vencido: o acréscimo que a agenda cobra sempre. */
  agenda?: { ms: number; jobs: number; due: number };
  /**
   * Um despertar sintético completo, do vencimento ao run terminal.
   * `ms` usa passo SINTÉTICO: não há chamada ao modelo, então é o **piso** do custo, não o esperado.
   * `realTurnMs` é um turno real observado; quando informado, é ele que entra na projeção, porque a
   * pergunta de produto é "cabe na cota?", e quem domina esse custo é o trabalho real do run (ADR-027).
   */
  wake?: { ms: number; completed: boolean; wakesPerDay: number; realTurnMs?: number };
  /** Quantos gatilhos o projeto tem depois da POC. Tem de continuar sendo um (ADR-027). */
  triggers?: { count: number };
};

/** Custo fixo diário: todo tique paga a avaliação da agenda; cada despertar paga o run. */
export const projectedFixedMs = (agendaMs: number, wakeMs: number, wakesPerDay: number): number =>
  agendaMs * TICKS_PER_DAY + wakeMs * wakesPerDay;

/** Quantos agentes cabem antes de o custo fixo total estourar o teto. Zero = nem um cabe. */
export const agentsThatFit = (agendaMs: number, wakeMs: number, wakesPerDay: number): number => {
  const budget = (P22_QUOTA_MS_PER_DAY * (P22_FIXED_BUDGET_PCT - P22_BASELINE_PCT)) / 100;
  const perAgent = wakeMs * wakesPerDay;
  const shared = agendaMs * TICKS_PER_DAY; // a avaliação da agenda é um custo do tique, não do agente
  if (perAgent <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((budget - shared) / perAgent));
};

export type P22Check = { id: 'C1' | 'C2' | 'C3' | 'C4'; pass: boolean; detail: string };
export type P22Result = { poc: 'P22'; pass: boolean; aborted: boolean; checks: P22Check[] };

const ms = (n: number) => `${Math.round(n)} ms`;
const pct = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;

export function p22Verdict(input: P22Input): P22Result {
  const checks: P22Check[] = [];

  if (input.idle) {
    checks.push({
      id: 'C1',
      pass: input.idle.ms < P22_IDLE_MAX_MS,
      detail: `tique com agenda vazia: ${ms(input.idle.ms)}; teto ${ms(P22_IDLE_MAX_MS)}`,
    });
  }

  if (input.agenda) {
    const { ms: got, jobs, due } = input.agenda;
    checks.push({
      id: 'C2',
      pass: due === 0 && jobs > 0 && got < P22_AGENDA_MAX_MS,
      detail:
        due !== 0
          ? `a medição foi contaminada: ${due} compromisso(s) venceram durante o tique`
          : jobs <= 0
            ? 'a agenda sintética não foi carregada: nada foi avaliado'
            : `tique avaliando ${jobs} compromisso(s), nenhum vencido: ${ms(got)}; teto ${ms(P22_AGENDA_MAX_MS)}`,
    });
  }

  if (input.agenda && input.wake) {
    const { wakesPerDay, realTurnMs } = input.wake;
    // Projetar com o passo sintético responderia a pergunta errada: mede o overhead da proatividade,
    // não o custo de acordar. Havendo turno real observado, é ele que manda.
    const perWake = realTurnMs !== undefined ? realTurnMs : input.wake.ms;
    const fonte = realTurnMs !== undefined ? `turno real de ${ms(realTurnMs)}` : `passo SINTÉTICO de ${ms(input.wake.ms)} (piso, sem chamada ao modelo)`;
    const projected = projectedFixedMs(input.agenda.ms, perWake, wakesPerDay);
    const total = P22_BASELINE_PCT + (projected / P22_QUOTA_MS_PER_DAY) * 100;
    const fit = agentsThatFit(input.agenda.ms, perWake, wakesPerDay);
    checks.push({
      id: 'C3',
      pass: input.wake.completed && realTurnMs !== undefined && total <= P22_FIXED_BUDGET_PCT,
      detail: !input.wake.completed
        ? 'o despertar sintético não completou; sem run terminal não há custo confiável para projetar'
        : realTurnMs === undefined
          ? `projeção recusada: só há o ${fonte}. Um piso não decide se cabe na cota — informe um turno real observado`
          : `base: ${fonte}. Acréscimo ${ms(projected)}/dia (${pct((projected / P22_QUOTA_MS_PER_DAY) * 100)}) + ${pct(P22_BASELINE_PCT)} já medidos na P3 = ${pct(total)} da cota; teto ${P22_FIXED_BUDGET_PCT}%. Cabem ${fit} agente(s) com ${wakesPerDay} despertar(es)/dia`,
    });
  }

  if (input.triggers) {
    checks.push({
      id: 'C4',
      pass: input.triggers.count === 1,
      detail: `gatilhos do projeto: ${input.triggers.count}; a ADR-027 exige exatamente 1 (e os 20 por script são finitos)`,
    });
  }

  const complete = checks.length === 4;
  return { poc: 'P22', pass: complete && checks.every((c) => c.pass), aborted: false, checks };
}

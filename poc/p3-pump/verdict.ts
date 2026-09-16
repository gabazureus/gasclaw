// POC P3 (pump barato), veredito puro: decide a partir de números já medidos, sem tocar em API nenhuma.
// A coleta (enfileirar, drenar, ler processos) entra depois, quando a ação `step` e o núcleo durável existirem.

/** Leitura de processos do dia: o que a P3 compara antes e depois. */
export type ProcessReading = { triggerMsToday: number; count: number };

/** Passo zero: 1 step enfileirado, 1 pump drenando. Se o TRABALHO aparecer como gatilho, o desenho cai. */
export type StepZero = { before: ProcessReading; after: ProcessReading; workType: 'WEBAPP' | 'TIME_DRIVEN' | 'DESCONHECIDO' };

export type P3Input = {
  stepZero: StepZero;
  /** Depois dos 50 steps: leitura antes e depois, e quantos despertares do pump aconteceram no intervalo. */
  bulk?: { before: ProcessReading; after: ProcessReading; steps: number; pumps: number };
  /** Pump com fila vazia, em dois momentos: normal e logo depois de um lote grande do trace (pior caso). */
  idleMs?: { normal: number; afterBatch: number };
  /** Projeção do dia contra a cota da conta (o painel de limites já sabe qual é). */
  quota?: { projectedMsPerDay: number; limitMsPerDay: number };
};

export const P3_PUMP_WAKE_MAX_MS = 2000; // um despertar não pode custar mais que isto
export const P3_IDLE_MAX_MS = 1000; // C3: pump com fila vazia sai em menos de 1 s, mesmo no pior caso

export type P3Check = { id: 'C1' | 'C2' | 'C3' | 'C4'; pass: boolean; detail: string };
export type P3Result = { poc: 'P3'; pass: boolean; aborted: boolean; checks: P3Check[] };

const ms = (n: number) => `${Math.round(n)} ms`;

/**
 * C2 primeiro e sozinho: se o trabalho rodou como TIME_DRIVEN, a P3 para aí (o pump barato não existe)
 * e não gasta os 50 steps para descobrir a mesma coisa 50 vezes.
 */
export function p3Verdict(input: P3Input): P3Result {
  const { stepZero } = input;
  const zeroDelta = stepZero.after.triggerMsToday - stepZero.before.triggerMsToday;
  const c2: P3Check = {
    id: 'C2',
    pass: stepZero.workType === 'WEBAPP' && zeroDelta <= P3_PUMP_WAKE_MAX_MS,
    detail:
      stepZero.workType === 'TIME_DRIVEN'
        ? 'o trabalho rodou como execução de gatilho: o pump barato não existe neste desenho'
        : stepZero.workType === 'DESCONHECIDO'
          ? 'não deu para identificar o tipo da execução do trabalho'
          : `trabalho em execução comum; o gatilho cresceu ${ms(zeroDelta)} no passo zero`,
  };
  if (!c2.pass) return { poc: 'P3', pass: false, aborted: true, checks: [c2] };

  const checks: P3Check[] = [c2];

  if (input.bulk) {
    const { before, after, steps, pumps } = input.bulk;
    const grew = after.triggerMsToday - before.triggerMsToday;
    const teto = Math.max(1, pumps) * P3_PUMP_WAKE_MAX_MS;
    checks.push({
      id: 'C1',
      pass: grew <= teto,
      detail: `${steps} steps fizeram o gatilho crescer ${ms(grew)}; teto de ${pumps} despertares = ${ms(teto)}`,
    });
  }

  if (input.idleMs) {
    const pior = Math.max(input.idleMs.normal, input.idleMs.afterBatch);
    checks.push({
      id: 'C3',
      pass: pior < P3_IDLE_MAX_MS,
      detail: `pump vazio: ${ms(input.idleMs.normal)} normal, ${ms(input.idleMs.afterBatch)} logo após lote grande (pior caso vale)`,
    });
  }

  if (input.quota) {
    const { projectedMsPerDay, limitMsPerDay } = input.quota;
    const pct = limitMsPerDay > 0 ? Math.round((projectedMsPerDay / limitMsPerDay) * 100) : 100;
    checks.push({ id: 'C4', pass: limitMsPerDay > 0 && projectedMsPerDay <= limitMsPerDay, detail: `projeção de ${ms(projectedMsPerDay)}/dia = ${pct}% da cota da conta` });
  }

  const completo = checks.length === 4;
  return { poc: 'P3', pass: completo && checks.every((c) => c.pass), aborted: false, checks };
}

// POC P3 (worker durável), veredito puro: decide a partir de cronômetros gravados dentro do gatilho.

export type P3Input = {
  /** Um run sintético enfileirado e processado diretamente pelo gatilho. */
  worker?: { ms: number; completed: boolean };
  /** Um ciclo só de observabilidade, sem itens na fila do trace. */
  idle?: { ms: number; drained: number; queued: number };
  /** Custo fixo: 1.440 ciclos ociosos + 200 passos sintéticos por dia. */
  quota?: { projectedMsPerDay: number; limitMsPerDay: number };
};

export const P3_WORKER_MAX_MS = 10_000;
export const P3_IDLE_MAX_MS = 1_000;
export const P3_FIXED_BUDGET_PCT = 20;
export const P3_STEPS_PER_DAY = 200;
export const projectedFixedMs = (workerMs: number, idleMs: number): number => idleMs * 1_440 + workerMs * P3_STEPS_PER_DAY;
export const isWorkspaceOwner = (email: string): boolean => !/@(?:gmail|googlemail)\.com$/i.test(email);

export type P3Check = { id: 'C1' | 'C2' | 'C3' | 'C4'; pass: boolean; detail: string };
export type P3Result = { poc: 'P3'; pass: boolean; aborted: boolean; checks: P3Check[] };

const ms = (n: number) => `${Math.round(n)} ms`;

export function p3Verdict(input: P3Input): P3Result {
  const checks: P3Check[] = [];

  if (input.worker) {
    checks.push({ id: 'C1', pass: input.worker.completed, detail: input.worker.completed ? 'o gatilho concluiu o run sintético correto' : 'o run sintético correto não terminou com sucesso' });
    checks.push({ id: 'C2', pass: input.worker.ms <= P3_WORKER_MAX_MS, detail: `overhead do worker sintético: ${ms(input.worker.ms)}; teto ${ms(P3_WORKER_MAX_MS)}` });
  }

  if (input.idle) {
    checks.push({
      id: 'C3',
      pass: input.idle.drained === 0 && input.idle.queued === 0 && input.idle.ms < P3_IDLE_MAX_MS,
      detail: `ciclo ocioso: ${ms(input.idle.ms)}, ${input.idle.drained} trace(s), ${input.idle.queued} run(s); teto ${ms(P3_IDLE_MAX_MS)}`,
    });
  }

  if (input.quota) {
    const { projectedMsPerDay, limitMsPerDay } = input.quota;
    const pct = limitMsPerDay > 0 ? (projectedMsPerDay / limitMsPerDay) * 100 : 100;
    checks.push({
      id: 'C4',
      pass: limitMsPerDay > 0 && pct <= P3_FIXED_BUDGET_PCT,
      detail: `custo fixo projetado: ${ms(projectedMsPerDay)}/dia = ${Math.round(pct)}% da cota; teto ${P3_FIXED_BUDGET_PCT}%`,
    });
  }

  const complete = checks.length === 4;
  return { poc: 'P3', pass: complete && checks.every((c) => c.pass), aborted: false, checks };
}

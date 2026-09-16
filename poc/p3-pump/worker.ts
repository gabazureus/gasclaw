import type { DurableRun } from '../../src/run';
import { pump, type StepDeps, type StepOutcome } from '../../src/runner';

type Pointer = { runId: string; session: string };

export function syntheticTurn(r: DurableRun): StepOutcome {
  return { turn: { text: 'ok', history: [], events: [], done: { ...r.done }, granted: r.granted }, usd: 0 };
}

/** A sonda só pode concluir o run P3 pedido; nunca avança o restante da fila compartilhada. */
export function runP3SyntheticWorker(requested: string, pointers: Pointer[], deps: StepDeps, deadlineMs: number): DurableRun[] {
  const first = pointers[0];
  if (!requested || first?.runId !== requested || !first.session.endsWith(':poc/p3')) return [];
  const targeted: StepDeps = { ...deps, io: { ...deps.io, claimNext: (now) => deps.io.claimById(requested, now) } };
  return pump(targeted, 1, deadlineMs);
}

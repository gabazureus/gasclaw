import type { DurableRun } from '../../src/run';
import type { StepOutcome } from '../../src/runner';

const effectKey = (runId: string) => `${runId}:0:p4-effect`;

/** Três passos previsíveis; o primeiro simula um efeito e os dois primeiros deixam checkpoint. */
export function p4SyntheticTurn(r: DurableRun, effect: () => void): StepOutcome {
  const done = { ...r.done };
  const key = effectKey(r.runId);
  if (done[key] === undefined) {
    effect();
    done[key] = 'ok';
  }
  const step = r.snapshot?.step ?? 0;
  const base = { history: [], events: [], done, granted: r.granted };
  return step < 2
    ? { turn: { ...base, text: 'checkpoint', stopped: 'steps', state: { messages: [], step: step + 1, queue: [] } }, usd: 0 }
    : { turn: { ...base, text: 'p4-ok' }, usd: 0 };
}

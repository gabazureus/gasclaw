import type { RunStatus } from '../../src/run';

export type P4Execution = { executionId: string; runId: string; status: RunStatus; snapshotStep?: number; answer?: string };
export type P4Input = { runId: string; executions: P4Execution[]; effectCount: number; doneKeys: string[] };
export type P4Check = { id: 'C1' | 'C2' | 'C3'; pass: boolean; detail: string };
export type P4Result = { poc: 'P4'; pass: boolean; checks: P4Check[] };

export function p4Verdict(input: P4Input): P4Result {
  const executionIds = new Set(input.executions.map((e) => e.executionId));
  const checkpoints = input.executions.slice(0, 3).map((e) => e.snapshotStep);
  const sameRun = input.executions.length === 3
    && executionIds.size === input.executions.length
    && input.executions.every((e) => e.runId === input.runId)
    && input.executions[0]?.status === 'queued'
    && input.executions[1]?.status === 'queued'
    && checkpoints[0] === 1
    && checkpoints[1] === 2
    && checkpoints[2] === undefined;
  const final = input.executions[2];
  const completed = final?.status === 'done' && final.answer === 'p4-ok';
  const effectKey = `${input.runId}:0:p4-effect`;
  const effectOnce = input.effectCount === 1 && input.doneKeys.length === 1 && input.doneKeys[0] === effectKey;
  const checks: P4Check[] = [
    { id: 'C1', pass: sameRun, detail: `${input.executions.length} execuções; runId ${sameRun ? 'estável' : 'mudou ou faltaram execuções'}` },
    { id: 'C2', pass: completed, detail: completed ? 'resposta final p4-ok' : `desfecho ${final?.status ?? 'ausente'}` },
    { id: 'C3', pass: effectOnce, detail: `${input.effectCount} execução(ões) do efeito; ${input.doneKeys.length} chave(s) duráveis` },
  ];
  return { poc: 'P4', pass: checks.every((c) => c.pass), checks };
}

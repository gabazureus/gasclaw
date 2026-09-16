import type { RunStatus } from '../../src/run';

export type P19Input = {
  effectCount: number;
  inflightName?: string;
  doneKeys: string[];
  resumedStatus: RunStatus;
  stepCalls: number;
  answer?: string;
};
export type P19Check = { id: 'C1' | 'C2' | 'C3'; pass: boolean; detail: string };
export type P19Result = { poc: 'P19'; pass: boolean; checks: P19Check[] };

export function p19Verdict(input: P19Input): P19Result {
  const persisted = input.effectCount === 1 && input.inflightName === 'gmail.send' && input.doneKeys.length === 0;
  const noRepeat = input.effectCount === 1 && input.stepCalls === 0 && input.resumedStatus === 'failed';
  const honest = Boolean(input.answer?.includes('gmail.send') && input.answer.includes('antes de eu confirmar o resultado') && input.answer.includes('Não vou repetir'));
  const checks: P19Check[] = [
    { id: 'C1', pass: persisted, detail: `${input.effectCount} efeito(s); inflight ${input.inflightName ?? 'ausente'}; ${input.doneKeys.length} done key(s)` },
    { id: 'C2', pass: noRepeat, detail: `${input.stepCalls} chamada(s) do passo na retomada; status ${input.resumedStatus}` },
    { id: 'C3', pass: honest, detail: honest ? 'aviso nomeia o efeito, admite resultado incerto e recusa repetição automática' : 'aviso de incerteza ausente' },
  ];
  return { poc: 'P19', pass: checks.every((c) => c.pass), checks };
}

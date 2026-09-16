import type { RunStatus } from '../../src/run';

type Outcome = 'accepted' | 'refreshed' | 'rejected';
export type P20Input = {
  cacheCleared: boolean;
  resumedAfterMs: number;
  chat: { status: RunStatus; third: Outcome; ownerAfterThird: Outcome; double: Outcome; llmCalls: number; effects: number; steps: number };
  expired: { first: Outcome; statusAfterExpiry: RunStatus; samePending: boolean; llmCallsAtExpiry: number; finalStatus: RunStatus; llmCalls: number; effects: number; steps: number };
  sameStore: boolean;
};
export type P20Check = { id: 'C1' | 'C2' | 'C3' | 'C4' | 'C5'; pass: boolean; detail: string };

export function p20Verdict(i: P20Input) {
  const c1 = i.cacheCleared && i.resumedAfterMs > 600_000 && i.chat.status === 'done' && i.chat.llmCalls === 2 && i.chat.steps === 1 && i.chat.effects === 1;
  const c2 = i.chat.third === 'rejected' && i.chat.ownerAfterThird === 'accepted';
  const c3 = i.chat.double === 'rejected' && i.chat.steps === 1 && i.chat.effects === 1;
  const c4 = i.expired.first === 'refreshed' && i.expired.statusAfterExpiry === 'waiting' && i.expired.samePending && i.expired.llmCallsAtExpiry === 1
    && i.expired.finalStatus === 'done' && i.expired.llmCalls === 2 && i.expired.steps === 1 && i.expired.effects === 1;
  const c5 = i.sameStore;
  const checks: P20Check[] = [
    { id: 'C1', pass: c1, detail: `cache removido=${i.cacheCleared}; retomada após ${i.resumedAfterMs} ms; status=${i.chat.status}; LLM=${i.chat.llmCalls}; passos=${i.chat.steps}; efeitos=${i.chat.effects}` },
    { id: 'C2', pass: c2, detail: `terceiro=${i.chat.third}; solicitante depois=${i.chat.ownerAfterThird}` },
    { id: 'C3', pass: c3, detail: `clique duplo=${i.chat.double}; passos=${i.chat.steps}; efeitos=${i.chat.effects}` },
    { id: 'C4', pass: c4, detail: `expirado=${i.expired.first}; estado=${i.expired.statusAfterExpiry}; mesma pendência=${i.expired.samePending}; LLM na expiração=${i.expired.llmCallsAtExpiry}; final=${i.expired.finalStatus}` },
    { id: 'C5', pass: c5, detail: i.sameStore ? 'Chat e tela exercitaram o mesmo RunIO.decide Drive-backed' : 'as superfícies não usaram o mesmo contrato' },
  ];
  return { poc: 'P20' as const, pass: checks.every((c) => c.pass), checks, observed: i };
}

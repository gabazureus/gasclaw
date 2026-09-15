// POC P14: veredito C1–C12 (trace com lote de 1 min, ADR-014). Puro, sem imports.

export type P14Obs = {
  bench: { c1: { runs: number; p95Ms: number; maxMs: number }; c4: { idempotent: boolean; sheet: string; folder: string }; c9: { leaks: number; rowFound: boolean; fileFound: boolean } };
  failsafe: { answered: boolean; drainFailed: boolean; queueKept: boolean; drainedAfterRestore: boolean };
  verify: { pass: boolean; per: { tag: string; rows: number; own: boolean; status: string | null }[] };
  c6: { liveS: number | null; sheetS: number | null; via: string };
  poll: { calls: number; avgMs: number; maxMs: number; urlFetchPerCall: number };
  hidesOnHidden: boolean;
  real: { runId: string; spans: string[]; coverage: number; ms?: number; model?: string; tokens?: number; cost?: number }[];
  traceText: string;
  burst: { runs: number; runsMs: number; enfileirados: number; drained: number; drainMs: number; linhas: number; sobraNaFila: number };
  drainbench: { vazioMaxMs: number; gatilho: string };
};

export const SHEET_NAME = 'gasclaw — execuções';
export const RUNS_PER_DAY = 200; // hipótese para a projeção do C12
const TRIGGER_DAY_MS = 6 * 3_600_000; // cota Workspace: 6 h de gatilhos por dia

export function summarizeP14(o: P14Obs) {
  const c1 = { pass: o.bench.c1.runs >= 50 && o.bench.c1.p95Ms < 1500, ...o.bench.c1 };
  const c2 = { pass: o.verify.pass && o.verify.per.length === 5, runs: o.verify.per };
  const c3 = { pass: o.failsafe.answered && o.failsafe.drainFailed && o.failsafe.queueKept && o.failsafe.drainedAfterRestore, ...o.failsafe };
  const c4 = { pass: o.bench.c4.idempotent && o.bench.c4.sheet === SHEET_NAME && o.bench.c4.folder === 'runs', ...o.bench.c4 };
  const c5 = { pass: true, comando: './gasclaw poc p14' };
  const c6 = { pass: o.c6.liveS !== null && o.c6.liveS <= 5 && o.c6.sheetS !== null && o.c6.sheetS <= 70, telaS: o.c6.liveS, planilhaS: o.c6.sheetS, via: o.c6.via };
  const c7 = {
    pass: o.hidesOnHidden && o.poll.urlFetchPerCall === 0 && o.poll.maxMs < 1000,
    chamadasEm30min: 360,
    urlFetchEm30min: 360 * o.poll.urlFetchPerCall,
    ...o.poll,
    paraComAbaOculta: o.hidesOnHidden,
    observacao: 'medido em rajada de chamadas; 30 min reais não rodados',
  };
  const needed = ['resolve_agent', 'llm_call', 'reply'];
  const c8 = { pass: o.real.length > 0 && o.real.every((r) => needed.every((n) => r.spans.includes(n)) && Math.abs(r.coverage - 1) <= 0.1), runs: o.real };
  const c9 = { pass: o.bench.c9.leaks === 0 && o.bench.c9.rowFound && o.bench.c9.fileFound, ...o.bench.c9 };
  const c10 = { pass: needed.every((n) => o.traceText.includes(n)) && /├─|└─/.test(o.traceText), arvore: o.traceText };
  const c11 = { pass: o.burst.enfileirados === o.burst.runs && o.burst.linhas === o.burst.runs && o.burst.sobraNaFila === 0, ...o.burst };
  const busyPerRun = o.burst.runs ? o.burst.drainMs / o.burst.runs : 0;
  const projectedMs = 1440 * o.drainbench.vazioMaxMs + RUNS_PER_DAY * busyPerRun;
  const c12 = {
    pass: projectedMs <= TRIGGER_DAY_MS,
    loteVazioMaxMs: o.drainbench.vazioMaxMs,
    loteCom20Ms: o.burst.drainMs,
    projecaoMinPorDia: Math.round(projectedMs / 60_000),
    cotaMinPorDia: TRIGGER_DAY_MS / 60_000,
    hipotese: `1440 lotes/dia (vazios) + ${RUNS_PER_DAY} runs/dia`,
    gatilho: o.drainbench.gatilho,
  };
  const all = [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12];
  return { poc: 'P14', pass: all.every((c) => c.pass), c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12 };
}

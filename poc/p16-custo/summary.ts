// POC P16: veredito C1–C7 (ADR-018). Puro, sem imports.

export type P16Obs = {
  check: { measured: number; informed: number | null; diffPct: number | null; error: string | null };
  speed: { maxMs: number };
  sum: { utc: { igual: boolean }; sp: { igual: boolean } };
  setmodel: { picked: string; runModel: string; seconds: number; usouOEscolhido: boolean };
  refuse: { semTools: { id: string | null; erro: string | null }; comTools: { id: string | null; erro: string | null } };
  prune: { horasAntigas: number; diasAntigos: number; dobrouEmDia: boolean; sumiu91d: boolean };
  keycalls: { antes: number; depois: number };
  /** C1 controlado: usage_daily antes e depois (estabilizado) de N turnos feitos pelo gasclaw, e a soma do custo desses turnos no trace. */
  c1ctrl: { n: number; feitos: number; before: number; after: number; traceSum: number; polls: number; stableS: number };
};

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function summarizeP16(o: P16Obs) {
  // Método do C1 mudou (ADR-018): o usage_daily do dia inteiro inclui chamadas de antes do trace existir e outros usos
  // da mesma chave. Agora compara só o delta de um conjunto controlado de N chamadas com o custo que o trace registrou delas.
  const delta = r6(o.c1ctrl.after - o.c1ctrl.before);
  const diffPct = delta > 0 ? Math.round(((o.c1ctrl.traceSum - delta) / delta) * 1000) / 10 : null;
  const c1 = {
    pass: diffPct !== null && Math.abs(diffPct) <= 2 && o.c1ctrl.feitos === o.c1ctrl.n,
    chamadas: `${o.c1ctrl.feitos}/${o.c1ctrl.n}`,
    deltaOpenRouter: delta,
    somaTrace: o.c1ctrl.traceSum,
    diferencaPct: diffPct,
    leiturasDoKey: o.c1ctrl.polls,
    estabilizouEmS: o.c1ctrl.stableS,
    diaInteiro: { medido: o.check.measured, openrouter: o.check.informed, diferencaPct: o.check.diffPct, nota: 'informativo: inclui chamadas de antes do trace e outros usos da chave' },
  };
  const c2 = { pass: o.speed.maxMs < 1000, maxMs: o.speed.maxMs };
  const c3 = { pass: o.sum.utc.igual && o.sum.sp.igual, ...o.sum };
  const c4 = { pass: o.setmodel.usouOEscolhido && o.setmodel.seconds <= 30, ...o.setmodel };
  const c5 = { pass: o.refuse.semTools.id !== null && !!o.refuse.semTools.erro && o.refuse.comTools.erro === null, ...o.refuse };
  const c6 = { pass: o.prune.horasAntigas === 0 && o.prune.diasAntigos === 0 && o.prune.dobrouEmDia && o.prune.sumiu91d, ...o.prune };
  const c7 = { pass: o.keycalls.depois <= 3, chamadasReaisEm30min: o.keycalls.depois };
  const all = [c1, c2, c3, c4, c5, c6, c7];
  return { poc: 'P16', pass: all.every((c) => c.pass), c1, c2, c3, c4, c5, c6, c7 };
}

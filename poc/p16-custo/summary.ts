// POC P16: veredito C1–C7 (ADR-018). Puro, sem imports.

export type P16Obs = {
  check: { measured: number; informed: number | null; diffPct: number | null; error: string | null };
  speed: { maxMs: number };
  sum: { utc: { igual: boolean }; sp: { igual: boolean } };
  setmodel: { picked: string; runModel: string; seconds: number; usouOEscolhido: boolean };
  refuse: { semTools: { id: string | null; erro: string | null }; comTools: { id: string | null; erro: string | null } };
  prune: { horasAntigas: number; diasAntigos: number; dobrouEmDia: boolean; sumiu91d: boolean };
  keycalls: { antes: number; depois: number };
};

export function summarizeP16(o: P16Obs) {
  const c1 = { pass: o.check.diffPct !== null && Math.abs(o.check.diffPct) <= 2, medido: o.check.measured, openrouter: o.check.informed, diferencaPct: o.check.diffPct, erro: o.check.error };
  const c2 = { pass: o.speed.maxMs < 1000, maxMs: o.speed.maxMs };
  const c3 = { pass: o.sum.utc.igual && o.sum.sp.igual, ...o.sum };
  const c4 = { pass: o.setmodel.usouOEscolhido && o.setmodel.seconds <= 30, ...o.setmodel };
  const c5 = { pass: o.refuse.semTools.id !== null && !!o.refuse.semTools.erro && o.refuse.comTools.erro === null, ...o.refuse };
  const c6 = { pass: o.prune.horasAntigas === 0 && o.prune.diasAntigos === 0 && o.prune.dobrouEmDia && o.prune.sumiu91d, ...o.prune };
  const c7 = { pass: o.keycalls.depois <= 3, chamadasReaisEm30min: o.keycalls.depois };
  const all = [c1, c2, c3, c4, c5, c6, c7];
  return { poc: 'P16', pass: all.every((c) => c.pass), c1, c2, c3, c4, c5, c6, c7 };
}

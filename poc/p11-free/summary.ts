// POC P11: veredito C1–C5 do rodízio de modelos gratuitos (ADR-025). Puro, sem imports.

export type P11Obs = {
  burst: { n: number; ok: number; ms: number[]; erros: string[] };
  switch429: { ms: number; modelUsed: string; fallback: { model: string; error: string }[] };
  tools: { agentTools: string[]; candidatos: { id: string; tools: boolean }[]; escolhido: { id: string; tools: boolean } | null };
  quota: { today: number; perMinute: number; blocked: boolean; warn: boolean };
};

export const MENSAGENS = 20;
const SUCESSO_MIN = 95;
const P95_MAX = 25_000;
const TROCA_MAX = 2000;

/**
 * p95 pelo nearest-rank: o menor valor que deixa 95% das medições abaixo dele (índice ⌈0,95·n⌉−1).
 * A primeira versão usava ⌊0,95·n⌋ e, com n=20, caía no último elemento — ou seja, media o máximo e chamava de p95.
 * Isso reprovou o C2 na v39 por causa de um único turno de 35,8 s, com mediana de 4,1 s e 18 de 20 turnos abaixo de 10 s.
 */
export function p95(ms: number[]): number {
  if (!ms.length) return 0;
  const s = [...ms].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(0.95 * s.length) - 1)];
}

export function summarizeP11(o: P11Obs) {
  const sucessoPct = o.burst.n ? Math.round((o.burst.ok / o.burst.n) * 100) : 0;
  const c1 = { pass: o.burst.n >= MENSAGENS && sucessoPct >= SUCESSO_MIN, n: o.burst.n, ok: o.burst.ok, sucessoPct, erros: o.burst.erros.slice(0, 5) };

  const p = p95(o.burst.ms);
  const c2 = { pass: p > 0 && p < P95_MAX, p95Ms: p, maiorMs: Math.max(0, ...o.burst.ms) };

  const trocou = o.switch429.fallback.length > 0;
  const c3 = { pass: trocou && o.switch429.ms < TROCA_MAX, ms: o.switch429.ms, trocou, modelUsed: o.switch429.modelUsed, fallback: o.switch429.fallback };

  const comFerramentas = o.tools.agentTools.length > 0;
  const todosServem = o.tools.candidatos.every((m) => m.tools);
  const escolhido = o.tools.escolhido;
  const c4 = {
    pass: o.tools.candidatos.length > 0 && escolhido !== null && (!comFerramentas || (todosServem && escolhido.tools)),
    agentTools: o.tools.agentTools,
    candidatos: o.tools.candidatos.length,
    semFerramentasNaLista: o.tools.candidatos.filter((m) => !m.tools).map((m) => m.id),
    escolhido,
  };

  const c5 = {
    pass: !o.quota.blocked,
    automatica: true,
    nota: o.quota.blocked
      ? `a cota gratuita estava no limite durante a medição (${o.quota.today} hoje, pico ${o.quota.perMinute}/min): o resultado seria da cota, não do rodízio`
      : `cota com folga: ${o.quota.today} requisições gratuitas hoje, pico ${o.quota.perMinute}/min`,
  };

  const all = [c1, c2, c3, c4, c5];
  return { poc: 'P11', pass: all.every((c) => c.pass), c1, c2, c3, c4, c5 };
}

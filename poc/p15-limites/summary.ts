// POC P15: veredito do painel de limites (ADR-016). Puro, sem imports.

export type P15Obs = {
  read: { freshMs: number; cachedMaxMs: number; trigger: string; erros: string[]; pendentesForaDaReautorizacao: string[]; itens: { id: string; status: string; source: string; note?: string | null }[] };
  dailyrow: { linhasHoje: number; skipped: string | null };
  whose: { efetivo: string; ativo: string; dono: string };
  cli: { exit: number; linhas: number };
};

export function summarizeP15(o: P15Obs) {
  // decisão do usuário (2026-09-15): sem faturamento no GCP → Monitoring fica indisponível com a nota e não reprova o C1
  const porDecisao = o.read.itens.filter((i) => i.status === 'error' && /faturamento/.test(i.note ?? '')).map((i) => i.id);
  const erros = o.read.erros.filter((id) => !porDecisao.includes(id));
  const c1 = { pass: o.read.itens.length >= 11 && erros.length === 0 && o.read.pendentesForaDaReautorizacao.length === 0, fontes: o.read.itens.length, erros, indisponiveisPorDecisao: porDecisao, pendentes: o.read.itens.filter((i) => i.status === 'pending').map((i) => i.id) };
  const c2 = { pass: o.read.cachedMaxMs < 1000, cacheMaxMs: o.read.cachedMaxMs, leituraSemCacheMs: o.read.freshMs };
  const c3 = { pass: o.read.itens.every((i) => ['google', 'openrouter', 'gasclaw'].includes(i.source)), selos: Object.fromEntries(o.read.itens.map((i) => [i.id, i.source])) };
  const c4 = { pass: o.dailyrow.linhasHoje >= 11, linhasHoje: o.dailyrow.linhasHoje, obs: o.dailyrow.skipped };
  const c5 = { pass: o.cli.exit === 0 && o.cli.linhas >= 11, ...o.cli };
  const c6 = { pass: !!o.whose.efetivo && o.whose.efetivo.toLowerCase() === o.whose.dono.toLowerCase(), executaComo: o.whose.efetivo, dono: o.whose.dono, nota: 'medido com a conta do dono; outra conta não foi medida (precisa de uma 2ª conta no domínio)' };
  const all = [c1, c2, c3, c4, c5, c6];
  return { poc: 'P15', pass: all.every((c) => c.pass), gatilho: o.read.trigger, c1, c2, c3, c4, c5, c6 };
}

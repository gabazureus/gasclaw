// O DreamBoard (item 36): o que o dono vê de um ciclo em curso. NÚCLEO PURO.
//
// O placar existe para responder UMA pergunta — "vale a pena trocar o titular?" — e a resposta honesta
// tem duas partes que precisam aparecer juntas: o número, e **o que aquele número consegue enxergar**.
// Mostrar 12/17 contra 9/17 sem dizer que k=17 só detecta melhora de 50% para 90% convidaria o dono a
// ler vantagem aritmética como vantagem real. É o mesmo erro que o desenho antigo do ciclo cometia
// somando notas de uma execução cada.
import { beatsIncumbent, kSees } from './dream';
import type { DreamState } from './dreamStore';

export type Row = {
  candidate: string;
  label: string;
  passes: number;
  runs: number;
  rate: number | null;
  incumbentPasses: number;
  wins: boolean;
  /** As linhas que este candidato mudou em relação ao titular. Nunca o texto inteiro: o diff é o que se lê. */
  added: string[];
  removed: string[];
};

export type Board = { cycleId: string; status: string; k: number; sees: string; done: number; total: number; rows: Row[]; error?: string };

const linhas = (t: string): string[] => String(t ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * O diff por LINHA, e só o que mudou.
 *
 * Por linha e não por palavra: um prompt é um documento de instruções, e é linha a linha que o dono
 * decide se concorda. Um diff por palavra mostraria dez fragmentos onde houve uma mudança de regra.
 */
export function diffLines(incumbent: string, candidate: string): { added: string[]; removed: string[] } {
  const a = new Set(linhas(incumbent));
  const b = new Set(linhas(candidate));
  return { added: [...b].filter((l) => !a.has(l)), removed: [...a].filter((l) => !b.has(l)) };
}

const MAX_DIFF = 12; // um diff que não cabe na tela não é lido; o resto fica no arquivo do ciclo

/**
 * O placar completo. `wins` vem de `beatsIncumbent`, que exige vantagem ESTATÍSTICA — não aritmética.
 *
 * Um candidato com 1 acerto a mais aparece com o número maior e `wins: false`, e essa combinação é o
 * ponto: ela mostra que o critério viu a diferença e decidiu que ela não sustenta uma troca.
 */
export function board(s: DreamState | null): Board | null {
  if (!s) return null;
  const k = s.plan.k;
  // A chave do tally é `<kind>:<candidato>:<cenário>` e o valor já é {passes, runs}. Só os passos de
  // QUALIDADE entram no placar: o `gate` é eliminatório, não comparativo — somar os dois faria um
  // candidato que passou no gate parecer melhor sem ter respondido melhor a nada.
  const contagem = (c: string) => {
    const prefixo = `quality:${c}:`;
    return Object.entries(s.tally)
      .filter(([key]) => key.startsWith(prefixo))
      .reduce((acc, [, v]) => ({ passes: acc.passes + v.passes, runs: acc.runs + v.runs }), { passes: 0, runs: 0 });
  };
  const tit = contagem(s.incumbent);
  return {
    cycleId: s.cycleId,
    status: s.status,
    k,
    sees: kSees(k),
    done: s.done.length,
    total: s.plan.steps.length,
    ...(s.error ? { error: s.error } : {}),
    rows: s.plan.candidates.map((c, i) => {
      const n = contagem(c);
      const d = diffLines(s.incumbent, c);
      return {
        candidate: c,
        label: `candidate ${i + 1}`,
        passes: n.passes,
        runs: n.runs,
        rate: n.runs > 0 ? n.passes / n.runs : null,
        incumbentPasses: tit.passes,
        wins: beatsIncumbent(n.passes, tit.passes, k),
        added: d.added.slice(0, MAX_DIFF),
        removed: d.removed.slice(0, MAX_DIFF),
      };
    }),
  };
}

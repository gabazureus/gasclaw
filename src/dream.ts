// Matemática do ciclo de sonho e a separação motor × filho (ADR-038/040). NÚCLEO PURO.
//
// Três coisas moram aqui, e as três vêm de medição feita no dev, não de preferência:
//
// 1. `DEFAULT_K = 17`. A P23 mediu que a variância é da AMOSTRAGEM DO AGENTE, não do juiz (juiz com
//    resposta congelada: desvio 0,00 em 6 execuções; agente com modelo fixo: 0,4,4,0). Logo o
//    comportamento é ~binário e a unidade de medida é TAXA DE ACERTO sobre k execuções.
//
// 2. A comparação é TESTE DE PROPORÇÕES, não soma de notas. Somar notas de uma execução cada era o
//    desenho antigo, e ele lia ruído como sinal.
//
// 3. A recusa do próprio `scriptId`. Depois que `script.projects` entrar no manifesto, o escopo
//    NÃO distingue qual projeto: criar filhos e reescrever o motor passam pela mesma permissão.
//    A separação deixa de ser impossibilidade do Google e vira garantia NOSSA. É esta função.

/**
 * Repetições por cenário, por candidato. Padrão 17 (decisão do usuário, 2026-09-19).
 *
 * O que cada k enxerga, com 80% de poder a 5%, partindo de uma taxa de 50%:
 *   k = 17  → detecta melhora até 90%
 *   k = 36  → detecta melhora até 80%
 *   k = 90  → detecta melhora até 70%
 *   k = 166 → detecta melhora até 65%
 * Baixar k não deixa a medida mais barata: deixa a medida MAIS CEGA. Por isso o número vem
 * acompanhado do que ele perde.
 */
export const DEFAULT_K = 17;

/** O que este k consegue enxergar, em texto, para o painel mostrar ao lado do número. */
export function kSees(k: number): string {
  if (k >= 166) return 'detects an improvement from 50% to 65% or larger';
  if (k >= 90) return 'detects an improvement from 50% to 70% or larger';
  if (k >= 36) return 'detects an improvement from 50% to 80% or larger';
  if (k >= 17) return 'detects an improvement from 50% to 90% or larger';
  return 'too few runs to detect anything reliably';
}

export const kOf = (declared: number | undefined): number => (Number.isInteger(declared) && (declared as number) > 0 ? (declared as number) : DEFAULT_K);

/** Taxa de acerto: quantas das k execuções passaram. `null` sem execução — nunca 0 enganoso. */
export const passRate = (passes: number, runs: number): number | null => (runs > 0 ? passes / runs : null);

/**
 * Teste de duas proporções (z, bilateral). Devolve o z; quem decide é `beatsIncumbent`.
 *
 * Fórmula: z = (p1 − p2) / sqrt(p̄(1−p̄)(1/n1 + 1/n2)), com p̄ = (x1+x2)/(n1+n2).
 */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number | null {
  if (!(n1 > 0 && n2 > 0)) return null;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const denom = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  return denom === 0 ? null : (p1 - p2) / denom;
}

/** 1,96 = 5% bilateral. Nomeado para ninguém achar que é número mágico. */
export const Z_95 = 1.96;

/**
 * O candidato venceu o titular? Só com vantagem ESTATÍSTICA, não com vantagem aritmética.
 *
 * Empate, vantagem pequena e vantagem grande com poucas execuções devolvem `false` — e isso é o
 * desenho, não uma limitação: o que o critério não consegue enxergar, ele não afirma.
 */
export function beatsIncumbent(candidatePasses: number, incumbentPasses: number, k: number): boolean {
  const z = twoProportionZ(candidatePasses, k, incumbentPasses, k);
  return z !== null && z > Z_95;
}

// ---------- Separação motor × filho ----------

/**
 * A ferramenta que escreve código NUNCA pode escrever no projeto que a executa.
 *
 * Depois de `script.projects` entrar no manifesto, o escopo autoriza escrever em QUALQUER projeto
 * do dono — inclusive neste. Um agente que alcançasse o próprio motor poderia reescrever
 * `assertOwner` e o registro fechado de tools, e aí não existe mais nada protegendo nada.
 *
 * Fail-closed em tudo que não for um alvo diferente e explícito: vazio, igual, ou com espaços em
 * volta que disfarcem a igualdade.
 */
export function mayWriteProject(targetScriptId: string, ownScriptId: string): { ok: boolean; reason: string } {
  const target = String(targetScriptId ?? '').trim();
  const own = String(ownScriptId ?? '').trim();
  if (!target) return { ok: false, reason: 'no target project' };
  if (!own) return { ok: false, reason: 'cannot tell which project is running: refusing' };
  if (target === own) return { ok: false, reason: 'refusing to write to the project that is running this code' };
  return { ok: true, reason: '' };
}

// ---------- Teto agregado do Opus ----------

/**
 * O teto diário do gerador de código NÃO pode ser por agente.
 *
 * O intervalo mínimo é por agente: com 24 h e `CODEGEN_BUDGET_USD = 1,00`, UM agente custa no
 * máximo US$ 1,00/dia. Mas `succeed` pode estar ligada em vários, e N agentes custam N dólares sem
 * ninguém ter decidido isso. Um teto que não considera a soma não é teto.
 */
export const CODEGEN_BUDGET_USD = 1.0;
export const CODEGEN_DAILY_CAP_USD = 3.0; // três gerações por dia no ambiente inteiro, somando todos

export const withinDailyCap = (spentTodayUsd: number, nextUsd: number, cap = CODEGEN_DAILY_CAP_USD): boolean =>
  Number.isFinite(spentTodayUsd) && Number.isFinite(nextUsd) && spentTodayUsd + nextUsd <= cap;

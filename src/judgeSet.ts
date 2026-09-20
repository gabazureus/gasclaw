// O conjunto-juiz, EMBUTIDO NO BUNDLE pelo build (`build.mjs` reescreve o `SCENARIOS` abaixo).
//
// Por que aqui e não na pasta do agente: a pasta é compartilhável, logo não confiável (ADR-002/021). Um
// juiz que o avaliado pudesse editar não é juiz — e a pesquisa de 2026-09-19 acrescentou o segundo motivo,
// independente do primeiro: um laço auto-avaliado também NÃO MELHORA (arXiv:2310.01798 mede degradação
// sem retorno externo). Duas razões distintas para a mesma escolha.
//
// Antes deste módulo a frase "o juiz vem do build" era aspiracional: os cenários viviam só no PC, o CLI
// os enviava por POST, e o `dist/_motor.js` não continha nenhum. O ciclo rodando no gatilho não
// enxergaria o próprio juiz. Agora a frase é literal — se o cenário não estiver no build, ele não existe
// para o motor.

export type JudgeSet = 'gate' | 'quality' | 'holdout';
export type Scenario = { name: string; set: JudgeSet; md: string };

/** Preenchido pelo build a partir de `evals/*.md`. Vazio aqui: o valor real é gerado. */
export const SCENARIOS: readonly Scenario[] = [];

export const scenariosOf = (set: JudgeSet, all: readonly Scenario[] = SCENARIOS): Scenario[] => all.filter((s) => s.set === set);

/** Nomes de um conjunto, em ordem estável: o plano do ciclo precisa ser reproduzível. */
export const namesOf = (set: JudgeSet, all: readonly Scenario[] = SCENARIOS): string[] =>
  scenariosOf(set, all)
    .map((s) => s.name)
    .sort();

/** O markdown de um cenário pelo nome; `null` quando não existe — fail-closed, nunca um cenário vazio que "passa". */
export const scenarioMd = (name: string, all: readonly Scenario[] = SCENARIOS): string | null => all.find((s) => s.name === name)?.md ?? null;

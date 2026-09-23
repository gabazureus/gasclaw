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

import { familyOf, judgeIsIndependent } from './dream';

/**
 * O JUIZ, fixado noutra família (decisão do dono, F10): juiz e avaliado no mesmo modelo é auto-elogio —
 * o próprio `judgeIsIndependent` já dizia isso, e não era chamado em lugar nenhum de produção.
 */
export const JUDGE_MODEL = 'deepseek/deepseek-v4-flash-0731';

/** O juiz para este gerador — ou recusa dizendo por quê. É AQUI que a regra da independência vale. */
export function judgeFor(generatorModel: string): string {
  // GERADOR com roteamento automático também recusa: `openrouter/auto` pode cair NA FAMÍLIA DO JUIZ, e
  // ninguém veria. `judgeIsIndependent` só barra o auto do lado do juiz; aqui o outro lado importa igual.
  if (familyOf(generatorModel) === 'openrouter') throw new Error(`no independent judge for ${generatorModel}: auto routing can land on the judge family`);
  const v = judgeIsIndependent(generatorModel, JUDGE_MODEL);
  if (!v.ok) throw new Error(`no independent judge for ${generatorModel}: ${v.reason}`);
  return JUDGE_MODEL;
}

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

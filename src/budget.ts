// O orçamento de uma corrida, e a garantia de que ele VOLTA sozinho (H1 da F6). NÚCLEO PURO.
//
// O dono aprovou US$ 15 para a corrida do enxame (2026-09-20), contra US$ 3,00/dia de sempre, e o
// `/goal` manda devolver os tetos ao fim. Editar a constante — e editá-la de volta depois — dependeria
// de alguém lembrar. Um teto 5× maior esquecido no código é a falha que ninguém vê até a fatura.
//
// Então o teto da corrida EXPIRA. Ele mora numa Script Property com um instante de fim (o painel
// decide, ADR-021), e passado esse instante os tetos de sempre voltam a valer sem passo nenhum.
// As constantes de `dream.ts` e `family.ts` não mudam: elas continuam sendo o valor seguro.
import { CODEGEN_DAILY_CAP_USD } from './dream';
import { FAMILY_CAP_USD } from './family';

/**
 * O teto dos tetos. Um dígito a mais digitado não pode virar US$ 150 em código gerado pelo Opus.
 * Acima disto, a corrida é recusada inteira — não cortada em silêncio para 50.
 */
export const BUDGET_CEILING_USD = 50;

export type BudgetOverride = { codegenUsd: number; familyUsd: number; until: number };

const valido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= BUDGET_CEILING_USD;

/**
 * Lê a corrida declarada. **Fail-closed na direção certa**: aqui "fechado" é o teto BAIXO. Um valor
 * corrompido que voltasse como "sem limite" seria o pior modo de falha que um orçamento pode ter —
 * então ilegível, incompleto, zero, negativo ou acima do teto dos tetos volta `null`, e `null` quer
 * dizer os tetos de sempre.
 */
export function parseBudgetOverride(raw: string | null | undefined): BudgetOverride | null {
  try {
    const o = JSON.parse(String(raw ?? '')) as Partial<BudgetOverride>;
    if (!o || typeof o !== 'object') return null;
    if (!valido(o.codegenUsd) || !valido(o.familyUsd)) return null;
    if (typeof o.until !== 'number' || !Number.isFinite(o.until)) return null;
    return { codegenUsd: o.codegenUsd, familyUsd: o.familyUsd, until: o.until };
  } catch {
    return null;
  }
}

/**
 * Os tetos que valem AGORA.
 *
 * É esta função que implementa "devolva os tetos ao fim": não existe passo de devolução para
 * esquecer. No instante `until` — e a partir dele, para sempre — valem as constantes de sempre.
 * Relógio inválido também devolve os de sempre: um `NaN` não pode prolongar uma corrida.
 */
export function effectiveBudget(o: BudgetOverride | null, now: number): { codegenUsd: number; familyUsd: number; until: number | null } {
  if (!o || !Number.isFinite(now) || now >= o.until) return { codegenUsd: CODEGEN_DAILY_CAP_USD, familyUsd: FAMILY_CAP_USD, until: null };
  return { codegenUsd: o.codegenUsd, familyUsd: o.familyUsd, until: o.until };
}

// Borda do rodízio de modelos gratuitos (ADR-025): junta a lista, a cota e a memória de falhas em volta do núcleo puro.
// Não importa o complete() do llm.ts: quem chama passa a chamada pronta, então o transporte continua sendo da Pista Motor.
import { freeOrder, quota, rotate, type Attempt } from './freeModels';
import type { Completion } from './llm';
import { freeFailures, freeTierCached, listModels, noteFreeFailure } from './models';
import { dayKey, dayTotals, freePerMinuteMax, loadUsage, totalReq } from './usage';

/** Contexto mínimo aceitável para um turno de conversa com histórico. */
export const MIN_CTX = 16_000;
/** Teto de tentativas por turno (ADR-025): acima disso a pessoa espera demais. */
export const MAX_TRIES = 3;

/**
 * Requisições gratuitas de hoje e pico por minuto, pelos mesmos contadores do painel (ADR-016).
 * C7 da P16: **nenhuma chamada remota aqui**. O turno decide com o contador local; o `is_free_tier` vem do cache
 * de 6 h que o painel alimenta. Sem leitura nenhuma ainda, assume o teto maior e deixa o 429 do provedor decidir —
 * bloquear por suposição seria pior que tentar.
 */
export function freeQuotaNow() {
  const u = loadUsage(PropertiesService.getScriptProperties().getProperties());
  const today = totalReq(dayTotals(u, dayKey(Date.now(), 'utc'), 'utc'), (m) => m.endsWith(':free'));
  return { today, perMinute: freePerMinuteMax(u), freeTier: freeTierCached() ?? false };
}

export type FreeCompletion = Completion & { fallback?: Attempt[] };

/**
 * Roda um turno pelo rodízio: escolhe a ordem, respeita a cota, troca de modelo em falha passageira
 * e devolve a resposta com o caminho percorrido (`fallback[]`), que o span llm_call registra.
 */
export function runFree(call: (model: string) => Completion, o: { tools: boolean; now?: number }): FreeCompletion {
  const now = o.now ?? Date.now();
  const q = quota(freeQuotaNow());
  if (q.blocked) throw new Error(`rodízio gratuito indisponível agora: ${q.note}`);
  const candidates = freeOrder(listModels(), { tools: o.tools, minCtx: MIN_CTX, now, failed: freeFailures() }).map((m) => m.id);
  const r = rotate(candidates, call, MAX_TRIES);
  for (const f of r.fallback) noteFreeFailure(f.model, now);
  return r.fallback.length ? { ...r.value, model: r.value.model ?? r.model, fallback: r.fallback } : r.value;
}

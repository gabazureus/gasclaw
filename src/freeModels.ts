// Rodízio de modelos gratuitos (ADR-025). Núcleo puro: escolhe a ordem, decide o que justifica trocar e olha a cota.
// Quem chama (main.ts) embrulha o llm e registra `fallback[]` no span llm_call. Nada aqui faz I/O.
import type { ModelInfo } from './models';

/** Valor de `model:` que liga o rodízio (no AGENTS, na planilha config ou na tela). */
export const FREE = 'free';
export const isFree = (model: string | null | undefined): boolean => (model ?? '').trim().toLowerCase() === FREE;

/** Uma falha recente pesa por este tempo; depois o modelo volta ao seu lugar normal. */
export const PENALTY_MS = 15 * 60_000;

export type OrderOpts = {
  /** O agente tem ferramentas aprovadas? Então só entram modelos que aceitam ferramentas (C4). */
  tools: boolean;
  /** Contexto mínimo em tokens; modelos menores ficam de fora. */
  minCtx: number;
  now: number;
  /** id do modelo → quando falhou pela última vez. */
  failed?: Record<string, number>;
};

/**
 * Ordem do rodízio, sem sorteio (C3): só modelos gratuitos que servem, do maior contexto para o menor,
 * empate resolvido pelo id em ordem alfabética. Quem falhou nos últimos 15 min vai para o fim, mantendo
 * a ordem entre si. A mesma entrada dá sempre a mesma saída.
 */
export function freeOrder(list: ModelInfo[], o: OrderOpts): ModelInfo[] {
  const fit = list.filter((m) => m.free && m.ctx >= o.minCtx && (!o.tools || m.tools));
  const byCtx = [...fit].sort((a, b) => b.ctx - a.ctx || a.id.localeCompare(b.id));
  const punished = (m: ModelInfo) => o.now - (o.failed?.[m.id] ?? -Infinity) < PENALTY_MS;
  return [...byCtx.filter((m) => !punished(m)), ...byCtx.filter(punished)];
}

/**
 * 429, 5xx e "este modelo não serve agora" passam para o próximo; erro de autorização ou de conteúdo para na hora.
 * O 403 é ambíguo e decide pelo texto: medido na P11 (v37), o OpenRouter recusa alguns `:free` com
 * "only available on agentic harnesses" — trocar resolve. Já um 403 de chave sem permissão não melhora com outro modelo.
 */
const SWITCH = /\b(429|5\d\d)\b|no endpoints found|not available|model not found|only available|requires a paid/i;
const KEY_PROBLEM = /\b(401|402)\b|forbidden|your key|api key|not allowed/i;
export const classify = (error: string): 'troca' | 'para' => (!KEY_PROBLEM.test(error) && SWITCH.test(error) ? 'troca' : 'para');

export type Attempt = { model: string; error: string };
export type Rotated<T> = { value: T; model: string; fallback: Attempt[] };

/**
 * Chama `call` com cada candidato até um responder, no máximo `max` tentativas.
 * Devolve o modelo que respondeu e o caminho percorrido (`fallback[]`, que vai para o span llm_call).
 */
export function rotate<T>(candidates: string[], call: (model: string) => T, max: number): Rotated<T> {
  if (!candidates.length) throw new Error('rodízio: nenhum modelo gratuito serve para este agente (veja a aba Modelos e custo)');
  const fallback: Attempt[] = [];
  let last: Error | null = null;
  for (const model of candidates.slice(0, Math.max(1, max))) {
    try {
      return { value: call(model), model, fallback };
    } catch (err) {
      const error = (err as Error).message;
      last = err as Error;
      if (classify(error) === 'para') throw err;
      fallback.push({ model, error });
    }
  }
  throw last ?? new Error('rodízio: nenhuma tentativa foi feita');
}

/** Cotas dos modelos gratuitos do OpenRouter, medidas pelo painel (ADR-016). */
export const PER_MINUTE = 20;
export const PER_DAY = 1000;
export const PER_DAY_SEM_CREDITO = 50;
const WARN = 0.8;

export type QuotaNow = { today: number; perMinute: number; freeTier: boolean };
export type QuotaVerdict = { blocked: boolean; warn: boolean; note: string; dayMax: number };

/** Diz se dá para chamar agora, e o aviso que a tela mostra quando a folga está acabando. */
export function quota(q: QuotaNow): QuotaVerdict {
  const dayMax = q.freeTier ? PER_DAY_SEM_CREDITO : PER_DAY;
  if (q.perMinute >= PER_MINUTE) return { blocked: true, warn: true, dayMax, note: `limite de ${PER_MINUTE} requisições gratuitas por minuto atingido; tente daqui a pouco`, };
  if (q.today >= dayMax) return { blocked: true, warn: true, dayMax, note: `limite de ${dayMax} requisições gratuitas por dia atingido (${q.today} de ${dayMax})` };
  const warn = q.today >= dayMax * WARN || q.perMinute >= PER_MINUTE * WARN;
  return { blocked: false, warn, dayMax, note: warn ? `perto do limite gratuito: ${q.today} de ${dayMax} hoje, ${q.perMinute} de ${PER_MINUTE} neste minuto` : `${q.today} de ${dayMax} requisições gratuitas hoje` };
}

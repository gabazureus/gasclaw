// Modelos e escolha por agente (ADR-018). Núcleo puro no topo; borda (OpenRouter + Properties + cache) embaixo.
import { DEFAULT_MODEL } from './workspace';

export type ModelInfo = { id: string; ctx: number; inM: number; outM: number; tools: boolean; free: boolean };

const perM = (x: unknown) => Math.max(0, Math.round(Number(x ?? 0) * 1e6 * 1e4) / 1e4 || 0); // negativo = preço variável (openrouter/auto)

/** `/api/v1/models` reduzido ao que a tela usa (cabe no cache de 100 KB). */
export function reduceModels(json: { data?: { id: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }[] }): ModelInfo[] {
  return (json.data ?? [])
    .map((m) => {
      const inM = perM(m.pricing?.prompt);
      const outM = perM(m.pricing?.completion);
      return { id: m.id, ctx: m.context_length ?? 0, inM, outM, tools: (m.supported_parameters ?? []).includes('tools'), free: m.id.endsWith(':free') };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** C5: null se pode; senão a mensagem de recusa. */
export function validateChoice(list: ModelInfo[], id: string, agentTools: string[]): string | null {
  if (id === DEFAULT_MODEL) return null;
  const m = list.find((x) => x.id === id);
  if (!m) return `Modelo ${id} não encontrado na lista do OpenRouter.`;
  if (agentTools.length && !m.tools) return `O modelo ${id} não aceita ferramentas, e este agente usa: ${agentTools.join(', ')}.`;
  return null;
}

// ---------- borda ----------

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const KEY_URL = 'https://openrouter.ai/api/v1/key';
const cache = () => CacheService.getScriptCache();

export function listModels(): ModelInfo[] {
  const hit = cache().get('or:models');
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch(MODELS_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`OpenRouter models ${res.getResponseCode()}`);
  const list = reduceModels(JSON.parse(res.getContentText()));
  const raw = JSON.stringify(list);
  if (raw.length < 95_000) cache().put('or:models', raw, 21_600); // 6 h
  return list;
}

export type KeyInfo = { limit: number | null; usage: number; usage_daily: number; is_free_tier: boolean };

/** `/api/v1/key` com cache de 10 min; conta as chamadas reais (C7). */
export function keyInfo(apiKey: string, fresh = false): KeyInfo {
  const hit = fresh ? null : cache().get('or:key'); // fresh: C1 controlado da P16 lê antes e depois, sem o cache de 10 min
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch(KEY_URL, { headers: { Authorization: `Bearer ${apiKey}` }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`OpenRouter key ${res.getResponseCode()}`);
  const d = JSON.parse(res.getContentText()).data ?? {};
  const info: KeyInfo = { limit: d.limit ?? null, usage: Number(d.usage ?? 0), usage_daily: Number(d.usage_daily ?? 0), is_free_tier: d.is_free_tier === true };
  cache().put('or:key', JSON.stringify(info), 600);
  const calls = JSON.parse(cache().get('or:keycalls') ?? '[]') as number[];
  cache().put('or:keycalls', JSON.stringify([...calls.filter((t) => t > Date.now() - 1_800_000), Date.now()]), 1_800);
  return info;
}

export const keyCallsLast30min = (): number => (JSON.parse(cache().get('or:keycalls') ?? '[]') as number[]).filter((t) => t > Date.now() - 1_800_000).length;

const OVERRIDE = (folderId: string) => `MODEL:${folderId}`;
export const getOverride = (folderId: string): string | null => PropertiesService.getScriptProperties().getProperty(OVERRIDE(folderId));
export const setOverride = (folderId: string, model: string | null): void => {
  const p = PropertiesService.getScriptProperties();
  if (model) p.setProperty(OVERRIDE(folderId), model);
  else p.deleteProperty(OVERRIDE(folderId));
};

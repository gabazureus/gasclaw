// Modelos e escolha por agente (ADR-018). Núcleo puro no topo; borda (OpenRouter + Properties + cache) embaixo.
import { isFree, PENALTY_MS } from './freeModels';
import { DEFAULT_MODEL } from './workspace';

export type ModelInfo = { id: string; ctx: number; inM: number; outM: number; tools: boolean; free: boolean };

// ---------- Família do modelo, e a independência do juiz (ADR-048) ----------
//
// Moravam em `dream.ts`, que saiu com o ciclo de sonho. A regra NÃO era do sonho: ela vale para
// qualquer par gerador/juiz, e é ela que `judgeSet.judgeFor` aplica em produção.

/**
 * A família é o que vem antes da barra no id do OpenRouter (`anthropic/claude-…` → `anthropic`).
 */
export const familyOf = (modelId: string): string => String(modelId ?? '').split('/')[0].toLowerCase().trim();

/**
 * O juiz não pode ser da mesma família do gerador: o viés de auto-preferência está medido
 * (arXiv:2410.21819 e 2604.06996). Se um modelo gera e um juiz da mesma família decide, parte do
 * delta é parentesco e não qualidade.
 */
export function judgeIsIndependent(generatorModel: string, judgeModel: string): { ok: boolean; reason: string } {
  const g = familyOf(generatorModel);
  const j = familyOf(judgeModel);
  if (!g || !j) return { ok: false, reason: 'cannot tell the model families apart: refusing' };
  // `openrouter/auto` pode rotear para QUALQUER família, inclusive a do gerador — e a P23 mediu que
  // ele de fato escolhe sozinho. Um juiz que pode virar parente não é independente.
  if (j === 'openrouter') return { ok: false, reason: 'the judge must be a pinned model: auto routing can land on the generator family' };
  if (g === j) return { ok: false, reason: `judge and generator are both ${g}: self-preference bias` };
  return { ok: true, reason: '' };
}

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
  if (isFree(id)) {
    // ADR-025: `free` não é um id, é o rodízio; vale se existir gratuito que sirva ao agente
    const free = list.filter((x) => x.free);
    if (!free.length) return 'Nenhum modelo gratuito na lista do OpenRouter agora.';
    if (agentTools.length && !free.some((x) => x.tools)) return `No free model accepts tools, and this agent uses: ${agentTools.join(', ')}.`;
    return null;
  }
  const m = list.find((x) => x.id === id);
  if (!m) return `Model ${id} is not in the OpenRouter list.`;
  if (agentTools.length && !m.tools) return `Model ${id} does not accept tools, and this agent uses: ${agentTools.join(', ')}.`;
  return null;
}

/**
 * O `model` que veio da PASTA (AGENTS.md ou planilha `config`), já decidido contra a lista do OpenRouter.
 *
 * A pasta é a superfície compartilhável do agente, e era a única entrada de modelo que NÃO passava por
 * `validateChoice` — só o painel (`setAgentModel`) e a CLI (`eval`) validavam. Quem tivesse acesso de
 * edição podia apontar o agente para o modelo mais caro do OpenRouter, ou para um que não aceita
 * ferramentas (e aí as tools falhavam sem explicação), sem passar por nenhuma tela do dono.
 *
 * `list === null` significa "não deu para ler a lista agora". Nesse caso cai no padrão: derrubar o turno
 * puniria o usuário por uma falha passageira da rede, e aceitar o pedido da pasta seria confiar justamente
 * quando não dá para conferir. O padrão conhecido é o seguro nos dois eixos, custo e disponibilidade.
 *
 * Esta proteção não precisa ser hermética: o teto de `RUN_BUDGET_USD` por run já limita o dano em dinheiro.
 * Ela existe para o modelo da pasta parar de ser uma entrada não conferida, e para a troca ficar visível.
 */
export type ModelChoice = { model: string; source: 'pasta' | 'padrao'; reason?: string };

export function folderModel(pedido: string | undefined, list: ModelInfo[] | null, agentTools: string[]): ModelChoice {
  const id = (pedido ?? '').trim();
  // Nada a recusar: o trace não deve acusar uma troca que não houve.
  if (!id || id === DEFAULT_MODEL) return { model: DEFAULT_MODEL, source: 'pasta' };
  if (list === null) return { model: DEFAULT_MODEL, source: 'padrao', reason: `a lista de modelos do OpenRouter não pôde ser lida agora; usando ${DEFAULT_MODEL} no lugar de ${id}` };
  const err = validateChoice(list, id, agentTools);
  return err ? { model: DEFAULT_MODEL, source: 'padrao', reason: err } : { model: id, source: 'pasta' };
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
  cache().put(FREE_TIER, String(info.is_free_tier), 21_600); // 6 h: quem lê o /key alimenta o cache que o turno usa
  const calls = JSON.parse(cache().get('or:keycalls') ?? '[]') as number[];
  cache().put('or:keycalls', JSON.stringify([...calls.filter((t) => t > Date.now() - 1_800_000), Date.now()]), 1_800);
  return info;
}

/**
 * `is_free_tier` guardado por 6 h (ADR-025, C7 da P16): o turno precisa saber só qual é o teto diário, e isso
 * quase nunca muda. Quem consulta o `/key` é o painel; o turno lê daqui e nunca faz chamada remota.
 * `null` = ainda não foi lido nenhuma vez.
 */
const FREE_TIER = 'or:freetier';
export const freeTierCached = (): boolean | null => {
  const v = cache().get(FREE_TIER);
  return v === null ? null : v === 'true';
};

export const keyCallsLast30min = (): number => (JSON.parse(cache().get('or:keycalls') ?? '[]') as number[]).filter((t) => t > Date.now() - 1_800_000).length;

// ADR-025: memória curta de falhas do rodízio (id → quando falhou). Fica no cache: some sozinha e não suja as Properties.
const FAILED = 'or:freefail';
export const freeFailures = (): Record<string, number> => JSON.parse(cache().get(FAILED) ?? '{}');
export function noteFreeFailure(id: string, now = Date.now()): void {
  const f = freeFailures();
  f[id] = now;
  for (const k of Object.keys(f)) if (now - f[k] >= PENALTY_MS) delete f[k];
  cache().put(FAILED, JSON.stringify(f), Math.round(PENALTY_MS / 1000));
}

const OVERRIDE = (folderId: string) => `MODEL:${folderId}`;
export const getOverride = (folderId: string): string | null => PropertiesService.getScriptProperties().getProperty(OVERRIDE(folderId));
export const setOverride = (folderId: string, model: string | null): void => {
  const p = PropertiesService.getScriptProperties();
  if (model) p.setProperty(OVERRIDE(folderId), model);
  else p.deleteProperty(OVERRIDE(folderId));
};

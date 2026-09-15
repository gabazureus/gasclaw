// POC P11 (descartável): rodízio de modelos gratuitos (ADR-025). Etapas chamadas pelo pc.sh com trace=0.
import { FREE, freeOrder, quota, rotate } from '../../src/freeModels';
import { getOverride, keyInfo, listModels, setOverride } from '../../src/models';
import * as observe from '../../src/observe';
import { dayKey, dayTotals, freePerMinuteMax, totalReq } from '../../src/usage';

export type P11Deps = {
  apiKey: () => string | null;
  agent: () => { folderId: string; tools: string[] } | null;
  /** Um turno real pelo Chat, já com o rodízio ligado; devolve o modelo que respondeu. */
  testAgent: (folderId: string, q: string) => { runId: string; model: string; fallback?: { model: string; error: string }[] };
  /** Chamada crua ao modelo, para exercitar a troca sem depender de o provedor devolver 429. */
  llm: (model: string, prompt: string) => { model: string };
};

const MIN_CTX = 16_000;
const usageNow = () => observe.loadUsage(PropertiesService.getScriptProperties().getProperties());

/** Requisições gratuitas de hoje e pico por minuto, pelos mesmos contadores do painel (ADR-016). */
function quotaNow(key: string | null) {
  const u = usageNow();
  const today = totalReq(dayTotals(u, dayKey(Date.now(), 'utc'), 'utc'), (m) => m.endsWith(':free'));
  const perMinute = freePerMinuteMax(u);
  let freeTier = false;
  try {
    freeTier = key ? keyInfo(key).is_free_tier : false;
  } catch {
    freeTier = false;
  }
  const v = quota({ today, perMinute, freeTier });
  return { today, perMinute, freeTier, blocked: v.blocked, warn: v.warn, note: v.note };
}

export function pocP11(step: string | undefined, p: Record<string, string>, d: P11Deps) {
  const key = d.apiKey();

  if (step === 'quota') return { poc: 'P11', step, pass: true, ...quotaNow(key) };

  if (step === 'tools') {
    // C4: com ferramentas aprovadas, nenhum candidato pode ser um modelo sem ferramentas
    const a = d.agent();
    if (!a) throw new Error('P11: cadastre um agente na tela');
    const list = listModels();
    const candidatos = freeOrder(list, { tools: a.tools.length > 0, minCtx: MIN_CTX, now: Date.now() }).map((m) => ({ id: m.id, tools: m.tools, ctx: m.ctx }));
    return { poc: 'P11', step, pass: true, agentTools: a.tools, candidatos, escolhido: candidatos[0] ?? null, semFerramentas: freeOrder(list, { tools: false, minCtx: MIN_CTX, now: Date.now() }).length };
  }

  if (step === 'switch') {
    // C3: o primeiro candidato devolve 429; medimos quanto custa passar para o próximo e chamar de verdade
    const a = d.agent();
    if (!a) throw new Error('P11: cadastre um agente na tela');
    const candidatos = freeOrder(listModels(), { tools: a.tools.length > 0, minCtx: MIN_CTX, now: Date.now() }).map((m) => m.id);
    if (candidatos.length < 2) throw new Error('P11: menos de 2 modelos gratuitos servem para este agente');
    const t0 = Date.now();
    const r = rotate(candidatos, (m) => {
      if (m === candidatos[0]) throw new Error('OpenRouter 429: rate limit (simulado pela POC)');
      return d.llm(m, 'Responda apenas: ok');
    }, 3);
    return { poc: 'P11', step, pass: true, ms: Date.now() - t0, modelUsed: r.model, fallback: r.fallback, candidatos: candidatos.slice(0, 3) };
  }

  if (step === 'burst') {
    // C1 e C2: mensagens reais com `model: free`; o pc.sh chama em lotes para não passar de 20 por minuto
    const a = d.agent();
    if (!a) throw new Error('P11: cadastre um agente na tela');
    const n = Math.min(Number(p.n) || 5, 5);
    const tag = p.tag ?? '';
    const before = getOverride(a.folderId);
    const ms: number[] = [];
    const erros: string[] = [];
    const modelos: string[] = [];
    try {
      setOverride(a.folderId, FREE);
      for (let i = 0; i < n; i++) {
        const t0 = Date.now();
        try {
          const r = d.testAgent(a.folderId, `Responda apenas com o número ${tag}${i + 1}.`);
          modelos.push(r.model);
          ms.push(Date.now() - t0);
        } catch (err) {
          erros.push((err as Error).message.slice(0, 160));
          ms.push(Date.now() - t0);
        }
      }
    } finally {
      setOverride(a.folderId, before);
    }
    return { poc: 'P11', step, pass: true, n, ok: n - erros.length, ms, erros, modelos };
  }

  throw new Error(`etapa desconhecida: ${step} (use tools, switch, burst ou quota)`);
}

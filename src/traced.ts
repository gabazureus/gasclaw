// Deps do Chat embrulhadas no trace (A3/M16): Chat, tela de conversa e clique de aprovação registram os mesmos passos.
// Puro: recebe o tracer e o carregador do agente por injeção (o main.ts passa runlog e loadAgentForTurn).
import type { ChatDeps } from './chat';
import type { Completion, Message } from './llm';
import type { LoadedAgent } from './workspace';

export type StepTracer = { step<T>(name: string, fn: () => T, info?: (v: T) => Record<string, unknown>, slow?: boolean): T };

/** Dados do span resolve_agent: origem de cada papel (editor, doc, md, missing), cache e falha do editor. */
export const agentInfo = (folderId: string) => (s: LoadedAgent & { modelSource?: string; modelReason?: string }) => ({
  agent: s.name,
  folderId,
  configModel: s.config.model,
  modelSource: s.modelSource ?? 'pasta',
  // Por que o modelo da pasta nao foi usado. Sem isto, `modelSource: padrao` seria um fato sem causa.
  ...(s.modelReason ? { modelReason: s.modelReason } : {}),
  origem: s.origem,
  cached: s.cached === true,
  ...(s.editorError ? { editorError: s.editorError } : {}),
});

/** Dados do span llm_call: modelo real, tokens, custo e o prompt completo (vai só para o JSON do run). */
export const llmInfo = (requested: string, messages: Message[]) => (c: Completion & { fallback?: { model: string; error: string }[] }) => ({
  model: c.model ?? requested,
  // ADR-025: com `model: free`, `requested` é a palavra "free"; estes dois dizem quem respondeu e por onde passou
  model_used: c.model ?? requested,
  ...(c.fallback?.length ? { fallback: c.fallback } : {}),
  prompt_tokens: c.usage?.prompt_tokens ?? 0,
  completion_tokens: c.usage?.completion_tokens ?? 0,
  cost: c.usage?.cost ?? 0,
  finish_reason: c.finish_reason,
  generation: c.id,
  messages,
});

export function traceDeps(t: StepTracer, d: ChatDeps, load: (folderId: string) => LoadedAgent): ChatDeps {
  const toolkit = d.toolkit;
  return {
    ...d,
    load: (id) => t.step('resolve_agent', () => load(id), agentInfo(id)),
    llm: (key, model, messages, tools) => t.step('llm_call', () => d.llm(key, model, messages, tools), llmInfo(model, messages), true),
    ...(toolkit
      ? {
          toolkit: (spec, ownerDm) => {
            const k = toolkit(spec, ownerDm);
            return { ...k, tools: k.tools.map((tool) => ({ ...tool, run: (a, c) => t.step('tool_call', () => tool.run(a, c), () => ({ tool: tool.name })) })) };
          },
        }
      : {}),
  };
}

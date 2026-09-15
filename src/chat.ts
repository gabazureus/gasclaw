import { CHAT_BUDGET_MS, DEFAULT_STEPS, runTurn, type TurnResult } from './agent';
import type { Completion, Message, ToolDef } from './llm';
import type { Tool, ToolCtx } from './tools/registry';
import { canUse, type AgentSpec } from './workspace';

export type ChatEvent = {
  type: string;
  message?: { text?: string; argumentText?: string };
  user: { email: string };
  space: { name: string; type?: string; singleUserBotDm?: boolean };
};
export type AgentEntry = { folderId: string; name: string };
/** Tools do agente neste turno; `memory` só é lida quando ownerDm (spec §8). */
export type Toolkit = { tools: Tool[]; ctx: ToolCtx; memory?: string; steps: number };
export type ChatDeps = {
  enabled: () => boolean;
  owner: () => string;
  apiKey: () => string | null;
  defaultAgent: () => AgentEntry | null;
  load: (folderId: string) => AgentSpec;
  history: (key: string) => Message[];
  saveHistory: (key: string, history: Message[]) => void;
  llm: (apiKey: string, model: string, messages: Message[], tools?: ToolDef[]) => Completion;
  toolkit?: (spec: AgentSpec, ownerDm: boolean) => Toolkit;
  clock?: () => number;
  onTurn?: (turn: TurnResult) => void;
};

const NO_TOOLS: Toolkit = { tools: [], ctx: { now: () => '', ownerDm: false, memory: { read: () => '', write: () => {} } }, steps: DEFAULT_STEPS };

export const isOwnerDm = (e: ChatEvent, owner: string): boolean =>
  (e.space.singleUserBotDm === true || e.space.type === 'DM') && e.user.email.toLowerCase() === owner.toLowerCase();

export function handleChat(e: ChatEvent, d: ChatDeps): { text?: string } {
  if (e.type === 'ADDED_TO_SPACE') return { text: 'Olá! Sou o gasclaw 🦀. Me mande uma mensagem para falar com seu agente.' };
  if (e.type !== 'MESSAGE') return {};
  if (!d.enabled()) return { text: 'O gasclaw está pausado pelo administrador.' };
  const entry = d.defaultAgent();
  if (!entry) return { text: 'Nenhum agente configurado. Abra a tela gasclaw e cole a URL de uma pasta do Drive.' };
  const key = d.apiKey();
  if (!key) return { text: 'Falta a chave do OpenRouter. Cole-a na tela gasclaw.' };
  try {
    const spec = d.load(entry.folderId);
    if (!canUse(spec.config, e.user.email, d.owner())) return { text: `Você (${e.user.email}) não tem acesso ao agente ${spec.name}.` };
    const text = (e.message?.argumentText ?? e.message?.text ?? '').trim();
    if (!text) return { text: 'Mande um texto para eu responder.' };
    const hk = `${entry.folderId}:${e.space.name}`;
    const ownerDm = isOwnerDm(e, d.owner());
    const kit = d.toolkit?.(spec, ownerDm) ?? NO_TOOLS;
    const clock = d.clock ?? Date.now;
    const start = clock();
    const out = runTurn({
      system: spec.system,
      history: d.history(hk),
      text,
      memory: ownerDm ? kit.memory : undefined,
      tools: kit.tools,
      ctx: kit.ctx,
      llm: (m, defs) => d.llm(key, spec.config.model, m, defs),
      runId: `${hk}:${start}`,
      steps: kit.steps,
      deadlineMs: start + CHAT_BUDGET_MS,
      clock,
    });
    d.saveHistory(hk, out.history);
    d.onTurn?.(out);
    return { text: out.text };
  } catch (err) {
    console.error('chat', err);
    return { text: `Não consegui responder agora: ${(err as Error).message}` };
  }
}

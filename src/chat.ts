import { reply } from './agent';
import type { Completion, Message } from './llm';
import { canUse, type AgentSpec } from './workspace';

export type ChatEvent = {
  type: string;
  message?: { text?: string; argumentText?: string };
  user: { email: string };
  space: { name: string };
};
export type AgentEntry = { folderId: string; name: string };
export type ChatDeps = {
  enabled: () => boolean;
  owner: () => string;
  apiKey: () => string | null;
  defaultAgent: () => AgentEntry | null;
  load: (folderId: string) => AgentSpec;
  history: (key: string) => Message[];
  saveHistory: (key: string, history: Message[]) => void;
  llm: (apiKey: string, model: string, messages: Message[]) => Completion;
};

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
    const out = reply(spec, d.history(hk), text, (m) => d.llm(key, spec.config.model, m));
    d.saveHistory(hk, out.history);
    return { text: out.text };
  } catch (err) {
    console.error('chat', err);
    return { text: `Não consegui responder agora: ${(err as Error).message}` };
  }
}

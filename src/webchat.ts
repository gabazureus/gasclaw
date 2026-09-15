// Tela de chat do gasclaw: só outra entrada do mesmo handleChat (tools, aprovação, ask, histórico).
import { SCREEN_BUDGET_MS } from './agent';
import { handleChat, type ChatDeps, type ChatReply } from './chat';

/** Conversa da tela por usuário: tratada como DM (só o dono abre a página); histórico em `<pasta>:tela/chat/<e-mail>`. */
export const webSpace = (owner: string) => ({ name: `tela/chat/${owner.toLowerCase()}`, singleUserBotDm: true });
const screen = (d: ChatDeps): ChatDeps => ({ ...d, budgetMs: SCREEN_BUDGET_MS });

export const webSend = (d: ChatDeps, owner: string, text: string): ChatReply =>
  handleChat({ type: 'MESSAGE', message: { text }, user: { email: owner }, space: webSpace(owner) }, screen(d));

export const webClick = (d: ChatDeps, owner: string, parameters: Record<string, string>): ChatReply =>
  handleChat({ type: 'CARD_CLICKED', user: { email: owner }, space: webSpace(owner), common: { parameters } }, screen(d));

/** Delegação `client` da voz (ADR-019, adiada): a transcrição vira mensagem comum do mesmo histórico. */
export function voiceDelegate(d: ChatDeps, owner: string, utterance: string): ChatReply {
  const text = utterance.trim();
  return text ? webSend(d, owner, text) : { text: 'Não entendi a fala. Pode repetir?' };
}

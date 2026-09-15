// Compactação da sessão (spec §6): quando a conversa passa do teto, o começo vira resumo e a cauda fica intacta.
// Uma chamada ao modelo, depois da resposta já entregue, e nunca derruba o turno.
import type { Completion, Message } from './llm';
import { conversationText, needsCompaction, splitForCompaction, SUMMARY_PROMPT, withSummary, type Session } from './session';
import type { SessionIO } from './sessionStore';

/** Devolve true se compactou. `space` é a chave da conversa (agente:espaço). */
export function compactSession(io: SessionIO, space: string, llm: (messages: Message[]) => Completion): boolean {
  try {
    const session = io.load(space);
    if (!needsCompaction(session)) return false;
    const { older, tail } = splitForCompaction(session);
    if (!older.length) return false;
    const summary = llm([
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: conversationText(older) },
    ]).text.trim();
    if (!summary) return false;
    io.save(space, withSummary(session, summary, tail));
    return true;
  } catch (err) {
    console.warn('compactação da sessão falhou', (err as Error).message);
    return false;
  }
}

/** Sessão → histórico que o chat usa, e histórico → sessão na hora de salvar. */
export const toSession = (previous: Session, messages: Message[]): Session => ({ ...(previous.summary ? { summary: previous.summary } : {}), messages });

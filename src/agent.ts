import type { Completion, Message } from './llm';
import type { AgentSpec } from './workspace';

export const MAX_HISTORY = 20;

export function trimHistory(history: Message[], max = MAX_HISTORY): Message[] {
  return history.slice(-max);
}

// minimal: 1 chamada ao LLM, sem tools; o loop de steps com checkpoint entra na F2.
export function reply(
  spec: AgentSpec,
  history: Message[],
  text: string,
  llm: (messages: Message[]) => Completion,
): { text: string; history: Message[] } {
  const past = trimHistory(history);
  const answer = llm([{ role: 'system', content: spec.system }, ...past, { role: 'user', content: text }]).text.trim() || '(sem resposta do modelo)';
  return { text: answer, history: trimHistory([...past, { role: 'user', content: text }, { role: 'assistant', content: answer }]) };
}

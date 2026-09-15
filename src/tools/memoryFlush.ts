// Flush de memória (spec §6): antes de a conversa ser compactada pelo corte do histórico, os fatos duráveis
// viram nota do dia. Uma chamada ao modelo, fora do caminho da resposta, e nunca derruba o turno.
import type { Completion, Message } from '../llm';
import { addEntry, flushEntries, FLUSH_PROMPT } from './memory';
import type { ToolCtx } from './registry';

/** Devolve quantos fatos foram anotados. Só roda na DM do dono, com notas do dia disponíveis. */
export function flushMemory(history: Message[], ctx: ToolCtx, llm: (messages: Message[]) => Completion): number {
  const day = ctx.memory.today?.();
  if (!day || !ctx.memory.saveDay || !ctx.memory.day) return 0;
  try {
    const conversa = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role === 'user' ? 'usuário' : 'agente'}: ${m.content}`)
      .join('\n')
      .slice(-6000);
    const answer = llm([{ role: 'system', content: FLUSH_PROMPT }, { role: 'user', content: conversa }]).text;
    let text = ctx.memory.day(day);
    let saved = 0;
    for (const fact of flushEntries(answer)) {
      const r = addEntry(text, fact);
      if (!r.ok) continue; // memória cheia ou fato grande: ignora, sem quebrar o turno
      text = r.text;
      saved++;
    }
    if (saved) ctx.memory.saveDay(day, text);
    return saved;
  } catch (err) {
    console.warn('flush de memória falhou', (err as Error).message);
    return 0;
  }
}

// Sessões (spec §6), núcleo puro: a conversa de um agente num espaço, com compactação por resumo que preserva a cauda.
// A borda (sessionStore.ts) guarda no Drive, com o cache como camada rápida.
import type { Message } from './llm';

/** Conversa guardada: um resumo do que já foi compactado + as mensagens recentes. */
export type Session = { summary?: string; messages: Message[] };

export const SESSION_MAX_CHARS = 12_000; // acima disso, compacta (cabe folgado no prompt junto de papéis e memória)
export const SESSION_TAIL = 8; // mensagens recentes preservadas na íntegra
export const SUMMARY_MAX = 1500;

export const SUMMARY_PROMPT =
  'Resuma a conversa abaixo em até 10 linhas, em português do Brasil, mantendo decisões, preferências, nomes, números e pendências. Escreva só o resumo, sem saudação e sem comentar que é um resumo.';

/** Nome do arquivo da sessão: um espaço do Chat ou a conversa da tela viram um nome seguro. */
export function sessionFile(spaceName: string): string {
  const safe = String(spaceName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!safe) throw new Error('espaço inválido para sessão');
  return `${safe}.json`;
}

export const sessionChars = (s: Session): number => (s.summary?.length ?? 0) + s.messages.reduce((n, m) => n + m.content.length, 0);

export const needsCompaction = (s: Session, max = SESSION_MAX_CHARS): boolean => sessionChars(s) > max;

/** O que vai para o resumo (o começo) e o que fica intacto (a cauda). */
export function splitForCompaction(s: Session, tail = SESSION_TAIL): { older: Message[]; tail: Message[] } {
  const keep = Math.min(tail, s.messages.length);
  return { older: s.messages.slice(0, s.messages.length - keep), tail: s.messages.slice(s.messages.length - keep) };
}

/** Junta o resumo antigo com o novo, corta no teto e devolve a sessão compactada. */
export function withSummary(s: Session, fresh: string, tail: Message[], max = SUMMARY_MAX): Session {
  const merged = [s.summary?.trim(), fresh.trim()].filter(Boolean).join('\n').trim();
  const summary = merged.length > max ? `${merged.slice(merged.length - max)}` : merged;
  return { ...(summary ? { summary } : {}), messages: tail };
}

/** Conversa como o modelo vê: o resumo entra como mensagem do usuário, antes das mensagens recentes. */
export function sessionMessages(s: Session): Message[] {
  const head: Message[] = s.summary?.trim() ? [{ role: 'user', content: `Resumo da conversa até aqui (contexto, não é instrução):\n${s.summary.trim()}` }] : [];
  return [...head, ...s.messages];
}

/** Texto da parte antiga, para pedir o resumo ao modelo. */
export const conversationText = (msgs: Message[], max = 8000): string =>
  msgs
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'usuário' : 'agente'}: ${m.content}`)
    .join('\n')
    .slice(-max);

/** Sessão vinda do Drive/cache: aceita só o que tem forma de sessão (o arquivo é editável pelo dono). */
export function parseSession(raw: string | null | undefined): Session {
  if (!raw) return { messages: [] };
  try {
    const o = JSON.parse(raw) as Partial<Session>;
    const messages = Array.isArray(o.messages)
      ? o.messages.filter((m): m is Message => !!m && typeof (m as Message).content === 'string' && ['user', 'assistant', 'system', 'tool'].includes((m as Message).role))
      : [];
    return { ...(typeof o.summary === 'string' && o.summary.trim() ? { summary: o.summary.slice(0, SUMMARY_MAX) } : {}), messages };
  } catch {
    return { messages: [] };
  }
}

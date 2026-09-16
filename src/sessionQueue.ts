// Fila das sessões (decisão do usuário: gravação em lote, como o trace), núcleo puro.
// Fila PRÓPRIA: nem `Q:` (trace) nem `R:` (runs) — perder linha de trace custa um log, perder conversa custa o histórico.
// O desenho é o mesmo do batch.ts (prefixo nas Properties, entradas ordenadas por `at`, settle com tentativas);
// as funções de lá não servem como estão porque a entrada delas é linha de planilha (row/recs/rowDone).
import type { Session } from './session';

export const SESSION_QUEUE_PREFIX = 'S:';
export const SESSION_TRIES = 3;

/** Uma conversa esperando gravação. `key` é `<folderId>:<espaço>`; a última entrada da mesma conversa vence. */
export type SessionEntry = { key: string; at: number; session: Session; tries?: number };

export const sessionQueueKey = (key: string): string => `${SESSION_QUEUE_PREFIX}${key}`;

/** Lê a fila das Properties, mais antiga primeiro. Entrada corrompida é ignorada com aviso, sem travar a fila. */
export function splitSessionQueue(props: Record<string, string>): SessionEntry[] {
  return Object.entries(props)
    .filter(([k]) => k.startsWith(SESSION_QUEUE_PREFIX))
    .flatMap(([k, v]) => {
      try {
        const e = JSON.parse(v) as SessionEntry;
        return e && typeof e.key === 'string' && e.session && Array.isArray(e.session.messages) ? [e] : [];
      } catch {
        console.warn(`fila de sessões: entrada ${k} corrompida, ignorada`);
        return [];
      }
    })
    .sort((a, b) => a.at - b.at);
}

/** Depois de gravar: o que sai da fila e o que volta para tentar de novo (com teto de tentativas). */
export function settleSessions(entries: SessionEntry[], ok: boolean[]): { remove: string[]; retry: SessionEntry[] } {
  const remove: string[] = [];
  const retry: SessionEntry[] = [];
  entries.forEach((e, i) => {
    const tries = (e.tries ?? 0) + 1;
    if (ok[i] || tries >= SESSION_TRIES) remove.push(sessionQueueKey(e.key));
    else retry.push({ ...e, tries });
  });
  return { remove, retry };
}

/**
 * Gravar agora, sem passar pelo lote? Sim quando o estado precisa estar no Drive antes de a execução acabar:
 * turno que terminou em pendência de aprovação ou que faz parte de um run durável.
 */
export const writeNow = (opts: { pending?: boolean; durable?: boolean }): boolean => opts.pending === true || opts.durable === true;

// Borda dos tickets de aprovação: CacheService (validade de 10 min) + trava no `take` para garantir uso único.
import type { Ticket } from './approval';
import type { Tickets } from './chat';

const TTL_S = 600;
const MAX = 95_000; // limite do CacheService é 100 KB por valor

export function cacheTickets(cache = CacheService.getScriptCache(), lock = LockService.getScriptLock()): Tickets {
  return {
    put: (t) => {
      const raw = JSON.stringify(t);
      if (raw.length > MAX) throw new Error('pedido de aprovação grande demais para guardar (conversa longa): tente de novo com algo menor');
      cache.put(`t:${t.token}`, raw, TTL_S);
      if (t.pending.kind === 'ask') cache.put(`ask:${t.session}`, t.token, TTL_S);
    },
    take: (token) => {
      if (!lock.tryLock(10_000)) throw new Error('aprovação ocupada: clique de novo em alguns segundos');
      try {
        const raw = cache.get(`t:${token}`);
        if (!raw) return null;
        cache.remove(`t:${token}`);
        const t = JSON.parse(raw) as Ticket;
        if (t.pending.kind === 'ask') cache.remove(`ask:${t.session}`);
        return t;
      } finally {
        lock.releaseLock();
      }
    },
    open: (session) => cache.get(`ask:${session}`),
  };
}

/** 32 caracteres hex aleatórios (UUID v4 sem hífens). */
export const newToken = (): string => Utilities.getUuid().replace(/-/g, '');

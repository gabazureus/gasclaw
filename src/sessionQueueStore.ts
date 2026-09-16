// Borda da fila das sessões: enfileira nas Script Properties e drena para o Drive.
// Mesmo padrão do lote do trace (fila nas Properties, drenagem no gatilho de 1 min), com fila e teto próprios.
import type { Session } from './session';
import { sessionQueueKey, settleSessions, splitSessionQueue, type SessionEntry } from './sessionQueue';
import { sessionIO } from './sessionStore';

const MAX_ENTRY = 9000; // Property aguenta 9 KB por valor
const folderOf = (key: string): string => key.split(':')[0];
const spaceOf = (key: string): string => key.slice(key.indexOf(':') + 1);

/** Enfileira a conversa para gravação em lote. A última entrada da mesma conversa vence (a fila é por chave). */
export function enqueueSession(key: string, session: Session, props = PropertiesService.getScriptProperties(), now = Date.now()): boolean {
  try {
    const raw = JSON.stringify({ key, at: now, session } satisfies SessionEntry);
    if (raw.length > MAX_ENTRY) return false; // conversa grande demais para a fila: quem chama grava direto
    props.setProperty(sessionQueueKey(key), raw);
    return true;
  } catch (err) {
    console.warn(`fila de sessões: não deu para enfileirar ${key}: ${(err as Error).message}`);
    return false;
  }
}

/** Grava agora, sem fila (pendência de aprovação ou run durável). */
export function writeSessionNow(key: string, session: Session): void {
  sessionIO(folderOf(key)).save(spaceOf(key), session);
}

export type SessionDrainResult = { drained: number; failed: number; ms: number };

/** Drena a fila: grava cada conversa no Drive e tira da fila o que gravou (ou o que esgotou as tentativas). */
export function drainSessions(max = 50, props = PropertiesService.getScriptProperties()): SessionDrainResult {
  const t0 = Date.now();
  const entries = splitSessionQueue(props.getProperties()).slice(0, max);
  if (!entries.length) return { drained: 0, failed: 0, ms: Date.now() - t0 };
  const ok = entries.map((e) => {
    try {
      writeSessionNow(e.key, e.session);
      return true;
    } catch (err) {
      console.warn(`fila de sessões: ${e.key} falhou: ${(err as Error).message}`);
      return false;
    }
  });
  const { remove, retry } = settleSessions(entries, ok);
  for (const k of remove) props.deleteProperty(k);
  for (const e of retry) props.setProperty(sessionQueueKey(e.key), JSON.stringify(e));
  return { drained: ok.filter(Boolean).length, failed: ok.filter((x) => !x).length, ms: Date.now() - t0 };
}

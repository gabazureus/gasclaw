// Lote do trace (ADR-014, decisão de 2026-09-15), núcleo puro. O turno só grava uma entrada pequena na fila
// (Script Properties, ≤ 9 KB); o gatilho de 1 min (ou o fallback) grava as linhas, os JSON e o uso por modelo.
import { redact, summaryRow, type Run } from './trace';
import { recordsOf, type Rec } from './usage';

export const QUEUE_PREFIX = 'Q:';
/** `rowDone`: linha e uso já gravados; falta só o JSON (tentativa `tries`). */
export type QueueEntry = { id: string; at: number; row: (string | number)[]; recs: Rec[]; rowDone?: boolean; tries?: number };
const JSON_TRIES = 3;

/** Depois do lote: sai da fila quem gravou o JSON (ou esgotou as tentativas); o resto volta só para o JSON. */
export function settle(entries: QueueEntry[], codes: number[]): { remove: string[]; retry: QueueEntry[] } {
  const remove: string[] = [];
  const retry: QueueEntry[] = [];
  entries.forEach((e, i) => {
    const tries = (e.tries ?? 0) + 1;
    if (codes[i] < 300 || tries >= JSON_TRIES) remove.push(e.id);
    else retry.push({ ...e, rowDone: true, recs: [], tries });
  });
  return { remove, retry };
}

export function queueEntry(run: Run): QueueEntry {
  return { id: run.id, at: run.endedAt ?? run.startedAt, row: summaryRow(run), recs: recordsOf(redact(run)) };
}

/** Com gatilho ativo quem drena é o gatilho; sem ele, o turno ou a tela drenam se a entrada mais antiga tem > 1 min. */
export const shouldDrain = (oldestAt: number | null, now: number, triggerActive: boolean): boolean =>
  !triggerActive && oldestAt !== null && now - oldestAt > 60_000;

/** Corpo do JSON do run no Drive: o completo do cache; se expirou, a própria entrada da fila (linha e uso não se perdem). */
export const drainBody = (e: QueueEntry, full: string | undefined): string =>
  full ?? JSON.stringify({ ...e, nota: 'JSON completo expirou no cache; só a linha e o uso' });

export function splitQueue(props: Record<string, string>): QueueEntry[] {
  return Object.entries(props)
    .filter(([k]) => k.startsWith(QUEUE_PREFIX))
    .map(([, v]) => JSON.parse(v) as QueueEntry)
    .sort((a, b) => a.at - b.at);
}

// Lote do trace (ADR-014, decisão de 2026-09-15), núcleo puro. O turno só grava uma entrada pequena na fila
// (Script Properties, ≤ 9 KB); o gatilho de 1 min (ou o fallback) grava as linhas, os JSON e o uso por modelo.
import { redact, summaryRow, type Run } from './trace';
import { recordsOf, type Rec } from './usage';

export const QUEUE_PREFIX = 'Q:';
export type QueueEntry = { id: string; at: number; row: (string | number)[]; recs: Rec[] };

export function queueEntry(run: Run): QueueEntry {
  return { id: run.id, at: run.endedAt ?? run.startedAt, row: summaryRow(run), recs: recordsOf(redact(run)) };
}

/** Com gatilho ativo quem drena é o gatilho; sem ele, o turno ou a tela drenam se a entrada mais antiga tem > 1 min. */
export const shouldDrain = (oldestAt: number | null, now: number, triggerActive: boolean): boolean =>
  !triggerActive && oldestAt !== null && now - oldestAt > 60_000;

export function splitQueue(props: Record<string, string>): QueueEntry[] {
  return Object.entries(props)
    .filter(([k]) => k.startsWith(QUEUE_PREFIX))
    .map(([, v]) => JSON.parse(v) as QueueEntry)
    .sort((a, b) => a.at - b.at);
}

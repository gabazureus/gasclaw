// POC P18: quanto a sessão no Drive custa por turno, contra o caminho só de cache. Critério do usuário: ≤ 300 ms a mais.
// Mede no dev com uma sessão de teste, apagada no fim. Núcleo do veredito é puro (p18Verdict), testável offline.
import type { Message } from '../../src/llm';
import * as store from '../../src/store';
import type { Session } from '../../src/session';
import { sessionIO } from '../../src/sessionStore';

export const P18_TARGET_MS = 300;
export type P18Sample = { cacheMs: number; driveMs: number };
export type P18Result = { poc: 'P18'; pass: boolean; turns: number; avgDeltaMs: number; p95DeltaMs: number; targetMs: number; samples: P18Sample[] };

const p95 = (xs: number[]): number => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)] : 0);
const avg = (xs: number[]): number => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** Veredito puro: a diferença por turno (Drive − cache) precisa caber no alvo, na média e no p95. */
export function p18Verdict(samples: P18Sample[], target = P18_TARGET_MS): P18Result {
  const deltas = samples.map((s) => Math.max(0, s.driveMs - s.cacheMs));
  const avgDeltaMs = avg(deltas);
  const p95DeltaMs = p95(deltas);
  return { poc: 'P18', pass: samples.length > 0 && avgDeltaMs <= target && p95DeltaMs <= target, turns: samples.length, avgDeltaMs, p95DeltaMs, targetMs: target, samples };
}

const msg = (i: number): Message => ({ role: i % 2 ? 'assistant' : 'user', content: `turno ${i} `.padEnd(200, 'x') });

/**
 * Mede N turnos: cada turno lê e grava a sessão, uma vez com cache quente e uma vez direto no Drive.
 * A pasta sai do agente padrão no servidor (a CLI só passa id e etapa, como nas outras POCs).
 */
export function pocP18(step?: string, params: Record<string, string> = {}): P18Result | { poc: 'P18'; step: string; pass: boolean; error: string } {
  const folderId = store.listAgents()[0]?.folderId ?? '';
  if (!folderId) return { poc: 'P18', step: step ?? '', pass: false, error: 'nenhum agente cadastrado: abra a tela do gasclaw e cadastre um agente antes de rodar a P18' };
  const turns = Math.min(20, Math.max(3, Number(params.turns) || 10));
  const space = `poc-p18-${Date.now()}`;
  const io = sessionIO(folderId);
  const noCache = sessionIO(folderId, { get: () => null, put: () => {}, remove: () => {} } as unknown as GoogleAppsScript.Cache.Cache);
  const samples: P18Sample[] = [];
  let session: Session = { messages: [] };
  try {
    for (let i = 0; i < turns; i++) {
      session = { ...session, messages: [...session.messages, msg(i)] };
      const t1 = Date.now();
      io.load(space);
      io.save(space, session); // cache quente: é o caminho normal do turno
      const cacheMs = Date.now() - t1;
      const t2 = Date.now();
      noCache.load(space); // cache frio: força a leitura do Drive, como depois das 6 h
      noCache.save(space, session);
      samples.push({ cacheMs, driveMs: Date.now() - t2 });
    }
    return p18Verdict(samples);
  } finally {
    if (step !== 'keep') cleanup(folderId, space);
  }
}

function cleanup(folderId: string, space: string): void {
  try {
    const dir = DriveApp.getFolderById(folderId).getFoldersByName('.gasclaw');
    if (!dir.hasNext()) return;
    const sessions = dir.next().getFoldersByName('sessions');
    if (!sessions.hasNext()) return;
    const it = sessions.next().getFilesByName(`${space.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`);
    if (it.hasNext()) it.next().setTrashed(true);
  } catch (err) {
    console.warn('P18: limpeza falhou', (err as Error).message);
  }
}

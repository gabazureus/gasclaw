// POC P3: mede o custo fixo do gatilho-worker no dev. Cada sonda grava o próprio cronômetro no Cache.
import { newRun } from '../../src/run';
import { runIO } from '../../src/runStore';
import * as store from '../../src/store';
import { P3_FIXED_BUDGET_PCT, P3_IDLE_MAX_MS, P3_WORKER_MAX_MS, isWorkspaceOwner, p3Verdict, projectedFixedMs, type P3Input } from './verdict';

const PARTIAL = 'poc:p3';
const IDLE_REQ = 'poc:p3:drain:req';
const IDLE_RESULT = 'poc:p3:drain:result';
const WORKER_REQ = 'poc:p3:kick:req';
const WORKER_RESULT = 'poc:p3:kick:result';
const SIX_HOURS = 21_600;
const WAKE_MS = 80_000;
const WORKSPACE_TRIGGER_MS = 6 * 3_600_000;

type ReconcileDetail = { propsMs?: number; sweepMs?: number; idsMs?: number; scanMs?: number; ids?: number; qjsonGets?: number };
type Probe = { ok?: boolean; ms?: number; reconcileMs?: number; drainMs?: number; queueMs?: number; reconcile?: ReconcileDetail; runId?: string; status?: string; drained?: { drained?: number }; queued?: number };

const cache = () => CacheService.getScriptCache();
const partial = (): P3Input => JSON.parse(cache().get(PARTIAL) ?? '{}');
const savePartial = (p: P3Input) => cache().put(PARTIAL, JSON.stringify(p), SIX_HOURS);
export function parseP3Probe(raw: string | null): Probe | null {
  try {
    const value = JSON.parse(raw ?? 'null') as Probe | null;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}
const probe = (key: string): Probe | null => parseP3Probe(cache().get(key));

function etapaWorker(): { poc: 'P3'; step: 'worker'; pass: boolean; ms: number | null; completed: boolean } {
  const agent = store.listAgents()[0];
  if (!agent) throw new Error('nenhum agente cadastrado: cadastre um na tela antes de rodar a P3');
  const io = runIO();
  const runId = `p3-worker-${Date.now().toString(36)}`;
  const r = newRun({ runId, session: `${agent.folderId}:poc/p3`, folderId: agent.folderId, user: store.getOwner() ?? '', text: 'responda apenas: ok', now: Date.now() });
  cache().remove(WORKER_RESULT);
  cache().put(WORKER_REQ, runId, SIX_HOURS);
  io.enqueue(r, Date.now());
  Utilities.sleep(WAKE_MS);
  const measured = probe(WORKER_RESULT);
  const after = io.load(agent.folderId, runId);
  const completed = measured?.ok === true && measured.runId === runId && measured.status === 'done' && after?.status === 'done' && after.answer === 'ok';
  const ms = typeof measured?.ms === 'number' ? measured.ms : null;
  io.dequeue(runId);
  if (ms !== null) savePartial({ ...partial(), worker: { ms, completed } });
  return { poc: 'P3', step: 'worker', pass: completed && ms !== null && ms <= P3_WORKER_MAX_MS, ms, completed };
}

function etapaIdle(): { poc: 'P3'; step: 'idle'; pass: boolean; ms: number | null; reconcileMs: number | null; drainMs: number | null; queueMs: number | null; reconcile: ReconcileDetail | null; drained: number | null; queued: number | null } {
  cache().remove(IDLE_RESULT);
  cache().put(IDLE_REQ, '1', SIX_HOURS);
  Utilities.sleep(WAKE_MS);
  const measured = probe(IDLE_RESULT);
  const ms = typeof measured?.ms === 'number' ? measured.ms : null;
  const drained = typeof measured?.drained?.drained === 'number' ? measured.drained.drained : null;
  const queued = typeof measured?.queued === 'number' ? measured.queued : null;
  if (ms !== null && drained !== null && queued !== null) savePartial({ ...partial(), idle: { ms, drained, queued } });
  return {
    poc: 'P3', step: 'idle', pass: measured?.ok === true && ms !== null && ms < P3_IDLE_MAX_MS && drained === 0 && queued === 0,
    ms, reconcileMs: measured?.reconcileMs ?? null, drainMs: measured?.drainMs ?? null, queueMs: measured?.queueMs ?? null, reconcile: measured?.reconcile ?? null, drained, queued,
  };
}

function etapaCota(): { poc: 'P3'; step: 'cota'; pass: boolean; projectedMsPerDay: number; limitMsPerDay: number; fixedPct: number } {
  const p = partial();
  if (!p.worker || !p.idle) throw new Error('rode `./gasclaw poc p3 worker` e `./gasclaw poc p3 idle` antes da cota');
  const owner = (store.getOwner() ?? '').toLowerCase();
  if (!isWorkspaceOwner(owner)) throw new Error('a P3 redesenhada exige Google Workspace');
  const projectedMsPerDay = projectedFixedMs(p.worker.ms, p.idle.ms);
  const limitMsPerDay = WORKSPACE_TRIGGER_MS;
  const fixedPct = (projectedMsPerDay / limitMsPerDay) * 100;
  savePartial({ ...p, quota: { projectedMsPerDay, limitMsPerDay } });
  return { poc: 'P3', step: 'cota', pass: fixedPct <= P3_FIXED_BUDGET_PCT, projectedMsPerDay, limitMsPerDay, fixedPct };
}

export function pocP3(step?: string) {
  if (step === 'reset') {
    cache().remove(PARTIAL);
    cache().remove(IDLE_REQ);
    cache().remove(IDLE_RESULT);
    cache().remove(WORKER_REQ);
    cache().remove(WORKER_RESULT);
    return { poc: 'P3', step, pass: true };
  }
  if (!step || step === 'zero' || step === 'kick' || step === 'worker') return etapaWorker();
  if (step === 'drain' || step === 'vazio' || step === 'idle') return etapaIdle();
  if (step === 'cota') return etapaCota();
  if (step === 'fim') return p3Verdict(partial());
  throw new Error(`etapa desconhecida da P3: ${step}`);
}

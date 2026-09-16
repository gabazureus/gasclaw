import { newRun, pointerOf, type DurableRun } from '../../src/run';
import { runCacheKey, runIO, type RunIO } from '../../src/runStore';
import { pump, type StepDeps } from '../../src/runner';
import * as store from '../../src/store';
import { p4Verdict, type P4Execution, type P4Input } from './verdict';
import { p4SyntheticTurn } from './worker';

const STATE = 'POC:P4:STATE';
const PROTOCOL = 'drive-resume-v1';
const effectProperty = (runId: string) => `POC:P4:EFFECT:${runId}`;
type P4State = Pick<P4Input, 'runId' | 'executions'> & { folderId: string };

const cache = () => CacheService.getScriptCache();
const props = () => PropertiesService.getScriptProperties();
const readState = (): P4State | null => {
  try {
    return JSON.parse(props().getProperty(STATE) ?? 'null') as P4State | null;
  } catch {
    return null;
  }
};
const saveState = (state: P4State) => props().setProperty(STATE, JSON.stringify(state));
const effectCount = (runId: string) => Number(props().getProperty(effectProperty(runId))) || 0;

function reset() {
  const agent = store.listAgents()[0];
  if (!agent) throw new Error('nenhum agente cadastrado: cadastre um na tela antes de rodar a P4');
  const previous = readState();
  if (previous) {
    runIO().dequeue(previous.runId);
    props().deleteProperty(effectProperty(previous.runId));
  }
  const runId = `p4-${Date.now().toString(36)}`;
  const run = newRun({ runId, session: `${agent.folderId}:poc/p4`, folderId: agent.folderId, user: store.getOwner() ?? '', text: 'p4', now: Date.now() });
  runIO().save(run); // P4 tem controle próprio; nunca entra na fila R: do worker real
  saveState({ runId, folderId: agent.folderId, executions: [] });
  return { poc: 'P4', step: 'reset', protocol: PROTOCOL, pass: true, runId };
}

function advance() {
  const state = readState();
  if (!state) throw new Error('rode `./gasclaw poc p4 reset` antes de avançar');
  cache().remove(runCacheKey(state.folderId, state.runId)); // força a fonte da verdade: Drive
  const io = runIO();
  const fromDrive = io.load(state.folderId, state.runId);
  if (!fromDrive) throw new Error(`estado durável do run ${state.runId} não encontrado no Drive`);
  let claimed = false;
  const isolated: RunIO = {
    ...io,
    claimNext: (now) => {
      if (claimed) return null;
      claimed = true;
      return { run: fromDrive, pointer: { ...pointerOf(fromDrive, now), attempts: 1 } };
    },
    enqueue: (run) => io.save(run),
    dequeue: () => undefined,
  };
  const targeted: StepDeps = {
    io: isolated,
    clock: Date.now,
    step: (run: DurableRun) => p4SyntheticTurn(run, () => props().setProperty(effectProperty(run.runId), String(effectCount(run.runId) + 1))),
  };
  const run = pump(targeted, 1, Date.now() + 120_000)[0];
  if (!run) throw new Error(`o run ${state.runId} não estava disponível para esta execução`);
  const execution: P4Execution = { executionId: Utilities.getUuid(), runId: run.runId, status: run.status, ...(run.snapshot ? { snapshotStep: run.snapshot.step } : {}), ...(run.answer ? { answer: run.answer } : {}) };
  saveState({ ...state, executions: [...state.executions, execution] });
  return { poc: 'P4', step: 'advance', pass: true, execution: state.executions.length + 1, ...execution, effectCount: effectCount(run.runId), doneKeys: Object.keys(run.done) };
}

function finish() {
  const state = readState();
  if (!state) throw new Error('rode `./gasclaw poc p4 reset` e três avanços antes do fim');
  cache().remove(runCacheKey(state.folderId, state.runId));
  const run = runIO().load(state.folderId, state.runId);
  if (!run) throw new Error(`estado durável do run ${state.runId} não encontrado no Drive`);
  const result = p4Verdict({ runId: state.runId, executions: state.executions, effectCount: effectCount(state.runId), doneKeys: Object.keys(run.done) });
  props().deleteProperty(STATE);
  props().deleteProperty(effectProperty(state.runId));
  return result;
}

export function pocP4(step?: string) {
  if (step === 'protocol') return { poc: 'P4', step, protocol: PROTOCOL, pass: true };
  if (step === 'reset') return reset();
  if (step === 'advance' || step === 'step') return advance();
  if (step === 'fim' || step === 'finish') return finish();
  throw new Error('etapa desconhecida da P4: use protocol, reset, advance ou fim');
}

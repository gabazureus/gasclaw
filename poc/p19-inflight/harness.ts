import { runTurn } from '../../src/agent';
import { markInflight, newRun, type DurableRun } from '../../src/run';
import { runCacheKey, runIO } from '../../src/runStore';
import { pump, type StepDeps } from '../../src/runner';
import * as store from '../../src/store';
import type { Tool } from '../../src/tools/registry';
import { p19Verdict } from './verdict';

const STATE = 'POC:P19:STATE';
const PROTOCOL = 'inflight-crash-v1';
const FORCED_DEATH = 'P19: morte forçada depois do efeito';
const effectProperty = (runId: string) => `POC:P19:EFFECT:${runId}`;
const stepProperty = (runId: string) => `POC:P19:STEP:${runId}`;
type P19State = { runId: string; folderId: string };

const cache = () => CacheService.getScriptCache();
const props = () => PropertiesService.getScriptProperties();
const count = (key: string) => Number(props().getProperty(key)) || 0;
const bump = (key: string) => props().setProperty(key, String(count(key) + 1));
const readState = (): P19State | null => {
  try {
    return JSON.parse(props().getProperty(STATE) ?? 'null') as P19State | null;
  } catch {
    return null;
  }
};

function reset() {
  const agent = store.listAgents()[0];
  if (!agent) throw new Error('nenhum agente cadastrado: cadastre um na tela antes de rodar a P19');
  const previous = readState();
  if (previous) {
    runIO().dequeue(previous.runId);
    props().deleteProperty(effectProperty(previous.runId));
    props().deleteProperty(stepProperty(previous.runId));
  }
  const runId = `p19-${Date.now().toString(36)}`;
  const run = newRun({ runId, session: `${agent.folderId}:poc/p19`, folderId: agent.folderId, user: store.getOwner() ?? '', text: 'p19', now: Date.now() });
  runIO().save(run);
  props().setProperty(STATE, JSON.stringify({ runId, folderId: agent.folderId }));
  return { poc: 'P19', step: 'reset', protocol: PROTOCOL, pass: true, runId };
}

/** Esta execução aborta de propósito dentro do turno real: efeito ocorreu, mas `runTurn` nunca devolveu o checkpoint. */
function crash(): never {
  const state = readState();
  if (!state) throw new Error('rode `./gasclaw poc p19 reset` antes da morte');
  cache().remove(runCacheKey(state.folderId, state.runId));
  const io = runIO();
  const run = io.load(state.folderId, state.runId);
  if (!run) throw new Error(`estado durável do run ${state.runId} não encontrado no Drive`);
  const effect: Tool = {
    name: 'gmail.send',
    description: 'efeito sintético contado pela P19',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    approval: 'never',
    run: (_args, ctx) => (ctx.beforeEffect?.(), bump(effectProperty(run.runId)), 'efeito-p19-ok'),
  };
  let llmCalls = 0;
  runTurn({
    system: 'POC P19', history: [], text: 'execute', tools: [effect],
    ctx: { now: () => '', ownerDm: true, memory: { read: () => '', write: () => undefined } },
    llm: () => {
      if (llmCalls++ === 0) return { text: '', toolCalls: [{ id: 'p19-call', type: 'function', function: { name: effect.name, arguments: '{}' } }] };
      throw new Error(FORCED_DEATH);
    },
    runId: run.runId, steps: 2, deadlineMs: Date.now() + 120_000, clock: Date.now,
    beforeEffect: (name) => io.save(markInflight(run, name, Date.now())),
  });
  throw new Error('P19: o turno deveria ter morrido depois do efeito');
}

function resume() {
  const state = readState();
  if (!state) throw new Error('rode reset e crash antes da retomada');
  cache().remove(runCacheKey(state.folderId, state.runId));
  const io = runIO();
  const fromDrive = io.load(state.folderId, state.runId);
  if (!fromDrive) throw new Error(`estado durável do run ${state.runId} não encontrado no Drive`);
  io.enqueue(fromDrive, Date.now());
  const targeted = {
    ...io,
    claimNext: (now: number) => io.claimById(state.runId, now),
  };
  const deps: StepDeps = {
    io: targeted,
    clock: Date.now,
    step: (_run: DurableRun) => {
      bump(stepProperty(state.runId));
      bump(effectProperty(state.runId));
      throw new Error('a retomada repetiu o passo que estava em voo');
    },
  };
  const run = pump(deps, 1, Date.now() + 120_000)[0];
  if (!run) throw new Error(`o run ${state.runId} não estava disponível para retomada`);
  return { poc: 'P19', step: 'resume', pass: run.status === 'failed', status: run.status, answer: run.answer, effectCount: count(effectProperty(run.runId)), stepCalls: count(stepProperty(run.runId)) };
}

function finish() {
  const state = readState();
  if (!state) throw new Error('rode reset, crash e resume antes do fim');
  cache().remove(runCacheKey(state.folderId, state.runId));
  const run = runIO().load(state.folderId, state.runId);
  if (!run) throw new Error(`estado durável do run ${state.runId} não encontrado no Drive`);
  const result = p19Verdict({
    effectCount: count(effectProperty(state.runId)),
    inflightName: run.inflight?.name,
    doneKeys: Object.keys(run.done),
    resumedStatus: run.status,
    stepCalls: count(stepProperty(state.runId)),
    answer: run.answer,
  });
  props().deleteProperty(STATE);
  props().deleteProperty(effectProperty(state.runId));
  props().deleteProperty(stepProperty(state.runId));
  return result;
}

export function pocP19(step?: string) {
  if (step === 'protocol') return { poc: 'P19', step, protocol: PROTOCOL, pass: true };
  if (step === 'reset') return reset();
  if (step === 'crash') return crash();
  if (step === 'resume') return resume();
  if (step === 'fim' || step === 'finish') return finish();
  throw new Error('etapa desconhecida da P19: use protocol, reset, crash, resume ou fim');
}

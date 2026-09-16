// Pump do run durável (ADR-005, F2): **um passo por execução**.
//
// A unidade durável é o passo, como no Eve: uma volta do laço termina, o estado vai para o Drive, e a execução pode
// morrer em seguida sem prejuízo — a próxima retoma exatamente dali. O gatilho de 1 min chama este worker; a P3
// mede se o trabalho cabe na cota diária de gatilhos do Workspace.
import { afterFailure, afterStep, charge, interrupted, isOpen, MAX_ATTEMPTS, type DurableRun } from './run';
import type { RunIO } from './runStore';
import type { TurnResult } from './agent';

/** O que um passo devolveu: o turno e quanto ele custou (o custo vem do trace, que já mede por chamada). */
export type StepOutcome = { turn: TurnResult; usd?: number };

export type StepDeps = {
  io: RunIO;
  /** Monta e roda um turno a partir do run (agente, tools, LLM). A ligação com o Chat mora no main.ts. */
  step: (r: DurableRun) => StepOutcome;
  clock: () => number;
};

/** Grava o desfecho: quem continua volta para a fila, quem terminou (ou espera o usuário) sai dela. */
function settle(d: StepDeps, r: DurableRun, progressed: boolean): DurableRun {
  if (isOpen(r.status)) d.io.enqueue(r, d.clock(), progressed);
  else {
    d.io.save(r);
    d.io.dequeue(r.runId);
  }
  return r;
}

/**
 * Uma volta do pump: pega um run, dá **um** passo nele e grava. Devolve o run tocado, ou `null` se não havia trabalho.
 * Tudo que pode demorar (Drive, LLM) roda fora da trava; a trava cobre só a reivindicação, lá no `claimNext`.
 */
export function pumpOnce(d: StepDeps): DurableRun | null {
  const now = d.clock();
  const c = d.io.claimNext(now);
  if (!c) return null;
  return runClaim(d, c, now);
}

/** Retoma exatamente o run decidido pelo usuário; nunca consome outro ponteiro da fila. */
export function pumpById(d: StepDeps, runId: string): DurableRun | null {
  const now = d.clock();
  const c = d.io.claimById(runId, now);
  return c ? runClaim(d, c, now) : null;
}

function runClaim(d: StepDeps, c: { pointer: import('./run').RunPointer; run: DurableRun; exhausted?: true }, now: number): DurableRun {

  // Gastou as tentativas: não trabalha mais, só conta ao usuário que não deu (a fila já o soltou).
  if (c.exhausted) return settle(d, afterFailure(c.run, c.run.error ?? 'não consegui completar depois de várias tentativas', MAX_ATTEMPTS, now), false);

  // A execução anterior morreu com uma tool de efeito em voo. Não dá para saber se o e-mail saiu: não repete.
  if (c.run.inflight) return settle(d, interrupted(c.run), false);

  // Ponteiro de um run que já acabou ou foi esperar o usuário (corrida entre o clique e o pump): só limpa a fila.
  if (!isOpen(c.run.status)) return settle(d, c.run, false);

  try {
    const o = d.step(c.run);
    return settle(d, afterStep(charge(c.run, o.usd ?? 0), o.turn, d.clock()), true);
  } catch (err) {
    // O passo pode ter persistido `inflight` e só então falhado (por exemplo, o LLM caiu depois do envio).
    // Recarregar evita que a cópia reivindicada antes do efeito apague essa marca e permita uma repetição.
    const latest = d.io.load(c.run.folderId, c.run.runId) ?? c.run;
    if (latest.inflight) return settle(d, interrupted(latest), false);
    // Falha do passo: volta para a fila enquanto restar tentativa; o `attempts` do ponteiro é quem conta.
    return settle(d, afterFailure(latest, (err as Error).message, c.pointer.attempts, d.clock()), false);
  }
}

/** Uma execução do pump pode dar vários passos enquanto houver tempo: cada um já ficou durável antes do próximo. */
export function pump(d: StepDeps, maxSteps: number, deadlineMs: number): DurableRun[] {
  const touched: DurableRun[] = [];
  for (let i = 0; i < maxSteps && d.clock() < deadlineMs; i++) {
    const r = pumpOnce(d);
    if (!r) break;
    touched.push(r);
  }
  return touched;
}

// Run durável (ADR-005, F2), núcleo puro: um turno que sobrevive à morte da execução.
//
// O Apps Script mata a execução em 6 min e o evento do Chat em 30 s. Um turno longo (várias chamadas ao modelo,
// uma aprovação que espera o usuário) não cabe numa execução só. A saída é a mesma do Eve: o turno vira uma série
// de *passos*, cada passo termina num checkpoint durável, e um passo já concluído nunca roda de novo.
//
// Divisão: aqui só decisões puras (o que reivindicar, onde parou, quanto gastou, o que fazer a seguir).
// A borda (runStore.ts) guarda o estado no Drive e o ponteiro na fila das Script Properties.
import type { Decision, Pending, Snapshot, TurnResult } from './agent';

/** Prefixo próprio na fila das Script Properties: separado do `Q:` do trace (perder trace custa um log; perder run custa a resposta). */
export const RUN_PREFIX = 'R:';
/** Uma execução do Apps Script morre em 6 min: passado isso, quem reivindicou não volta mais. */
export const LEASE_MS = 360_000;
/** Depois de 4 tentativas o run para de tentar e vira falha honesta, em vez de repetir efeito para sempre. */
export const MAX_ATTEMPTS = 4;
/** Teto de custo por run (decisão do usuário, 2026-09-15): ao cruzar, o run para e oferece continuar. */
export const RUN_BUDGET_USD = 0.1;

export type RunStatus = 'queued' | 'running' | 'waiting' | 'paused' | 'done' | 'failed';

/**
 * Ponteiro na fila: só o mínimo para achar e reivindicar o run (Script Properties tem 9 KB por valor).
 * O estado grande mora no Drive; aqui fica o endereço, o lease e as tentativas.
 */
export type RunPointer = {
  runId: string;
  folderId: string;
  session: string;
  at: number;
  attempts: number;
  leaseUntil?: number;
};

/** Uma tool com efeito que começou e não se sabe se terminou (a execução morreu no meio). */
export type Inflight = { name: string; at: number };

/**
 * O run no Drive. É o `Snapshot` do turno mais o que precisa atravessar execuções — sem tipo novo de estado:
 * `snapshot`, `pending` e `decision` são os mesmos do `agent.ts`, para as duas pistas costurarem no mesmo contrato.
 */
export type DurableRun = {
  runId: string;
  session: string;
  folderId: string;
  user: string;
  text: string;
  status: RunStatus;
  snapshot?: Snapshot;
  pending?: Pending;
  decision?: Decision;
  done: Record<string, string>;
  granted: string[];
  inflight?: Inflight;
  budget: { usedUsd: number; capUsd: number };
  answer?: string;
  error?: string;
  startedAt: number;
  updatedAt: number;
};

export const newRun = (i: { runId: string; session: string; folderId: string; user: string; text: string; now: number; capUsd?: number }): DurableRun => ({
  runId: i.runId,
  session: i.session,
  folderId: i.folderId,
  user: i.user.toLowerCase(),
  text: i.text,
  status: 'queued',
  done: {},
  granted: [],
  budget: { usedUsd: 0, capUsd: i.capUsd ?? RUN_BUDGET_USD },
  startedAt: i.now,
  updatedAt: i.now,
});

export const pointerOf = (r: DurableRun, now: number): RunPointer => ({ runId: r.runId, folderId: r.folderId, session: r.session, at: now, attempts: 0 });

/** Um run só é trabalho para o pump enquanto não terminou; `waiting` espera o usuário, não o pump. */
export const isOpen = (s: RunStatus): boolean => s === 'queued' || s === 'running';

// ---------- fila ----------

/** Fila das Script Properties → ponteiros, em ordem de chegada. Uma entrada corrompida é ignorada, não trava a fila. */
export function splitRunQueue(props: Record<string, string>): RunPointer[] {
  return Object.entries(props)
    .filter(([k]) => k.startsWith(RUN_PREFIX))
    .flatMap(([k, v]) => {
      const p = parsePointer(v);
      if (!p) console.warn(`fila de runs: entrada ${k} corrompida, ignorada`);
      return p ? [p] : [];
    })
    .sort((a, b) => a.at - b.at);
}

function parsePointer(raw: string): RunPointer | null {
  try {
    const o = JSON.parse(raw) as Partial<RunPointer>;
    if (typeof o.runId !== 'string' || !o.runId || typeof o.folderId !== 'string' || !o.folderId) return null;
    return { runId: o.runId, folderId: o.folderId, session: String(o.session ?? ''), at: Number(o.at) || 0, attempts: Number(o.attempts) || 0, ...(o.leaseUntil ? { leaseUntil: Number(o.leaseUntil) } : {}) };
  } catch {
    return null;
  }
}

export const queueKey = (runId: string): string => `${RUN_PREFIX}${runId}`;

/** Lease vencido = a execução que reivindicou morreu (o teto do Apps Script é 6 min, então não há volta). */
export const leaseExpired = (p: RunPointer, now: number): boolean => !p.leaseUntil || p.leaseUntil <= now;

/** Esgotou as tentativas: para de tentar em vez de repetir efeito para sempre. */
export const exhausted = (p: RunPointer): boolean => p.attempts >= MAX_ATTEMPTS;

export type Claim = { ok: true; pointer: RunPointer } | { ok: false; reason: 'ocupado' | 'esgotado' };

/**
 * Reivindica um ponteiro: marca o lease e conta a tentativa. Só isto precisa de trava — o corpo do passo roda solto,
 * porque segurar a ScriptLock por minutos travaria o lote do trace e o resto do gasclaw junto.
 */
export function claim(p: RunPointer, now: number): Claim {
  if (!leaseExpired(p, now)) return { ok: false, reason: 'ocupado' };
  if (exhausted(p)) return { ok: false, reason: 'esgotado' };
  return { ok: true, pointer: { ...p, attempts: p.attempts + 1, leaseUntil: now + LEASE_MS } };
}

/** O próximo run a trabalhar: o mais antigo que dá para reivindicar agora. */
export function nextClaimable(queue: RunPointer[], now: number): RunPointer | null {
  return queue.find((p) => leaseExpired(p, now) && !exhausted(p)) ?? null;
}

/**
 * O próximo run de que se deve desistir: gastou as tentativas e não tem execução de pé.
 * Sem isto o ponteiro esgotado fica na fila para sempre (lixo nas Properties) e o run fica eternamente "trabalhando"
 * na tela — o pump precisa pegá-lo uma última vez, só para contar ao usuário que não deu.
 */
export const nextExhausted = (queue: RunPointer[], now: number): RunPointer | null =>
  queue.find((p) => exhausted(p) && leaseExpired(p, now)) ?? null;

// ---------- orçamento ----------

export const remainingUsd = (r: DurableRun): number => Math.max(0, r.budget.capUsd - r.budget.usedUsd);
export const overBudget = (r: DurableRun): boolean => r.budget.usedUsd >= r.budget.capUsd;

export const charge = (r: DurableRun, usd: number): DurableRun =>
  usd > 0 ? { ...r, budget: { ...r.budget, usedUsd: r.budget.usedUsd + usd } } : r;

const money = (n: number) => `US$ ${n.toFixed(2)}`;
export const budgetNotice = (r: DurableRun): string =>
  `Parei em ${money(r.budget.usedUsd)}, no teto de ${money(r.budget.capUsd)} desta tarefa. Quer que eu continue?`;

/** Continuar depois do teto: o usuário estende o teto, e o run volta para a fila de onde parou. */
export const extendBudget = (r: DurableRun, moreUsd = RUN_BUDGET_USD, now = r.updatedAt): DurableRun =>
  r.status === 'paused' ? { ...r, status: 'queued', budget: { ...r.budget, capUsd: r.budget.capUsd + moreUsd }, answer: undefined, updatedAt: now } : r;

// ---------- efeito em voo (idempotência entre execuções) ----------

/** Tools cujo nome indica efeito no mundo: repetir uma destas manda e-mail duas vezes, cria evento duas vezes. */
export const EFFECT = /\.(create|update|draft|send|append|complete|save|remove)$/;
export const hasEffect = (name: string): boolean => EFFECT.test(name);

/** Checkpoint estreito, gravado imediatamente antes da chamada com efeito. */
export const markInflight = (r: DurableRun, name: string, now: number): DurableRun =>
  ({ ...r, inflight: { name, at: now }, updatedAt: now });

/**
 * A execução morreu com uma tool de efeito em voo. Não dá para saber se o e-mail saiu, então o run **não** repete:
 * conta o que houve e devolve a decisão ao usuário. Honestidade acima de conveniência (mesma regra do `failureNotice`).
 */
export const uncertainNotice = (f: Inflight): string =>
  `Comecei ${f.name} e a execução caiu antes de eu confirmar o resultado. Não vou repetir, para não fazer duas vezes: confira e me diga se refaço.`;

export const interrupted = (r: DurableRun): DurableRun =>
  r.inflight ? { ...r, status: 'failed', answer: uncertainNotice(r.inflight), error: `efeito em voo: ${r.inflight.name}` } : r;

// ---------- passo ----------

/** Junta o resultado de um turno ao run: onde parou, o que já rodou, o que ele deve, e o que a tela mostra. */
export function afterStep(r: DurableRun, turn: TurnResult, now: number): DurableRun {
  const base: DurableRun = { ...r, done: { ...r.done, ...turn.done }, granted: turn.granted, inflight: undefined, updatedAt: now };
  if (turn.pending && turn.state) return { ...base, status: 'waiting', pending: turn.pending, decision: undefined, snapshot: turn.state, answer: turn.text };
  if (turn.stopped && turn.state) {
    // parou por tempo ou por passos com estado: não é fim, é checkpoint — o pump continua de onde parou (635000a)
    if (overBudget(base)) return { ...base, status: 'paused', snapshot: turn.state, answer: budgetNotice(base) };
    return { ...base, status: 'queued', snapshot: turn.state, pending: undefined, decision: undefined, answer: undefined };
  }
  return { ...base, status: 'done', snapshot: undefined, pending: undefined, decision: undefined, answer: turn.text };
}

/** Falha do passo: volta para a fila enquanto restar tentativa; esgotada, vira falha honesta na tela. */
export function afterFailure(r: DurableRun, err: string, attempts: number, now: number): DurableRun {
  const last = attempts >= MAX_ATTEMPTS;
  return { ...r, status: last ? 'failed' : 'queued', error: err, ...(last ? { answer: `Não consegui terminar: ${err}` } : {}), updatedAt: now };
}

/** A resposta do usuário (aprovar, negar, responder um `ask`) entra no run e o devolve à fila. */
export const withDecision = (r: DurableRun, d: Decision, now: number): DurableRun =>
  r.status === 'waiting' && r.snapshot ? { ...r, status: 'queued', decision: d, answer: undefined, updatedAt: now } : r;

/**
 * Como o turno é retomado: o `Snapshot` guardado, com a decisão do usuário **se houver uma**.
 *
 * Sem decisão é o caso do run que parou por tempo ou por limite de passos: não há nada pendente, e é justamente por
 * isso que a decisão não pode ser inventada — um `{ approved: true }` de fachada faria a próxima ferramenta pular o
 * card de aprovação e entrar em `granted`. Retomar sem decisão faz o turno voltar a pedir aprovação, como deve.
 */
export const resumeOf = (r: DurableRun): (Snapshot & { decision?: Decision }) | undefined =>
  r.snapshot ? { ...r.snapshot, ...(r.decision ? { decision: r.decision } : {}) } : undefined;

/** O que a tela mostra agora, sem precisar entender o modelo de estado. */
export const view = (r: DurableRun): { status: RunStatus; text: string; spent: string; waiting: boolean } => ({
  status: r.status,
  text: r.answer ?? (r.status === 'failed' ? `Não consegui terminar: ${r.error ?? 'erro desconhecido'}` : 'Trabalhando…'),
  spent: money(r.budget.usedUsd),
  waiting: r.status === 'waiting' || r.status === 'paused',
});

/** Run vindo do Drive (arquivo editável pelo dono): aceita só o que tem forma de run, como `parseSession`. */
export function parseRun(raw: string | null | undefined): DurableRun | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<DurableRun>;
    if (typeof o.runId !== 'string' || !o.runId || typeof o.folderId !== 'string' || !o.folderId) return null;
    const status: RunStatus = ['queued', 'running', 'waiting', 'paused', 'done', 'failed'].includes(String(o.status)) ? (o.status as RunStatus) : 'queued';
    return {
      runId: o.runId,
      folderId: o.folderId,
      session: String(o.session ?? ''),
      user: String(o.user ?? '').toLowerCase(),
      text: String(o.text ?? ''),
      status,
      ...(o.snapshot && Array.isArray(o.snapshot.messages) ? { snapshot: o.snapshot } : {}),
      ...(o.pending ? { pending: o.pending } : {}),
      ...(o.decision ? { decision: o.decision } : {}),
      done: o.done && typeof o.done === 'object' ? (o.done as Record<string, string>) : {},
      granted: Array.isArray(o.granted) ? o.granted.filter((g): g is string => typeof g === 'string') : [],
      ...(o.inflight && typeof o.inflight.name === 'string' ? { inflight: { name: o.inflight.name, at: Number(o.inflight.at) || 0 } } : {}),
      budget: { usedUsd: Number(o.budget?.usedUsd) || 0, capUsd: Number(o.budget?.capUsd) || RUN_BUDGET_USD },
      ...(typeof o.answer === 'string' ? { answer: o.answer } : {}),
      ...(typeof o.error === 'string' ? { error: o.error } : {}),
      startedAt: Number(o.startedAt) || 0,
      updatedAt: Number(o.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

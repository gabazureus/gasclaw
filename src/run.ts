// Run durável (ADR-005, F2), núcleo puro: um turno que sobrevive à morte da execução.
//
// O Apps Script mata a execução em 6 min e o evento do Chat em 30 s. Um turno longo (várias chamadas ao modelo,
// uma aprovação que espera o usuário) não cabe numa execução só. A saída é a mesma do Eve: o turno vira uma série
// de *passos*, cada passo termina num checkpoint durável, e um passo já concluído nunca roda de novo.
//
// Divisão: aqui só decisões puras (o que reivindicar, onde parou, quanto gastou, o que fazer a seguir).
// A borda (runStore.ts) guarda o estado no Drive e o ponteiro na fila das Script Properties.
import type { Decision, Pending, Snapshot, TurnResult } from './agent';
import type { ApprovalGrant } from './approval';
import { parseChatDelivery, type ChatDelivery } from './chatDelivery';

/** Prefixo próprio na fila das Script Properties: separado do `Q:` do trace (perder trace custa um log; perder run custa a resposta). */
export const RUN_PREFIX = 'R:';
/**
 * Registro de autoridade do run (ADR-029), nas Script Properties.
 *
 * Separado do ponteiro `R:` de propósito: o ponteiro morre quando o run sai da fila para esperar o usuário,
 * e é justamente aí — enquanto uma aprovação fica pendente — que o atacante tem mais tempo para editar o
 * arquivo na pasta compartilhada. A autoridade precisa viver enquanto o RUN viver, não enquanto a fila viver.
 */
export const AUTH_PREFIX = 'A:';
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
  /** Hora marcada: antes dela o ponteiro nao e reivindicavel. Esperar a hora nao e trabalho nem falha. */
  notBefore?: number;
};

/**
 * O que o gasclaw sabe sobre um run sem precisar acreditar no arquivo dele.
 *
 * `space`/`thread`: para onde a resposta pode ir, fixado na criação (imutável durante o run).
 * `auth`: assinatura dos campos de autoridade do estado que NÓS gravamos por último (muda a cada passo).
 */
export type RunAuthority = { space?: string; thread?: string; auth: string };

export const authKey = (runId: string): string => `${AUTH_PREFIX}${runId}`;

/**
 * Campos do run que NÃO entram na assinatura, cada um com motivo. Tudo o mais entra: o padrão é
 * "verifica", para um campo novo nascer protegido em vez de nascer esquecido três meses depois.
 */
export const RUN_UNSIGNED_FIELDS = [
  'delivery', // muda por `save` fora do enqueue (recibo, desistência); o DESTINO é protegido por `space`/`thread` acima
  'inflight', // gravado por `beforeEffect` no meio do passo, fora do enqueue
  'updatedAt', // carimbo desses mesmos saves fora de banda
] as const;

/**
 * String canônica dos campos de autoridade, para a borda assinar.
 *
 * Normaliza pelo MESMO `parseRun` dos dois lados antes de serializar: a assinatura não pode depender de
 * ordem de chave nem de coerção de número, senão uma diferença inócua viraria recusa de um run legítimo.
 */
export function runAuthority(r: DurableRun): string {
  const normal = parseRun(JSON.stringify(r)) ?? r;
  const pular = new Set<string>(RUN_UNSIGNED_FIELDS);
  const campos = Object.keys(normal).filter((k) => !pular.has(k)).sort();
  return JSON.stringify(campos.map((k) => [k, (normal as unknown as Record<string, unknown>)[k]]));
}

/** Acabou de vez: respondeu (ou falhou) e não há entrega pendente. Só aqui a autoridade pode ser esquecida. */
export const isFinished = (r: DurableRun): boolean =>
  (r.status === 'done' || r.status === 'failed') && r.delivery?.status !== 'pending';

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
  /** Origem do turno: só true libera memória privada na retomada. Runs antigos falham fechados. */
  ownerDm: boolean;
  text: string;
  status: RunStatus;
  snapshot?: Snapshot;
  pending?: Pending;
  approval?: ApprovalGrant;
  decision?: Decision;
  done: Record<string, string>;
  granted: string[];
  inflight?: Inflight;
  /**
   * Sub-agente corrente (ADR-039/040 §D). **Precisa existir aqui, e não só em memória:** `parseRun`
   * tem whitelist, e campo fora dela é DESCARTADO na volta do Drive. Um `depth` numérico ausente
   * voltaria como 0 — o valor permissivo —, e a profundidade 1 morreria no primeiro checkpoint,
   * justamente no cenário que o run durável existe para atender.
   */
  subagent?: string;
  /**
   * Qual AGENTE originou este run, quando ele nasceu de uma mensagem de outro agente (ADR-040 §A).
   *
   * Está aqui, e não em memória, porque precisa ser ASSINADO: campo fora do `RUN_UNSIGNED_FIELDS` entra
   * na assinatura por padrão, e é isso que impede alguém com acesso à pasta de apagar a origem para o run
   * passar por pedido do dono. Ausente = o dono pediu; presente = terceiro pediu, e `isOwner` cai.
   */
  originAgent?: string;
  /**
   * Run que NINGUÉM pediu: nasceu da agenda do painel, não de uma mensagem.
   *
   * Vai ASSINADO (não está em `RUN_UNSIGNED_FIELDS`) porque é ele que decide duas coisas: quais
   * ferramentas podem ser auto-aprovadas, e o que fazer quando uma precisa de clique. Um campo que se
   * pudesse apagar editando o arquivo transformaria um run não supervisionado num run comum.
   */
  proactive?: boolean;
  /**
   * SHA-256 do candidato (e do placar) que o card está propondo (ADR-040 §B). O arquivo mora fora
   * do run; sem o selo aqui — onde a assinatura o protege — trocar o `.md` durante as 24 h do card
   * mantém o run íntegro e o dono aprova o diff de ontem promovendo o texto de hoje.
   */
  candidateSeal?: string;
  delivery?: ChatDelivery;
  budget: { usedUsd: number; capUsd: number };
  answer?: string;
  error?: string;
  startedAt: number;
  updatedAt: number;
};

export const newRun = (i: { runId: string; session: string; folderId: string; user: string; text: string; now: number; ownerDm?: boolean; capUsd?: number; delivery?: ChatDelivery; originAgent?: string; proactive?: boolean }): DurableRun => ({
  runId: i.runId,
  session: i.session,
  folderId: i.folderId,
  user: i.user.toLowerCase(),
  ownerDm: i.ownerDm === true,
  text: i.text,
  status: 'queued',
  done: {},
  granted: [],
  ...(i.delivery ? { delivery: i.delivery } : {}),
  // ADR-040 §A: quem ORIGINOU o run, quando ele nasceu de mensagem de outro agente. Vai ASSINADO
  // (`RUN_UNSIGNED_FIELDS` não o contém), então não dá para apagá-lo editando o arquivo do run —
  // e é exatamente esse apagamento que transformaria um run de terceiro num run do dono.
  ...(i.originAgent ? { originAgent: i.originAgent } : {}),
  ...(i.proactive ? { proactive: true } : {}),
  budget: { usedUsd: 0, capUsd: i.capUsd ?? RUN_BUDGET_USD },
  startedAt: i.now,
  updatedAt: i.now,
});

export const pointerOf = (r: DurableRun, now: number): RunPointer => ({
  runId: r.runId,
  folderId: r.folderId,
  session: r.session,
  at: now,
  attempts: 0,
  // Entrega agendada para o futuro: o pump nao deve girar em falso ate a hora chegar (regressao da P2).
  ...(r.delivery?.status === 'pending' && Number.isFinite(r.delivery.notBefore) ? { notBefore: r.delivery.notBefore } : {}),
});

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
    return { runId: o.runId, folderId: o.folderId, session: String(o.session ?? ''), at: Number(o.at) || 0, attempts: Number(o.attempts) || 0, ...(o.leaseUntil ? { leaseUntil: Number(o.leaseUntil) } : {}), ...(o.notBefore ? { notBefore: Number(o.notBefore) } : {}) };
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

/** Chegou a hora? Ponteiro sem `notBefore` esta sempre pronto. */
export const due = (p: RunPointer, now: number): boolean => !p.notBefore || p.notBefore <= now;

/** O próximo run a trabalhar: o mais antigo que dá para reivindicar agora e cuja hora já chegou. */
export function nextClaimable(queue: RunPointer[], now: number): RunPointer | null {
  return queue.find((p) => leaseExpired(p, now) && !exhausted(p) && due(p, now)) ?? null;
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
      ownerDm: o.ownerDm === true,
      text: String(o.text ?? ''),
      status,
      ...(o.snapshot && Array.isArray(o.snapshot.messages) ? { snapshot: o.snapshot } : {}),
      ...(o.pending ? { pending: o.pending } : {}),
      ...(o.approval && typeof o.approval === 'object' ? { approval: o.approval } : {}),
      ...(o.decision ? { decision: o.decision } : {}),
      done: o.done && typeof o.done === 'object' ? (o.done as Record<string, string>) : {},
      granted: Array.isArray(o.granted) ? o.granted.filter((g): g is string => typeof g === 'string') : [],
      ...(o.inflight && typeof o.inflight.name === 'string' ? { inflight: { name: o.inflight.name, at: Number(o.inflight.at) || 0 } } : {}),
      ...(typeof o.subagent === 'string' && o.subagent ? { subagent: o.subagent } : {}),
      // Fora da whitelist o campo seria DESCARTADO na volta do Drive — e um run relaído voltaria como
      // run do dono. É o mesmo defeito do `depth` (§D), que aqui seria catastrófico em vez de só permissivo.
      ...(typeof o.originAgent === 'string' && o.originAgent ? { originAgent: o.originAgent } : {}),
      // Só o `true` LITERAL sobrevive: qualquer outra coisa (string 'true', 1, objeto) vira ausente.
      // Errar para "não é proativo" é errar para o lado em que o motor PERGUNTA em vez de assumir.
      ...(o.proactive === true ? { proactive: true } : {}),
      ...(typeof o.candidateSeal === 'string' && o.candidateSeal ? { candidateSeal: o.candidateSeal } : {}),
      ...(parseChatDelivery(o.delivery) ? { delivery: parseChatDelivery(o.delivery) } : {}),
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

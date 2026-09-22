// Pump do run durável (ADR-005, F2): **um passo por execução**.
//
// A unidade durável é o passo, como no Eve: uma volta do laço termina, o estado vai para o Drive, e a execução pode
// morrer em seguida sem prejuízo — a próxima retoma exatamente dali. O gatilho de 1 min chama este worker; a P3
// mede se o trabalho cabe na cota diária de gatilhos do Workspace.
import { afterFailure, afterStep, charge, interrupted, isFinished, isOpen, MAX_ATTEMPTS, waitKey, type DurableRun } from './run';
import { deliveryGivenUp } from './chatDelivery';
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

/**
 * Grava o desfecho: quem continua volta para a fila, quem terminou (ou espera o usuário) sai dela.
 *
 * A entrega só segura na fila um run TERMINAL, porque só `done`/`failed` chegam a ficar `due` (`deliveryDue`).
 * Segurar também `waiting`/`paused` travava a fila inteira: eles esperam o usuário, nunca ficam due, e como
 * `enqueue` limpa o lease e preserva o `at`, o mesmo run voltava a ser o mais antigo reivindicável a cada
 * volta — o pump só pegava ele, e nenhuma outra mensagem do Chat era atendida. Sair da fila é seguro: o
 * `io.decide` recoloca o ponteiro assim que o usuário responde. A exceção é a espera do Chat cujo cartão
 * ainda não saiu (abaixo): ela fica só até o cartão ser postado.
 */
function settle(d: StepDeps, r: DurableRun, progressed: boolean): DurableRun {
  // Um run do Chat que parou esperando o dono fica na fila ATÉ o cartão dele sair (incidente de 2026-09-21):
  // sem isto, um POST que falhasse deixava a espera fora da fila e sem cartão, para sempre. O ponteiro fica
  // com o ARRENDAMENTO deste claim: outra execução do gatilho não o pega enquanto o cartão sai (seriam dois
  // cartões, e o segundo invalidaria a credencial do primeiro). O cartão sai no `after` e o run deixa a fila;
  // se qualquer coisa falhar, o arrendamento vence em LEASE_MS e o próximo claim tenta de novo — uma
  // tentativa por arrendamento, contadas, até `MAX_ATTEMPTS`.
  const wait = r.delivery?.status === 'pending' ? waitKey(r) : undefined;
  if (wait && d.io.authority(r.runId)?.prompted !== wait) {
    d.io.save(r);
    return r;
  }
  const aguardandoEntrega = r.delivery?.status === 'pending' && (r.status === 'done' || r.status === 'failed');
  // `progressed` zera as tentativas, e isso só vale para um run que ainda TRABALHA. Um run terminal está na
  // fila apenas pela entrega: zerar ali fazia uma entrega impossível (o 400 da v83) girar para sempre, porque
  // `MAX_ATTEMPTS` nunca chegava. Aqui a tentativa conta de verdade.
  if (isOpen(r.status) || aguardandoEntrega) d.io.enqueue(r, d.clock(), progressed && isOpen(r.status));
  else {
    d.io.save(r);
    d.io.dequeue(r.runId);
    // Acabou de vez: a autoridade pode ser esquecida. Um run que só saiu da fila para ESPERAR o usuário
    // (`waiting`/`paused`) mantém a dele — é exatamente nessa janela que ela precisa sobreviver.
    if (isFinished(r)) d.io.forget(r.runId);
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

function runClaim(d: StepDeps, c: { pointer: import('./run').RunPointer; run: DurableRun; exhausted?: true; tampered?: true }, now: number): DurableRun {

  // O arquivo do run diverge do que NÓS gravamos: alguém editou a pasta compartilhada por fora. Não dá para
  // saber o que mais mudou, então não se executa nada — nem se entrega, porque o conteúdo também é suspeito.
  if (c.tampered) {
    const recusado: DurableRun = {
      ...c.run,
      status: 'failed',
      error: 'this task was changed outside gasclaw (the agent folder may be shared); I will not run it',
      ...(c.run.delivery ? { delivery: { ...c.run.delivery, status: 'failed' as const } } : {}),
      updatedAt: now,
    };
    d.io.save(recusado);
    d.io.dequeue(recusado.runId);
    d.io.forget(recusado.runId);
    return recusado;
  }

  // Gastou as tentativas: não trabalha mais, só conta ao usuário que não deu (a fila já o soltou).
  if (c.exhausted) {
    // Se o que esgotou foi a ENTREGA de um run que já respondeu, a resposta não pode ser jogada fora:
    // `afterFailure` sobrescreveria `answer` com "Não consegui terminar". Desistimos só da entrega.
    if (c.run.delivery?.status === 'pending' && !isOpen(c.run.status)) {
      const parado = deliveryGivenUp(c.run, `não consegui entregar no Google Chat depois de ${MAX_ATTEMPTS} tentativas; a resposta está no painel`, now);
      d.io.save(parado);
      d.io.dequeue(parado.runId);
      return parado;
    }
    return settle(d, afterFailure(c.run, c.run.error ?? 'não consegui completar depois de várias tentativas', MAX_ATTEMPTS, now), false);
  }

  // A execução anterior morreu com uma tool de efeito em voo. Não dá para saber se o e-mail saiu: não repete.
  if (c.run.inflight) return settle(d, interrupted(c.run), false);

  // Ponteiro de um run que já acabou ou foi esperar o usuário (corrida entre o clique e o pump): só limpa a fila.
  // `progressed: true` de propósito: o pump nao tentou nada aqui, entao isto NAO pode contar como tentativa falha.
  // Sem isso o run girava ate esgotar MAX_ATTEMPTS no mesmo tique e virava 'failed' tendo entregue a resposta (P2).
  if (!isOpen(c.run.status)) return settle(d, c.run, true);

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

/**
 * Uma execução do pump pode dar vários passos enquanto houver tempo: cada um já ficou durável antes do próximo.
 * `after` roda logo depois de CADA passo — é onde a entrega acontece, para uma resposta pronta não ficar
 * esperando os outros runs da mesma execução (ver `workRuns` no main.ts).
 */
export function pump(d: StepDeps, maxSteps: number, deadlineMs: number, after?: (r: DurableRun) => void): DurableRun[] {
  const touched: DurableRun[] = [];
  for (let i = 0; i < maxSteps && d.clock() < deadlineMs; i++) {
    const r = pumpOnce(d);
    if (!r) break;
    touched.push(r);
    // O `after` é a ENTREGA. Um throw que escape dele (Chat fora do ar, 500, rede) matava o pump inteiro e
    // punia todos os outros runs do tique por causa de um só. A entrega já é reenfileirada por quem a executa.
    try {
      after?.(r);
    } catch {
      // segue para o próximo run: este fica na fila e tenta de novo no próximo tique
    }
  }
  return touched;
}

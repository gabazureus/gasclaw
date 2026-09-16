import { describe, expect, it } from 'vitest';
import type { Snapshot, TurnResult } from '../src/agent';
import {
  afterFailure,
  afterStep,
  charge,
  claim,
  extendBudget,
  hasEffect,
  interrupted,
  isOpen,
  LEASE_MS,
  markInflight,
  MAX_ATTEMPTS,
  newRun,
  nextClaimable,
  nextExhausted,
  parseRun,
  pointerOf,
  queueKey,
  resumeOf,
  RUN_BUDGET_USD,
  splitRunQueue,
  view,
  withDecision,
  type DurableRun,
  type RunPointer,
} from '../src/run';

const NOW = 1_700_000_000_000;
const snap = (step = 2): Snapshot => ({ messages: [{ role: 'user', content: 'oi' }], step, queue: [] });
const run = (over: Partial<DurableRun> = {}): DurableRun => ({
  ...newRun({ runId: 'r1', session: 'f1:espaco', folderId: 'f1', user: 'Dono@Exemplo.com', text: 'agenda de amanhã', now: NOW }),
  ...over,
});
const turn = (over: Partial<TurnResult> = {}): TurnResult => ({ text: 'pronto', history: [], events: [], done: {}, granted: [], ...over });
const ptr = (over: Partial<RunPointer> = {}): RunPointer => ({ runId: 'r1', folderId: 'f1', session: 's', at: NOW, attempts: 0, ...over });

describe('fila de runs (separada da fila do trace)', () => {
  it('lê só as entradas R: e devolve em ordem de chegada', () => {
    const props = {
      'Q:abc': JSON.stringify({ id: 'trace', at: 1 }), // fila do trace: não é minha
      'R:b': JSON.stringify(ptr({ runId: 'b', at: NOW + 500 })),
      'R:a': JSON.stringify(ptr({ runId: 'a', at: NOW })),
      OUTRA: 'coisa',
    };
    expect(splitRunQueue(props).map((p) => p.runId)).toEqual(['a', 'b']);
  });

  it('ignora entrada corrompida sem derrubar a fila inteira', () => {
    const props = { 'R:ok': JSON.stringify(ptr({ runId: 'ok' })), 'R:lixo': '{não é json', 'R:vazio': JSON.stringify({ at: 1 }) };
    expect(splitRunQueue(props).map((p) => p.runId)).toEqual(['ok']);
  });

  it('a chave da fila deriva do runId', () => expect(queueKey('r9')).toBe('R:r9'));
});

describe('claim: lease de 6 min e teto de tentativas', () => {
  it('reivindica um ponteiro livre, marcando lease e contando a tentativa', () => {
    const c = claim(ptr(), NOW);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.pointer.attempts).toBe(1);
    expect(c.pointer.leaseUntil).toBe(NOW + LEASE_MS);
  });

  it('recusa enquanto o lease de outra execução está de pé', () => {
    expect(claim(ptr({ leaseUntil: NOW + 1000 }), NOW)).toEqual({ ok: false, reason: 'ocupado' });
  });

  it('reivindica de novo quando o lease venceu (a execução que pegou morreu)', () => {
    expect(claim(ptr({ leaseUntil: NOW - 1, attempts: 1 }), NOW).ok).toBe(true);
  });

  it('para de tentar depois de MAX_ATTEMPTS, em vez de repetir efeito para sempre', () => {
    expect(claim(ptr({ attempts: MAX_ATTEMPTS }), NOW)).toEqual({ ok: false, reason: 'esgotado' });
  });

  it('nextClaimable escolhe o mais antigo que dá para pegar agora', () => {
    const fila = [ptr({ runId: 'ocupado', at: NOW, leaseUntil: NOW + 1000 }), ptr({ runId: 'esgotado', at: NOW + 1, attempts: MAX_ATTEMPTS }), ptr({ runId: 'livre', at: NOW + 2 })];
    expect(nextClaimable(fila, NOW)?.runId).toBe('livre');
    expect(nextClaimable([ptr({ leaseUntil: NOW + 1000 })], NOW)).toBeNull();
  });

  it('nextExhausted acha quem já não dá para tentar, para desistir com recado em vez de sumir', () => {
    const esgotado = ptr({ runId: 'esgotado', attempts: MAX_ATTEMPTS });
    expect(nextExhausted([ptr({ runId: 'livre' }), esgotado], NOW)?.runId).toBe('esgotado');
    expect(nextExhausted([ptr({ runId: 'livre' })], NOW)).toBeNull();
    // ainda rodando a última tentativa: não é hora de desistir
    expect(nextExhausted([ptr({ attempts: MAX_ATTEMPTS, leaseUntil: NOW + 1000 })], NOW)).toBeNull();
  });
});

describe('orçamento de US$ 0,10 por run', () => {
  it('soma o custo e pausa ao cruzar o teto, oferecendo continuar', () => {
    const r = afterStep(charge(run(), RUN_BUDGET_USD), turn({ stopped: 'deadline', state: snap() }), NOW + 1);
    expect(r.status).toBe('paused');
    expect(r.answer).toContain('US$ 0.10');
    expect(r.answer).toContain('continue');
    expect(r.snapshot).toEqual(snap()); // pausado guarda onde parou: continuar não recomeça do zero
  });

  it('abaixo do teto o run volta para a fila, sem falar com o usuário', () => {
    const r = afterStep(charge(run(), 0.02), turn({ stopped: 'steps', state: snap() }), NOW + 1);
    expect(r.status).toBe('queued');
    expect(r.answer).toBeUndefined();
  });

  it('continuar estende o teto e devolve o run à fila', () => {
    const pausado = afterStep(charge(run(), RUN_BUDGET_USD), turn({ stopped: 'deadline', state: snap() }), NOW);
    const seguiu = extendBudget(pausado, RUN_BUDGET_USD, NOW + 5);
    expect(seguiu.status).toBe('queued');
    expect(seguiu.budget.capUsd).toBe(0.2);
    expect(seguiu.answer).toBeUndefined();
    expect(extendBudget(run(), RUN_BUDGET_USD).status).toBe('queued'); // só pausado estende
  });

  it('charge ignora valor não positivo (resposta sem custo informado)', () => {
    expect(charge(run(), 0).budget.usedUsd).toBe(0);
  });
});

describe('afterStep: os três finais de um passo', () => {
  it('pendência de aprovação vira waiting, com o snapshot e o texto do card', () => {
    const pending = { kind: 'approval' as const, name: 'gmail.send', callId: 'c1', key: 'k', args: { to: 'a@b.c' } };
    const r = afterStep(run(), turn({ text: 'Posso enviar?', pending, state: snap() }), NOW + 1);
    expect(r.status).toBe('waiting');
    expect(r.pending).toEqual(pending);
    expect(r.answer).toBe('Posso enviar?');
  });

  it('parada por tempo com estado é checkpoint, não fim: volta para a fila', () => {
    const r = afterStep(run(), turn({ stopped: 'deadline', state: snap(3) }), NOW + 1);
    expect(r.status).toBe('queued');
    expect(r.snapshot?.step).toBe(3);
  });

  it('resposta final encerra o run e limpa o estado', () => {
    const r = afterStep(run({ snapshot: snap(), pending: { kind: 'ask', name: 'ask', callId: 'c', key: 'k', args: {} } }), turn({ text: 'amanhã você tem 3 reuniões' }), NOW + 1);
    expect(r.status).toBe('done');
    expect(r.answer).toBe('amanhã você tem 3 reuniões');
    expect(r.snapshot).toBeUndefined();
    expect(r.pending).toBeUndefined();
  });

  it('acumula o done entre execuções: o que já rodou não roda de novo', () => {
    const antes = run({ done: { 'r1:0:c0': 'ok antigo' } });
    const r = afterStep(antes, turn({ done: { 'r1:1:c1': 'ok novo' }, granted: ['tasks.create'], stopped: 'steps', state: snap() }), NOW + 1);
    expect(r.done).toEqual({ 'r1:0:c0': 'ok antigo', 'r1:1:c1': 'ok novo' });
    expect(r.granted).toEqual(['tasks.create']);
  });
});

describe('falha e retomada', () => {
  it('falha com tentativa sobrando volta para a fila', () => {
    const r = afterFailure(run(), 'timeout do UrlFetch', 1, NOW + 1);
    expect(r.status).toBe('queued');
    expect(r.answer).toBeUndefined();
  });

  it('falha na última tentativa vira recado honesto na tela', () => {
    const r = afterFailure(run(), 'timeout do UrlFetch', MAX_ATTEMPTS, NOW + 1);
    expect(r.status).toBe('failed');
    expect(r.answer).toContain('timeout do UrlFetch');
  });

  it('a decisão do usuário devolve o run à fila e chega ao turno retomado', () => {
    const esperando = afterStep(run(), turn({ pending: { kind: 'approval', name: 'gmail.send', callId: 'c1', key: 'k', args: {} }, state: snap(4) }), NOW);
    const decidido = withDecision(esperando, { approved: true }, NOW + 60_000);
    expect(decidido.status).toBe('queued');
    expect(resumeOf(decidido)).toEqual({ ...snap(4), decision: { approved: true } });
  });

  it('decisão em run que não espera nada é ignorada', () => {
    expect(withDecision(run(), { approved: true }, NOW).status).toBe('queued');
    expect(resumeOf(run())).toBeUndefined(); // sem snapshot não há o que retomar
  });

  it('run que parou por tempo retoma SEM decisão: inventar uma auto-aprovaria a próxima ferramenta', () => {
    const porTempo = afterStep(run(), turn({ stopped: 'deadline', state: snap(2) }), NOW);
    const r = resumeOf(porTempo);
    expect(r).toEqual({ ...snap(2) }); // snapshot sim, decisão não
    expect(r && 'decision' in r).toBe(false);
  });
});

describe('efeito em voo: não repetir o que pode ter acontecido', () => {
  it('reconhece tools com efeito pelo nome', () => {
    expect(hasEffect('gmail.send')).toBe(true);
    expect(hasEffect('tasks.create')).toBe(true);
    expect(hasEffect('calendar.list')).toBe(false);
  });

  it('marca o efeito no run antes do checkpoint final', () => {
    expect(markInflight(run(), 'gmail.send', NOW).inflight).toEqual({ name: 'gmail.send', at: NOW });
  });

  it('execução morta com efeito em voo não repete: conta o que houve e devolve a decisão', () => {
    const r = interrupted(run({ inflight: { name: 'gmail.send', at: NOW } }));
    expect(r.status).toBe('failed');
    expect(r.answer).toContain('gmail.send');
    expect(r.answer).toContain('Não vou repetir');
  });

  it('sem efeito em voo, nada muda', () => {
    expect(interrupted(run()).status).toBe('queued');
  });

  it('o passo concluído limpa a marca de voo', () => {
    expect(afterStep(run({ inflight: { name: 'gmail.send', at: NOW } }), turn(), NOW + 1).inflight).toBeUndefined();
  });
});

describe('leitura pela tela e pelo pump', () => {
  it('isOpen separa o que é trabalho do pump do que espera o usuário', () => {
    expect([isOpen('queued'), isOpen('running')]).toEqual([true, true]);
    expect([isOpen('waiting'), isOpen('paused'), isOpen('done'), isOpen('failed')]).toEqual([false, false, false, false]);
  });

  it('view mostra estado, texto, gasto e se a bola está com o usuário', () => {
    expect(view(run())).toEqual({ status: 'queued', text: 'Trabalhando…', spent: 'US$ 0.00', waiting: false });
    expect(view(charge(run({ status: 'done', answer: 'pronto' }), 0.03)).spent).toBe('US$ 0.03');
    expect(view(run({ status: 'waiting', answer: 'Posso enviar?' })).waiting).toBe(true);
    expect(view(run({ status: 'failed', error: 'sem chave' })).text).toContain('sem chave');
  });

  it('o ponteiro carrega só o endereço do run', () => {
    expect(pointerOf(run(), NOW + 5)).toEqual({ runId: 'r1', folderId: 'f1', session: 'f1:espaco', at: NOW + 5, attempts: 0 });
  });

  it('newRun normaliza o e-mail e aplica o teto padrão', () => {
    expect(run().user).toBe('dono@exemplo.com');
    expect(run().budget).toEqual({ usedUsd: 0, capUsd: RUN_BUDGET_USD });
  });
});

describe('parseRun: o arquivo no Drive é editável pelo dono', () => {
  it('lê um run gravado por nós', () => {
    const r = afterStep(charge(run(), 0.01), turn({ stopped: 'steps', state: snap(2) }), NOW + 1);
    expect(parseRun(JSON.stringify(r))).toEqual(r);
  });

  it('recusa o que não tem forma de run', () => {
    expect(parseRun(null)).toBeNull();
    expect(parseRun('')).toBeNull();
    expect(parseRun('{quebrado')).toBeNull();
    expect(parseRun(JSON.stringify({ session: 'x' }))).toBeNull(); // sem runId nem folderId
  });

  it('sana campos estragados sem perder o run', () => {
    const r = parseRun(JSON.stringify({ runId: 'r1', folderId: 'f1', status: 'inventado', done: 'nada', granted: ['ok', 7], budget: { usedUsd: 'x' } }));
    expect(r?.status).toBe('queued');
    expect(r?.done).toEqual({});
    expect(r?.granted).toEqual(['ok']);
    expect(r?.budget).toEqual({ usedUsd: 0, capUsd: RUN_BUDGET_USD });
  });

  it('descarta snapshot sem mensagens (não dá para retomar de lixo)', () => {
    expect(parseRun(JSON.stringify({ runId: 'r1', folderId: 'f1', snapshot: { step: 1 } }))?.snapshot).toBeUndefined();
  });
});

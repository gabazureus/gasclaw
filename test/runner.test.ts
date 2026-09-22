import { describe, expect, it, vi } from 'vitest';
import type { TurnResult } from '../src/agent';
import { markInflight, MAX_ATTEMPTS, newRun, queueKey, RUN_BUDGET_USD, waitKey, type DurableRun } from '../src/run';
import { runIO, type RunFiles } from '../src/runStore';
import { pump, pumpById, pumpOnce, type StepDeps, type StepOutcome } from '../src/runner';
import { deliveryDue, sendChatDelivery } from '../src/chatDelivery';

const NOW = 1_700_000_000_000;
/** Assinatura de teste: nao precisa ser SHA-256, precisa distinguir estados diferentes de forma estavel. */
export const fakeSign = (v: string) => {
  let h = 5381n;
  for (let i = 0; i < v.length; i++) h = ((h * 33n) ^ BigInt(v.charCodeAt(i))) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, '0');
};
const snap = (step = 1) => ({ messages: [{ role: 'user' as const, content: 'oi' }], step, queue: [] });
const turn = (over: Partial<TurnResult> = {}): TurnResult => ({ text: 'pronto', history: [], events: [], done: {}, granted: [], ...over });
const mk = (over: Partial<DurableRun> = {}): DurableRun => ({
  ...newRun({ runId: 'r1', session: 'f1:espaco', folderId: 'f1', user: 'dono@x.com', text: 'oi', now: NOW }),
  ...over,
});

/** Mesmo estilo dos outros testes de borda: Properties, cache e Drive viram Maps. O relógio é meu. */
function harness(step: (r: DurableRun) => StepOutcome) {
  const props = new Map<string, string>();
  const cached = new Map<string, string>();
  const disk = new Map<string, string>();
  const p = { getProperties: () => Object.fromEntries(props), setProperty: (k: string, v: string) => void props.set(k, v), deleteProperty: (k: string) => void props.delete(k) };
  const c = { get: (k: string) => cached.get(k) ?? null, put: (k: string, v: string) => void cached.set(k, v), remove: (k: string) => void cached.delete(k) };
  const lock = { tryLock: () => true, releaseLock: () => {} };
  const files: RunFiles = { read: (f, n) => disk.get(`${f}/${n}`) ?? null, write: (f, n, raw) => void disk.set(`${f}/${n}`, raw) };
  const io = runIO(p as never, c as never, lock as never, files, fakeSign);
  let t = NOW;
  const spy = vi.fn(step);
  const d: StepDeps = { io, step: spy, clock: () => t };
  return { io, props, d, spy, tick: (ms: number) => void (t += ms), now: () => t, queued: () => props.has(queueKey('r1')) };
}

describe('pumpOnce: um passo por execução', () => {
  it('sem trabalho na fila, não chama o passo', () => {
    const h = harness(() => ({ turn: turn() }));
    expect(pumpOnce(h.d)).toBeNull();
    expect(h.spy).not.toHaveBeenCalled();
  });

  it('resposta final encerra o run e o tira da fila', () => {
    const h = harness(() => ({ turn: turn({ text: 'amanhã você tem 3 reuniões' }) }));
    h.io.enqueue(mk(), NOW);
    const r = pumpOnce(h.d)!;
    expect(r.status).toBe('done');
    expect(r.answer).toBe('amanhã você tem 3 reuniões');
    expect(h.queued()).toBe(false);
    expect(h.io.load('f1', 'r1')?.status).toBe('done'); // o estado final ficou gravado, não só em memória
  });

  it('mantem run terminal na fila enquanto a entrega ao Chat nao tem recibo', () => {
    const h = harness(() => ({ turn: turn({ text: 'terminei' }) }));
    const delivery = {
      kind: 'google-chat' as const,
      space: 'spaces/AAA',
      requestId: '123e4567-e89b-42d3-a456-426614174000',
      notBefore: NOW,
      status: 'pending' as const,
    };
    h.io.enqueue(mk({ delivery }), NOW);

    const r = pumpOnce(h.d)!;

    expect(r.status).toBe('done');
    expect(h.queued()).toBe(true);
    expect(h.io.load('f1', 'r1')?.delivery?.status).toBe('pending');
  });

  // Regressao (auditoria 2026-09-18): UMA mensagem do Chat que pede aprovacao travava a fila INTEIRA.
  // `settle` mantinha na fila qualquer run com entrega pendente — inclusive `waiting`, que espera o USUARIO
  // e nunca fica `due`. Como `enqueue` limpa o lease e preserva o `at`, esse run voltava a ser o mais antigo
  // reivindicavel a cada volta: o pump so pegava ele, 20 vezes por tique, para sempre, e nenhuma outra
  // mensagem era atendida.
  //
  // Incidente de 2026-09-21: sair da fila CEDO demais deixava a espera sem cartão — se o POST falhasse, ninguém
  // mais a revisitava. Agora ela fica só até o cartão sair (`prompted` na autoridade) e então libera a fila.
  const pedeAprovacao = () => ({ turn: turn({ text: 'posso mandar?', pending: { kind: 'approval' as const, name: 'gmail.draft', callId: 'c1', key: 'r1:0:c1', args: {} }, state: snap(0) }) });
  const entregaChat = { kind: 'google-chat' as const, space: 'spaces/AAA', requestId: '123e4567-e89b-42d3-a456-426614174000', notBefore: NOW, status: 'pending' as const };

  it('espera do Chat SEM cartão fica na fila até o cartão sair', () => {
    const h = harness(pedeAprovacao);
    h.io.enqueue(mk({ delivery: entregaChat }), NOW);
    const r = pumpOnce(h.d)!;
    expect(r.status).toBe('waiting');
    expect(h.queued()).toBe(true);
  });

  it('com o cartão postado a espera sai da fila e não afoga os outros runs', () => {
    const h = harness((r) => (r.runId === 'r1' ? pedeAprovacao() : { turn: turn({ text: 'outro pronto' }) }));
    h.io.enqueue(mk({ delivery: entregaChat }), NOW);
    h.io.enqueue(mk({ runId: 'r2' }), NOW + 1);
    // o `after` do gatilho: posta o cartão e marca a espera como enviada
    const posta = (r: DurableRun) => {
      if (r.status !== 'waiting') return;
      h.io.markPrompted(r.runId, waitKey(r)!);
      h.io.dequeue(r.runId);
    };
    const tocados = pump(h.d, 10, Infinity, posta);
    expect(tocados.map((r) => [r.runId, r.status])).toEqual([['r1', 'waiting'], ['r2', 'done']]);
    expect(h.queued()).toBe(false);
    expect(h.io.load('f1', 'r1')?.delivery?.status).toBe('pending'); // a entrega final continua pendente no Drive
  });

  it('ponteiro velho de uma espera cujo cartão já saiu: só limpa a fila', () => {
    const h = harness(pedeAprovacao);
    h.io.enqueue(mk({ delivery: entregaChat }), NOW);
    const r = pumpOnce(h.d)!;
    h.io.markPrompted('r1', waitKey(r)!);
    h.tick(1);
    expect(pumpOnce(h.d)?.status).toBe('waiting');
    expect(h.queued()).toBe(false);
    expect(pumpOnce(h.d)).toBeNull();
  });

  // Regressao (auditoria 2026-09-18): entrega impossivel (400 do Chat) tentava para SEMPRE.
  // `settle` e `deliverIfDue` zeravam `attempts` a cada volta, entao MAX_ATTEMPTS nunca cortava: 20 POSTs
  // falhos por tique, para sempre. Agora a tentativa conta — e ao esgotar a RESPOSTA NAO se perde.
  it('entrega que sempre falha esgota MAX_ATTEMPTS, sai da fila e preserva a resposta', () => {
    const h = harness(() => ({ turn: turn({ text: 'aqui esta sua agenda' }) }));
    const delivery = { kind: 'google-chat' as const, space: 'spaces/AAA', requestId: '123e4567-e89b-42d3-a456-426614174000', notBefore: NOW, status: 'pending' as const };
    h.io.enqueue(mk({ delivery }), NOW);

    // cada volta do pump tenta entregar e falha, como o 400 da v83
    const entregar = (r: DurableRun) => {
      if (r.delivery?.status !== 'pending' || !deliveryDue(r, h.now())) return;
      try {
        sendChatDelivery(r, h.now(), () => { throw new Error('Google Chat 400'); }, h.io.save, h.io.authority(r.runId));
      } catch {
        h.io.enqueue(r, h.now(), false);
      }
    };
    for (let i = 0; i < 40; i++) {
      const r = pumpOnce(h.d);
      if (!r) break;
      entregar(r);
    }

    const depois = h.io.load('f1', 'r1')!;
    expect(h.queued()).toBe(false); // parou de tentar
    expect(depois.answer).toBe('aqui esta sua agenda'); // a resposta do usuario NAO foi descartada
    expect(depois.status).toBe('done');
    expect(depois.delivery?.status).toBe('failed'); // e o motivo ficou registrado
    expect(depois.error).toMatch(/entregar/i);
  });

  // Regressao da P2 (2026-09-17): o run entregou o card e mesmo assim terminou 'failed'.
  // Causa: settle -> enqueue limpa o lease, entao o pump reivindica o mesmo run ate PUMP_MAX_STEPS
  // vezes no MESMO tique e cada claim incrementa attempts. Esperar a hora da entrega nao e falhar.
  it('run terminal esperando a hora da entrega nao queima tentativa nem vira falha', () => {
    const h = harness(() => ({ turn: turn() }));
    const delivery = {
      kind: 'google-chat' as const,
      space: 'spaces/AAA',
      requestId: '123e4567-e89b-42d3-a456-426614174000',
      notBefore: NOW + 120_000, // a POC P2 so entrega depois de 2 min
      status: 'pending' as const,
    };
    h.io.enqueue(mk({ status: 'done', delivery }), NOW);

    // um unico tique do gatilho: o pump pode girar ate 20 vezes
    for (let i = 0; i < 20; i++) pumpOnce(h.d);

    const depois = h.io.load('f1', 'r1')!;
    expect(depois.status).toBe('done'); // nao pode ter virado 'failed'
    expect(depois.answer).toBeUndefined();
    expect(h.queued()).toBe(true); // continua na fila esperando o recibo
    expect(JSON.parse(h.props.get(queueKey('r1'))!).attempts).toBeLessThan(MAX_ATTEMPTS);
  });

  it('antes da hora marcada o run nem e reivindicado (primitiva de trabalho agendado)', () => {
    const h = harness(() => ({ turn: turn() }));
    const delivery = {
      kind: 'google-chat' as const,
      space: 'spaces/AAA',
      requestId: '123e4567-e89b-42d3-a456-426614174000',
      notBefore: NOW + 120_000,
      status: 'pending' as const,
    };
    h.io.enqueue(mk({ status: 'done', delivery }), NOW);

    expect(pumpOnce(h.d)).toBeNull(); // ainda nao e hora: nada a fazer
    expect(JSON.parse(h.props.get(queueKey('r1'))!).attempts).toBe(0);

    h.tick(120_001); // passou a hora
    expect(pumpOnce(h.d)).not.toBeNull();
  });

  it('passo que estoura o tempo vira checkpoint: volta para a fila de onde parou', () => {
    const h = harness(() => ({ turn: turn({ stopped: 'deadline', state: snap(3) }) }));
    h.io.enqueue(mk(), NOW);
    const r = pumpOnce(h.d)!;
    expect(r.status).toBe('queued');
    expect(r.snapshot?.step).toBe(3);
    expect(h.queued()).toBe(true);
  });

  it('o run atravessa várias execuções e só termina no passo final', () => {
    let passo = 0;
    const h = harness(() => ({ turn: ++passo < 3 ? turn({ stopped: 'deadline', state: snap(passo) }) : turn({ text: 'terminei' }) }));
    h.io.enqueue(mk(), NOW);
    const vistos = [pumpOnce(h.d)!, pumpOnce(h.d)!, pumpOnce(h.d)!];
    expect(vistos.map((r) => r.status)).toEqual(['queued', 'queued', 'done']);
    expect(h.spy).toHaveBeenCalledTimes(3);
    expect(pumpOnce(h.d)).toBeNull(); // e a fila fica limpa
  });

  it('progresso zera as tentativas: um run longo não morre de velhice no pump', () => {
    const h = harness(() => ({ turn: turn({ stopped: 'steps', state: snap() }) }));
    h.io.enqueue(mk(), NOW);
    for (let i = 0; i < MAX_ATTEMPTS + 3; i++) expect(pumpOnce(h.d)).not.toBeNull();
    expect(JSON.parse(h.props.get(queueKey('r1'))!).attempts).toBe(0);
  });

  it('P20: retomada por decisão trabalha o run escolhido, não o mais antigo', () => {
    const h = harness((r) => ({ turn: turn({ text: r.runId }) }));
    h.io.enqueue(mk({ runId: 'antigo' }), NOW - 1);
    h.io.enqueue(mk(), NOW);
    expect(pumpById(h.d, 'r1')?.answer).toBe('r1');
    expect(h.spy).toHaveBeenCalledWith(expect.objectContaining({ runId: 'r1' }));
    expect(h.props.has(queueKey('antigo'))).toBe(true);
  });
});

describe('pump: entrega logo apos cada passo (latencia do Chat)', () => {
  it('chama `after` depois de CADA run, nao so no fim do laco', () => {
    // Regressao: a entrega esperava o pump inteiro (ate 20 runs / 240 s), entao uma resposta pronta
    // ficava refem dos outros runs da mesma execucao e o usuario lia "travado no pensando...".
    const h = harness((r) => ({ turn: turn({ text: r.runId }) }));
    h.io.enqueue(mk({ runId: 'a' }), NOW);
    h.io.enqueue(mk({ runId: 'b' }), NOW + 1);
    h.io.enqueue(mk({ runId: 'c' }), NOW + 2);

    const ordem: string[] = [];
    const vistos = pump(h.d, 10, NOW + 300_000, (r) => ordem.push(`entregue:${r.runId}`));

    expect(vistos.map((r) => r.runId)).toEqual(['a', 'b', 'c']);
    // o run 'a' precisa ter sido entregue ANTES de 'b' e 'c' sequer rodarem
    expect(ordem).toEqual(['entregue:a', 'entregue:b', 'entregue:c']);
  });

  it('sem `after`, o pump continua funcionando como antes', () => {
    const h = harness(() => ({ turn: turn() }));
    h.io.enqueue(mk(), NOW);
    expect(pump(h.d, 5, NOW + 300_000)).toHaveLength(1);
  });
});

describe('falha: tenta de novo, depois desiste com honestidade', () => {
  it('falha com tentativa sobrando volta para a fila, sem falar com o usuário', () => {
    const h = harness(() => {
      throw new Error('timeout do UrlFetch');
    });
    h.io.enqueue(mk(), NOW);
    const r = pumpOnce(h.d)!;
    expect(r.status).toBe('queued');
    expect(r.answer).toBeUndefined();
    expect(JSON.parse(h.props.get(queueKey('r1'))!).attempts).toBe(1);
  });

  it('esgotadas as tentativas, o run vira recado honesto e sai da fila', () => {
    const h = harness(() => {
      throw new Error('timeout do UrlFetch');
    });
    h.io.enqueue(mk(), NOW);
    for (let i = 0; i < MAX_ATTEMPTS; i++) pumpOnce(h.d);
    const final = h.io.load('f1', 'r1')!;
    expect(final.status).toBe('failed');
    expect(final.answer).toContain('timeout do UrlFetch');
    expect(h.queued()).toBe(false);
    expect(h.spy).toHaveBeenCalledTimes(MAX_ATTEMPTS); // não tenta uma quinta vez
    expect(pumpOnce(h.d)).toBeNull();
  });

  it('execução morta com efeito em voo não repete o efeito', () => {
    const h = harness(() => ({ turn: turn() }));
    h.io.enqueue(mk({ inflight: { name: 'gmail.send', at: NOW } }), NOW);
    const r = pumpOnce(h.d)!;
    expect(h.spy).not.toHaveBeenCalled(); // o ponto todo: não roda de novo
    expect(r.status).toBe('failed');
    expect(r.answer).toContain('gmail.send');
    expect(h.queued()).toBe(false);
  });

  it('falha depois do efeito preserva o inflight durável em vez de salvar a cópia antiga', () => {
    const h = harness((r) => {
      h.io.save(markInflight(r, 'gmail.send', NOW + 1));
      throw new Error('LLM caiu depois do envio');
    });
    h.io.enqueue(mk(), NOW);

    const r = pumpOnce(h.d)!;

    expect(r.status).toBe('failed');
    expect(r.answer).toContain('Não vou repetir');
    expect(h.io.load('f1', 'r1')?.inflight?.name).toBe('gmail.send');
    expect(h.queued()).toBe(false);
  });

  it('ponteiro de run que já terminou só limpa a fila', () => {
    const h = harness(() => ({ turn: turn() }));
    h.io.enqueue(mk({ status: 'waiting' }), NOW);
    expect(pumpOnce(h.d)?.status).toBe('waiting');
    expect(h.spy).not.toHaveBeenCalled();
    expect(h.queued()).toBe(false);
  });
});

describe('orçamento por run', () => {
  it('soma o custo de cada passo no run', () => {
    const h = harness(() => ({ turn: turn({ stopped: 'steps', state: snap() }), usd: 0.01 }));
    h.io.enqueue(mk(), NOW);
    pumpOnce(h.d);
    pumpOnce(h.d);
    expect(h.io.load('f1', 'r1')?.budget.usedUsd).toBeCloseTo(0.02, 5);
  });

  it('ao cruzar o teto, pausa, guarda onde parou e devolve a pergunta ao usuário', () => {
    const h = harness(() => ({ turn: turn({ stopped: 'deadline', state: snap(2) }), usd: RUN_BUDGET_USD }));
    h.io.enqueue(mk(), NOW);
    const r = pumpOnce(h.d)!;
    expect(r.status).toBe('paused');
    expect(r.answer).toContain('continue');
    expect(r.snapshot?.step).toBe(2);
    expect(h.queued()).toBe(false); // pausado espera o usuário, não o pump
  });
});

describe('pump: vários passos numa execução, enquanto houver tempo', () => {
  it('dá passos até o trabalho acabar', () => {
    let passo = 0;
    const h = harness(() => ({ turn: ++passo < 3 ? turn({ stopped: 'steps', state: snap(passo) }) : turn({ text: 'fim' }) }));
    h.io.enqueue(mk(), NOW);
    expect(pump(h.d, 10, NOW + 300_000).map((r) => r.status)).toEqual(['queued', 'queued', 'done']);
  });

  it('para no prazo da execução, deixando o resto para o próximo pump', () => {
    const h = harness(() => {
      h.tick(60_000);
      return { turn: turn({ stopped: 'steps', state: snap() }) };
    });
    h.io.enqueue(mk(), NOW);
    expect(pump(h.d, 10, NOW + 150_000).length).toBe(3); // 3 passos de 1 min cabem em 2,5 min
    expect(h.queued()).toBe(true);
  });

  it('para no teto de passos, mesmo com tempo de sobra', () => {
    const h = harness(() => ({ turn: turn({ stopped: 'steps', state: snap() }) }));
    h.io.enqueue(mk(), NOW);
    expect(pump(h.d, 2, NOW + 300_000).length).toBe(2);
  });

  it('fila vazia sai na hora', () => {
    const h = harness(() => ({ turn: turn() }));
    expect(pump(h.d, 10, NOW + 300_000)).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { TurnResult } from '../src/agent';
import { markInflight, MAX_ATTEMPTS, newRun, queueKey, RUN_BUDGET_USD, type DurableRun } from '../src/run';
import { runIO, type RunFiles } from '../src/runStore';
import { pump, pumpOnce, type StepDeps, type StepOutcome } from '../src/runner';

const NOW = 1_700_000_000_000;
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
  const io = runIO(p as never, c as never, lock as never, files);
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

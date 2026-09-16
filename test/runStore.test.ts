import { describe, expect, it } from 'vitest';
import { issueGrant } from '../src/approval';
import { LEASE_MS, MAX_ATTEMPTS, newRun, queueKey, type DurableRun } from '../src/run';
import { runCacheKey, runFile, runIO, type RunFiles } from '../src/runStore';

const NOW = 1_700_000_000_000;

/** Fakes no mesmo estilo do approvalStore.test: o Drive vira um Map atrás da porta RunFiles. */
function fakes() {
  const store = new Map<string, string>();
  const cached = new Map<string, string>();
  const disk = new Map<string, string>();
  let free = true;
  let failSet = false;
  let failCachePut = false;
  const props = {
    getProperties: () => Object.fromEntries(store),
    setProperty: (k: string, v: string) => { if (failSet) throw new Error('properties indisponível'); store.set(k, v); },
    deleteProperty: (k: string) => void store.delete(k),
  };
  const cache = { get: (k: string) => cached.get(k) ?? null, put: (k: string, v: string) => { if (failCachePut) throw new Error('cache indisponível'); cached.set(k, v); }, remove: (k: string) => void cached.delete(k) };
  const lock = { tryLock: () => free, releaseLock: () => {} };
  const files: RunFiles = { read: (f, n) => disk.get(`${f}/${n}`) ?? null, write: (f, n, raw) => void disk.set(`${f}/${n}`, raw) };
  return { store, cached, disk, files, busy: () => void (free = false), failSet: () => void (failSet = true), failCachePut: () => void (failCachePut = true), io: runIO(props as never, cache as never, lock as never, files) };
}

const mk = (runId: string, over: Partial<DurableRun> = {}): DurableRun => ({
  ...newRun({ runId, session: 'f1:espaco', folderId: 'f1', user: 'dono@x.com', text: 'oi', now: NOW }),
  ...over,
});

const HASH = 'a'.repeat(64);
const NEXT_HASH = 'b'.repeat(64);
const waiting = (): DurableRun => {
  const pending = { kind: 'approval' as const, name: 'gmail.send', callId: 'c1', key: 'r1:0:c1', args: {} };
  return mk('r1', { status: 'waiting', pending, snapshot: { messages: [], step: 0, queue: [] }, approval: issueGrant(pending, 'dono@x.com', HASH, NOW) });
};

describe('runFile: o runId vem do Chat e vira nome de arquivo seguro', () => {
  it('normaliza barras, pontos e espaços', () => {
    expect(runFile('spaces/AAA/messages/B.1')).toBe('spaces-aaa-messages-b-1.json');
  });
  it('recusa um runId que não sobra nada', () => {
    expect(() => runFile('///')).toThrow('inválido');
  });
});

it('runCacheKey usa o mesmo nome seguro persistido no Drive', () => {
  expect(runCacheKey('folder', 'Run / 1')).toBe('r:folder:run-1.json');
});

describe('enqueue: estado antes do ponteiro', () => {
  it('grava o run no Drive e só então publica o ponteiro na fila', () => {
    const f = fakes();
    f.io.enqueue(mk('r1'), NOW);
    expect(f.disk.get('f1/r1.json')).toContain('"runId":"r1"');
    expect(JSON.parse(f.store.get(queueKey('r1'))!)).toMatchObject({ runId: 'r1', folderId: 'f1', attempts: 0 });
  });

  it('reenfileirar preserva a hora de chegada e as tentativas (não fura a fila nem zera o teto)', () => {
    const f = fakes();
    f.io.enqueue(mk('r1'), NOW);
    f.io.claimNext(NOW); // gasta uma tentativa
    f.io.enqueue(mk('r1'), NOW + 90_000);
    const p = JSON.parse(f.store.get(queueKey('r1'))!);
    expect(p.at).toBe(NOW);
    expect(p.attempts).toBe(1);
    expect(p.leaseUntil).toBeUndefined(); // reenfileirado = livre para o próximo pump
  });

  it('dequeue tira da fila mas preserva o estado no Drive', () => {
    const f = fakes();
    f.io.enqueue(mk('r1'), NOW);
    f.io.dequeue('r1');
    expect(f.store.has(queueKey('r1'))).toBe(false);
    expect(f.io.load('f1', 'r1')?.runId).toBe('r1');
  });
});

describe('claimNext: a trava cobre só a reivindicação', () => {
  it('entrega o run mais antigo e marca o lease', () => {
    const f = fakes();
    f.io.enqueue(mk('velho'), NOW);
    f.io.enqueue(mk('novo'), NOW + 1000);
    const c = f.io.claimNext(NOW + 2000);
    expect(c?.run.runId).toBe('velho');
    expect(c?.pointer.leaseUntil).toBe(NOW + 2000 + LEASE_MS);
  });

  it('um segundo pump no mesmo minuto não pega o run já reivindicado', () => {
    const f = fakes();
    f.io.enqueue(mk('r1'), NOW);
    expect(f.io.claimNext(NOW)?.run.runId).toBe('r1');
    expect(f.io.claimNext(NOW + 1000)).toBeNull();
  });

  it('claimById nunca cai no run seguinte se o pedido já estiver ocupado', () => {
    const f = fakes();
    f.io.enqueue(mk('p3'), NOW);
    f.io.enqueue(mk('real'), NOW + 1);
    expect(f.io.claimById('p3', NOW)?.run.runId).toBe('p3');
    expect(f.io.claimById('p3', NOW + 1)).toBeNull();
    expect(JSON.parse(f.store.get(queueKey('real'))!).leaseUntil).toBeUndefined();
  });

  it('lease vencido é reivindicado de novo: a execução que pegou morreu', () => {
    const f = fakes();
    f.io.enqueue(mk('r1'), NOW);
    f.io.claimNext(NOW);
    const de_novo = f.io.claimNext(NOW + LEASE_MS + 1);
    expect(de_novo?.run.runId).toBe('r1');
    expect(de_novo?.pointer.attempts).toBe(2);
  });

  it('esgotadas as tentativas, entrega o run uma última vez marcado para desistir, e tira da fila', () => {
    const f = fakes();
    f.io.enqueue(mk('r1'), NOW);
    let t = NOW;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      f.io.claimNext(t);
      t += LEASE_MS + 1;
    }
    const ultimo = f.io.claimNext(t);
    expect(ultimo?.exhausted).toBe(true); // o pump precisa disto para contar ao usuário que não deu
    expect(f.store.has(queueKey('r1'))).toBe(false);
    expect(f.io.load('f1', 'r1')).not.toBeNull();
    expect(f.io.claimNext(t + 1)).toBeNull(); // e não volta todo minuto
  });

  it('um run esgotado não atrasa outro que ainda dá para trabalhar', () => {
    const f = fakes();
    f.io.enqueue(mk('morto'), NOW);
    let t = NOW;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      f.io.claimNext(t);
      t += LEASE_MS + 1;
    }
    f.io.enqueue(mk('vivo'), t);
    const c = f.io.claimNext(t);
    expect(c?.run.runId).toBe('vivo');
    expect(c?.exhausted).toBeUndefined();
  });

  it('trava ocupada: sai sem reivindicar, sem perder nada (o próximo minuto tenta)', () => {
    const f = fakes();
    f.io.enqueue(mk('r1'), NOW);
    f.busy();
    expect(f.io.claimNext(NOW)).toBeNull();
    expect(JSON.parse(f.store.get(queueKey('r1'))!).leaseUntil).toBeUndefined();
  });

  it('ponteiro órfão (estado apagado à mão) se limpa sozinho', () => {
    const f = fakes();
    f.io.enqueue(mk('r1'), NOW);
    f.disk.clear();
    f.cached.clear();
    expect(f.io.claimNext(NOW)).toBeNull();
    expect(f.store.has(queueKey('r1'))).toBe(false);
  });

  it('fila vazia devolve null sem tocar em nada', () => {
    expect(fakes().io.claimNext(NOW)).toBeNull();
  });
});

describe('load: o cache é atalho, o Drive é a fonte da verdade', () => {
  it('sem cache, lê do Drive', () => {
    const f = fakes();
    f.io.save(mk('r1'));
    f.cached.clear();
    expect(f.io.load('f1', 'r1')?.runId).toBe('r1');
  });

  it('run que não cabe no cache ainda vai para o Drive, e o atalho velho é descartado', () => {
    const f = fakes();
    f.io.save(mk('r1'));
    expect(f.cached.size).toBe(1);
    f.io.save(mk('r1', { text: 'x'.repeat(95_000) }));
    expect(f.cached.size).toBe(0);
    expect(f.io.load('f1', 'r1')?.text.length).toBe(95_000);
  });

  it('run inexistente devolve null', () => {
    expect(fakes().io.load('f1', 'nunca-existiu')).toBeNull();
  });
});

describe('P20 decide: consumo atômico e Drive autoritativo', () => {
  it('C1 ignora cache velho, grava a decisão no Drive e publica o ponteiro', () => {
    const f = fakes();
    f.io.save(waiting());
    f.cached.set(runCacheKey('f1', 'r1'), JSON.stringify(mk('r1', { status: 'done' })));
    const out = f.io.decide('f1', 'r1', { tokenHash: HASH, actor: 'dono@x.com', decision: { approved: true }, replacementHash: NEXT_HASH }, NOW + 1);
    expect(out.kind).toBe('accepted');
    expect(JSON.parse(f.disk.get('f1/r1.json')!)).toMatchObject({ status: 'queued', decision: { approved: true } });
    expect(JSON.parse(f.store.get(queueKey('r1'))!)).toMatchObject({ runId: 'r1', attempts: 0 });
  });

  it('C2 terceiro não grava, não consome e não cria ponteiro', () => {
    const f = fakes();
    f.io.save(waiting());
    const before = f.disk.get('f1/r1.json');
    expect(f.io.decide('f1', 'r1', { tokenHash: HASH, actor: 'ana@x.com', decision: { approved: true }, replacementHash: NEXT_HASH }, NOW + 1)).toMatchObject({ kind: 'rejected' });
    expect(f.disk.get('f1/r1.json')).toBe(before);
    expect(f.store.has(queueKey('r1'))).toBe(false);
    expect(f.io.decide('f1', 'r1', { tokenHash: HASH, actor: 'dono@x.com', decision: { approved: true }, replacementHash: NEXT_HASH }, NOW + 2).kind).toBe('accepted');
  });

  it('C3 segundo clique não altera o ponteiro nem reenfileira', () => {
    const f = fakes();
    f.io.save(waiting());
    const req = { tokenHash: HASH, actor: 'dono@x.com', decision: { approved: true } as const, replacementHash: NEXT_HASH };
    expect(f.io.decide('f1', 'r1', req, NOW + 1).kind).toBe('accepted');
    const pointer = f.store.get(queueKey('r1'));
    expect(f.io.decide('f1', 'r1', req, NOW + 2).kind).toBe('rejected');
    expect(f.store.get(queueKey('r1'))).toBe(pointer);
  });

  it('não consome a aprovação quando publicar o ponteiro falha', () => {
    const f = fakes();
    f.io.save(waiting());
    f.failSet();
    expect(() => f.io.decide('f1', 'r1', { tokenHash: HASH, actor: 'dono@x.com', decision: { approved: true }, replacementHash: NEXT_HASH }, NOW + 1)).toThrow('properties');
    expect(JSON.parse(f.disk.get('f1/r1.json')!)).toMatchObject({ status: 'waiting', approval: { tokenHash: HASH } });
    expect(f.store.has(queueKey('r1'))).toBe(false);
  });

  it('cache indisponível não impede consumo; o claim lê o Drive autoritativo', () => {
    const f = fakes();
    f.io.save(waiting());
    f.cached.set(runCacheKey('f1', 'r1'), JSON.stringify(waiting()));
    f.failCachePut();
    expect(f.io.decide('f1', 'r1', { tokenHash: HASH, actor: 'dono@x.com', decision: { approved: true }, replacementHash: NEXT_HASH }, NOW + 1).kind).toBe('accepted');
    expect(f.io.claimById('r1', NOW + 2)?.run).toMatchObject({ status: 'queued', decision: { approved: true } });
  });
});

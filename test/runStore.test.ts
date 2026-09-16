import { describe, expect, it } from 'vitest';
import { LEASE_MS, MAX_ATTEMPTS, newRun, queueKey, type DurableRun } from '../src/run';
import { runFile, runIO, type RunFiles } from '../src/runStore';

const NOW = 1_700_000_000_000;

/** Fakes no mesmo estilo do approvalStore.test: o Drive vira um Map atrás da porta RunFiles. */
function fakes() {
  const store = new Map<string, string>();
  const cached = new Map<string, string>();
  const disk = new Map<string, string>();
  let free = true;
  const props = {
    getProperties: () => Object.fromEntries(store),
    setProperty: (k: string, v: string) => void store.set(k, v),
    deleteProperty: (k: string) => void store.delete(k),
  };
  const cache = { get: (k: string) => cached.get(k) ?? null, put: (k: string, v: string) => void cached.set(k, v), remove: (k: string) => void cached.delete(k) };
  const lock = { tryLock: () => free, releaseLock: () => {} };
  const files: RunFiles = { read: (f, n) => disk.get(`${f}/${n}`) ?? null, write: (f, n, raw) => void disk.set(`${f}/${n}`, raw) };
  return { store, cached, disk, files, busy: () => void (free = false), io: runIO(props as never, cache as never, lock as never, files) };
}

const mk = (runId: string, over: Partial<DurableRun> = {}): DurableRun => ({
  ...newRun({ runId, session: 'f1:espaco', folderId: 'f1', user: 'dono@x.com', text: 'oi', now: NOW }),
  ...over,
});

describe('runFile: o runId vem do Chat e vira nome de arquivo seguro', () => {
  it('normaliza barras, pontos e espaços', () => {
    expect(runFile('spaces/AAA/messages/B.1')).toBe('spaces-aaa-messages-b-1.json');
  });
  it('recusa um runId que não sobra nada', () => {
    expect(() => runFile('///')).toThrow('inválido');
  });
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

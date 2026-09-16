import { afterEach, beforeEach, expect, test, vi } from 'vitest';

let props: Record<string, string>;
let cached: Record<string, string>;
let failRunPut: number;
let failSetProperties: number;
let failDeleteProperty: number;

beforeEach(() => {
  props = {};
  cached = {};
  failRunPut = 0;
  failSetProperties = 0;
  failDeleteProperty = 0;
  const store = {
    getProperty: (k: string) => props[k] ?? null,
    setProperty: (k: string, v: string) => void (props[k] = v),
    setProperties: (values: Record<string, string>) => {
      if (failSetProperties-- > 0) throw new Error('properties indisponível');
      Object.assign(props, values);
    },
    getProperties: () => ({ ...props }),
    deleteProperty: (k: string) => {
      if (failDeleteProperty-- > 0) throw new Error('delete indisponível');
      delete props[k];
    },
  };
  const cache = {
    get: (k: string) => cached[k] ?? null,
    put: (k: string, v: string) => {
      if (k.startsWith('run:') && failRunPut-- > 0) throw new Error('cache indisponível');
      cached[k] = v;
    },
    putAll: (values: Record<string, string>) => {
      if (Object.keys(values).some((k) => k.startsWith('run:')) && failRunPut-- > 0) throw new Error('cache indisponível');
      Object.assign(cached, values);
    },
    remove: (k: string) => void delete cached[k],
    removeAll: (keys: string[]) => keys.forEach((k) => delete cached[k]),
    getAll: (keys: string[]) => Object.fromEntries(keys.filter((k) => cached[k] !== undefined).map((k) => [k, cached[k]])),
  };
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => store });
  vi.stubGlobal('CacheService', { getScriptCache: () => cache });
  vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) });
  vi.stubGlobal('Utilities', { formatDate: () => '20260915-120000', getUuid: () => 'abcd-efgh' });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('C8: o custo do begin (trava + cache da lista ao vivo) vira o passo trace_begin, sem buraco antes do 1º passo', async () => {
  // relógio falso: startRun em 1000; o toCache(listed) com trava termina em 2087 (medido na v25: 1.087 ms de buraco).
  // cada step lê o relógio 3 vezes (início, fim do span, lastEnd); mark 1; end 1.
  const clock = [1000, 2087, 2087, 2427, 2427, 2427, 6733, 6733, 6733, 6733];
  let i = 0;
  const now = () => clock[Math.min(i++, clock.length - 1)];
  const { begin } = await import('../src/runlog');
  const t = begin('test', { question: 'oi' }, { now });
  expect(JSON.parse(props['RUNNING:20260915-120000-abcd'])).toMatchObject({ status: 'running', step: 'início' });
  t.step('resolve_agent', () => 'ok');
  expect(JSON.parse(props['RUNNING:20260915-120000-abcd'])).toMatchObject({ status: 'running', step: 'resolve_agent' });
  t.step('llm_call', () => 'ok');
  t.mark('reply');
  const run = t.end({ answer: 'ok' });
  expect(props['RUNNING:20260915-120000-abcd']).toBeUndefined();
  expect(JSON.parse(props['TERMINAL:20260915-120000-abcd'])).toMatchObject({ status: 'ok', answer: 'ok' });
  expect(run.spans[0]).toMatchObject({ name: 'trace_begin', startMs: 0, ms: 1087 });
  expect(run.spans.map((s) => s.name)).toEqual(['trace_begin', 'resolve_agent', 'llm_call', 'reply']);
  const sum = run.spans.reduce((a, s) => a + s.ms, 0);
  expect(sum / (run.ms ?? 1)).toBeGreaterThanOrEqual(0.9);
});

test('liveRuns projeta um run abandonado como erro sem escrever durante a leitura', async () => {
  const { LIVE_STALE_MS, setStep, startRun } = await import('../src/trace');
  const stale = setStep(startRun('r-stale', 'chat', 1_000, { question: 'agenda?' }), 'llm_call');
  cached['runs:ids'] = JSON.stringify([stale.id]);
  cached[`run:${stale.id}`] = JSON.stringify(stale);
  vi.spyOn(Date, 'now').mockReturnValue(stale.startedAt + LIVE_STALE_MS + 1);

  const { liveRuns } = await import('../src/runlog');
  const out = liveRuns();

  expect(out.running).toEqual([]);
  expect(out.recent[0]).toMatchObject({ id: stale.id, status: 'error', step: 'llm_call (interrompido)', ms: 360_000 });
  expect(JSON.parse(cached[`run:${stale.id}`]).status).toBe('running');
  expect(Object.keys(props).some((k) => k.startsWith('Q:'))).toBe(false);
});

test('reconcileStaleRuns fecha e enfileira atomicamente uma vez', async () => {
  const { LIVE_STALE_MS, setStep, startRun } = await import('../src/trace');
  const stale = setStep(startRun('r-stale', 'chat', 1_000, { question: 'agenda?' }), 'llm_call');
  cached['runs:ids'] = JSON.stringify([stale.id]);
  cached[`run:${stale.id}`] = JSON.stringify(stale);

  const { reconcileStaleRuns } = await import('../src/runlog');
  expect(reconcileStaleRuns(stale.startedAt + LIVE_STALE_MS + 1)).toBe(1);
  expect(JSON.parse(cached[`run:${stale.id}`])).toMatchObject({ status: 'error', error: expect.stringContaining('interrompida') });
  expect(JSON.parse(props[`Q:${stale.id}`]).row[4]).toBe('error');
  expect(JSON.parse(cached[`qjson:${stale.id}`])).toMatchObject({ status: 'error', step: 'llm_call (interrompido)', ms: 360_000 });
  expect(reconcileStaleRuns(stale.startedAt + LIVE_STALE_MS + 2)).toBe(0);
});

test('reconcileStaleRuns descobre um run só pelo marcador durável quando item e índice do cache somem', async () => {
  const { LIVE_STALE_MS, setStep, startRun } = await import('../src/trace');
  const stale = setStep(startRun('r-evicted', 'chat', 1_000, { question: 'agenda?' }), 'calendar.list');
  props[`RUNNING:${stale.id}`] = JSON.stringify({ ...stale, spans: [] });

  const { reconcileStaleRuns } = await import('../src/runlog');
  expect(reconcileStaleRuns(stale.startedAt + LIVE_STALE_MS + 1)).toBe(1);
  expect(JSON.parse(cached['runs:ids'])).toContain(stale.id);
  expect(JSON.parse(cached[`run:${stale.id}`])).toMatchObject({ status: 'error', step: 'calendar.list (interrompido)' });
  expect(props[`RUNNING:${stale.id}`]).toBeUndefined();
  expect(JSON.parse(props[`STALE:${stale.id}`])).toMatchObject({ status: 'error', ms: 360_000 });
});

test('falha do cache depois da marca durável não recria uma fila já drenada', async () => {
  const { LIVE_STALE_MS, setStep, startRun } = await import('../src/trace');
  const stale = setStep(startRun('r-cache-fail', 'chat', 1_000), 'llm_call');
  cached['runs:ids'] = JSON.stringify([stale.id]);
  cached[`run:${stale.id}`] = JSON.stringify(stale);
  failRunPut = 1;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  const { reconcileStaleRuns } = await import('../src/runlog');
  expect(reconcileStaleRuns(stale.startedAt + LIVE_STALE_MS + 1)).toBe(1);
  expect(props[`STALE:${stale.id}`]).toBeDefined();
  expect(props[`Q:${stale.id}`]).toBeDefined();
  delete props[`Q:${stale.id}`]; // o lote drenou a primeira entrada

  expect(reconcileStaleRuns(stale.startedAt + LIVE_STALE_MS + 2)).toBe(0);
  expect(JSON.parse(cached[`run:${stale.id}`]).status).toBe('error');
  expect(props[`Q:${stale.id}`]).toBeUndefined();
});

test('falha da escrita durável mantém running e tenta de novo no minuto seguinte', async () => {
  const { LIVE_STALE_MS, setStep, startRun } = await import('../src/trace');
  const stale = setStep(startRun('r-props-fail', 'chat', 1_000), 'llm_call');
  cached['runs:ids'] = JSON.stringify([stale.id]);
  cached[`run:${stale.id}`] = JSON.stringify(stale);
  failSetProperties = 1;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  const { reconcileStaleRuns } = await import('../src/runlog');
  expect(reconcileStaleRuns(stale.startedAt + LIVE_STALE_MS + 1)).toBe(0);
  expect(JSON.parse(cached[`run:${stale.id}`]).status).toBe('running');
  expect(props[`STALE:${stale.id}`]).toBeUndefined();
  expect(reconcileStaleRuns(stale.startedAt + LIVE_STALE_MS + 2)).toBe(1);
  expect(JSON.parse(cached[`run:${stale.id}`]).status).toBe('error');
});

test('marcador de conclusão real impede que cache running antigo vire interrupção', async () => {
  const { finish, LIVE_STALE_MS, setStep, startRun } = await import('../src/trace');
  const running = setStep(startRun('r-real-done', 'chat', 1_000), 'llm_call');
  const done = finish(running, 20_000, { answer: 'respondeu' });
  cached['runs:ids'] = JSON.stringify([running.id]);
  cached[`run:${running.id}`] = JSON.stringify(running); // simula falha do cache terminal
  const { enqueue } = await import('../src/observe');
  enqueue(done);
  expect(props[`TERMINAL:${running.id}`]).toBeDefined();
  delete props[`Q:${running.id}`]; // conclusão real já drenada
  delete cached[`qjson:${running.id}`];

  const { reconcileStaleRuns } = await import('../src/runlog');
  expect(reconcileStaleRuns(running.startedAt + LIVE_STALE_MS + 1)).toBe(0);
  expect(JSON.parse(cached[`run:${running.id}`])).toMatchObject({ status: 'ok', answer: 'respondeu' });
  expect(props[`Q:${running.id}`]).toBeUndefined();
});

test('marcador terminal recompõe item e índice quando todo o cache ao vivo foi expulso', async () => {
  const { finish, startRun } = await import('../src/trace');
  const done = finish(startRun('r-terminal-only', 'chat', 1_000), 20_000, { answer: 'respondeu' });
  const { enqueue } = await import('../src/observe');
  enqueue(done);
  delete props[`Q:${done.id}`];
  delete cached[`qjson:${done.id}`];
  delete cached[`run:${done.id}`];
  delete cached['runs:ids'];

  const { reconcileStaleRuns } = await import('../src/runlog');
  expect(reconcileStaleRuns(30_000)).toBe(0);
  expect(JSON.parse(cached['runs:ids'])).toContain(done.id);
  expect(JSON.parse(cached[`run:${done.id}`])).toMatchObject({ status: 'ok', answer: 'respondeu' });
  expect(props[`Q:${done.id}`]).toBeUndefined();
});

test('conclusão só no cache é promovida novamente quando a persistência terminal falha', async () => {
  const { begin } = await import('../src/runlog');
  const t = begin('chat', { question: 'agenda?' }, { now: () => 1_000 });
  failSetProperties = 1;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const done = t.end({ answer: 'respondeu' });
  expect(props[`RUNNING:${done.id}`]).toBeDefined();
  expect(props[`TERMINAL:${done.id}`]).toBeUndefined();

  const { reconcileStaleRuns } = await import('../src/runlog');
  expect(reconcileStaleRuns(2_000)).toBe(0);
  expect(props[`RUNNING:${done.id}`]).toBeUndefined();
  expect(JSON.parse(props[`TERMINAL:${done.id}`])).toMatchObject({ status: 'ok', answer: 'respondeu' });
  expect(props[`Q:${done.id}`]).toBeDefined();
});

test('falha ao apagar RUNNING mantém o terminal além da expiração até remover o órfão', async () => {
  const { finish, startRun } = await import('../src/trace');
  const done = finish(startRun('r-orphan', 'chat', 1_000), 2_000, { answer: 'ok' });
  props[`RUNNING:${done.id}`] = JSON.stringify({ ...done, status: 'running', endedAt: undefined, ms: undefined });
  props[`TERMINAL:${done.id}`] = JSON.stringify(done);
  failDeleteProperty = 1;

  const { reconcileStaleRuns } = await import('../src/runlog');
  expect(reconcileStaleRuns(done.endedAt! + 86_400_001)).toBe(0);
  expect(props[`RUNNING:${done.id}`]).toBeDefined();
  expect(props[`TERMINAL:${done.id}`]).toBeDefined();

  expect(reconcileStaleRuns(done.endedAt! + 86_400_002)).toBe(0);
  expect(props[`RUNNING:${done.id}`]).toBeUndefined();
  expect(props[`TERMINAL:${done.id}`]).toBeUndefined();
  expect(props[`Q:${done.id}`]).toBeUndefined();
});

test('liveRuns não reenfileira um run já concluído', async () => {
  const { finish, startRun } = await import('../src/trace');
  const done = finish(startRun('r-done', 'chat', 1_000), 2_000, { answer: 'ok' });
  cached['runs:ids'] = JSON.stringify([done.id]);
  cached[`run:${done.id}`] = JSON.stringify(done);

  const { liveRuns, reconcileStaleRuns } = await import('../src/runlog');
  expect(liveRuns().recent[0]).toMatchObject({ id: done.id, status: 'ok' });
  expect(reconcileStaleRuns(done.startedAt + 999_999)).toBe(0);
  expect(Object.keys(props).some((k) => k.startsWith('Q:'))).toBe(false);
});

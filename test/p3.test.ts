import { afterEach, describe, expect, test, vi } from 'vitest';
import { parseP3Probe } from '../poc/p3-pump/harness';
import { P3_FIXED_BUDGET_PCT, P3_IDLE_MAX_MS, P3_WORKER_MAX_MS, isWorkspaceOwner, p3Verdict, projectedFixedMs, type P3Input } from '../poc/p3-pump/verdict';
import { runP3SyntheticWorker } from '../poc/p3-pump/worker';
import { newRun } from '../src/run';

const SECRET = '0123456789abcdef'.repeat(4);
const body = (out: unknown) => JSON.parse((out as { getContent: () => string }).getContent());

function stubGas() {
  const props: Record<string, string> = { OWNER: 'dono@x.com', CLI_SECRET: SECRET };
  const store = {
    getProperty: (k: string) => props[k] ?? null,
    setProperty: (k: string, v: string) => void (props[k] = v),
    getProperties: () => ({ ...props }),
    deleteProperty: (k: string) => void delete props[k],
  };
  const cache = { get: () => null, put: () => undefined, remove: () => undefined, removeAll: () => undefined, getAll: () => ({}) };
  vi.stubGlobal('__DEV__', true);
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => store });
  vi.stubGlobal('CacheService', { getScriptCache: () => cache });
  vi.stubGlobal('Session', { getActiveUser: () => ({ getEmail: () => 'dono@x.com' }), getEffectiveUser: () => ({ getEmail: () => 'dono@x.com' }) });
  vi.stubGlobal('ContentService', { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => ({ getContent: () => s }) }) });
}

afterEach(() => vi.unstubAllGlobals());

const completo = (over: Partial<P3Input> = {}): P3Input => ({
  worker: { ms: 3_049, completed: true },
  idle: { ms: 825, drained: 0, queued: 0 },
  quota: { projectedMsPerDay: 1_797_800, limitMsPerDay: 21_600_000 },
  ...over,
});

describe('P3: gatilho como worker dentro da cota do Workspace', () => {
  test('P3 fica registrada no endpoint de POCs do build dev', async () => {
    stubGas();
    const { doPost } = await import('../src/main');
    expect(body(doPost({ parameter: { action: 'poc', id: 'p3', step: 'reset', trace: '0', secret: SECRET } } as never))).toMatchObject({ poc: 'P3', step: 'reset', pass: true });
  });

  test('sonda sintética toca só o run P3 pedido, nunca o run real seguinte', async () => {
    vi.stubGlobal('__DEV__', true);
    const p3 = newRun({ runId: 'p3', session: 'agent:poc/p3', folderId: 'agent', user: 'dono@x.com', text: 'ok', now: 1 });
    const real = newRun({ runId: 'real', session: 'agent:tela/chat/dono', folderId: 'agent', user: 'dono@x.com', text: 'envie', now: 2 });
    const queue = [p3, real];
    const step = vi.fn(() => ({ turn: { text: 'ok', history: [], events: [], done: {}, granted: [] } }));
    const io = {
      claimById: (runId: string) => {
        const run = queue[0]?.runId === runId ? queue.shift() : undefined;
        return run ? { run, pointer: { runId: run.runId, folderId: run.folderId, session: run.session, at: 1, attempts: 1 } } : null;
      },
      save: () => undefined,
      dequeue: () => undefined,
      enqueue: () => undefined,
      forget: () => undefined, // ADR-029: run que acaba de vez tem a autoridade esquecida
    } as never;
    const pointers = [p3, real].map((r) => ({ runId: r.runId, session: r.session }));
    expect(runP3SyntheticWorker('p3', pointers, { io, step, clock: () => 10 }, 100).map((r) => r.runId)).toEqual(['p3']);
    expect(step).toHaveBeenCalledTimes(1);
    expect(queue.map((r) => r.runId)).toEqual(['real']);
    expect(runP3SyntheticWorker('outro', pointers, { io, step, clock: () => 10 }, 100)).toEqual([]);

    const racedStep = vi.fn(() => ({ turn: { text: 'ok', history: [], events: [], done: {}, granted: [] } }));
    const racedIo = {
      claimById: () => null,
      claimNext: () => ({ run: real, pointer: pointers[1] }),
      save: () => undefined,
      dequeue: () => undefined,
      enqueue: () => undefined,
      forget: () => undefined, // ADR-029: run que acaba de vez tem a autoridade esquecida
    } as never;
    expect(runP3SyntheticWorker('p3', pointers, { io: racedIo, step: racedStep, clock: () => 10 }, 100)).toEqual([]);
    expect(racedStep).not.toHaveBeenCalled();
  });

  test('medição completa dentro dos tetos passa', () => {
    const r = p3Verdict(completo());
    expect(r).toMatchObject({ pass: true, aborted: false });
    expect(r.checks.map((c) => c.id)).toEqual(['C1', 'C2', 'C3', 'C4']);
  });

  test('C1 exige conclusão bem-sucedida, não apenas timestamp alterado', () => {
    expect(p3Verdict(completo({ worker: { ms: 3_049, completed: false } })).checks[0]).toMatchObject({ id: 'C1', pass: false });
  });

  test('C2 limita o overhead de um passo sintético dentro do gatilho', () => {
    expect(p3Verdict(completo({ worker: { ms: P3_WORKER_MAX_MS, completed: true } })).checks.find((c) => c.id === 'C2')).toMatchObject({ pass: true });
    const r = p3Verdict(completo({ worker: { ms: P3_WORKER_MAX_MS + 1, completed: true } }));
    expect(r.checks.find((c) => c.id === 'C2')).toMatchObject({ pass: false });
  });

  test('C3 exige fila de trace vazia e despertar ocioso abaixo do teto', () => {
    expect(p3Verdict(completo({ idle: { ms: P3_IDLE_MAX_MS, drained: 0, queued: 0 } })).checks.find((c) => c.id === 'C3')).toMatchObject({ pass: false });
    expect(p3Verdict(completo({ idle: { ms: 100, drained: 1, queued: 0 } })).checks.find((c) => c.id === 'C3')).toMatchObject({ pass: false });
    expect(p3Verdict(completo({ idle: { ms: 100, drained: 0, queued: 1 } })).checks.find((c) => c.id === 'C3')).toMatchObject({ pass: false });
  });

  test('C4 reserva no máximo 20% da cota para polling e orquestração', () => {
    const limit = 21_600_000;
    expect(p3Verdict(completo({ quota: { projectedMsPerDay: limit * (P3_FIXED_BUDGET_PCT / 100), limitMsPerDay: limit } })).checks.find((c) => c.id === 'C4')).toMatchObject({ pass: true });
    const r = p3Verdict(completo({ quota: { projectedMsPerDay: limit * (P3_FIXED_BUDGET_PCT / 100) + 1, limitMsPerDay: limit } }));
    expect(r.checks.find((c) => c.id === 'C4')).toMatchObject({ pass: false });
  });

  test('medição incompleta não passa', () => {
    const r = p3Verdict({ worker: { ms: 3_049, completed: true } });
    expect(r.pass).toBe(false);
    expect(r.checks.map((c) => c.id)).toEqual(['C1', 'C2']);
  });

  test('projeção fixa o exemplo medido e a conta Workspace', () => {
    expect(projectedFixedMs(283, 311)).toBe(504_440);
    expect(isWorkspaceOwner('owner@example.com')).toBe(true);
    expect(isWorkspaceOwner('ana@gmail.com')).toBe(false);
    expect(isWorkspaceOwner('ana@googlemail.com')).toBe(false);
  });

  test('resultado ausente ou corrompido da sonda vira null', () => {
    expect(parseP3Probe(null)).toBeNull();
    expect(parseP3Probe('{')).toBeNull();
    expect(parseP3Probe('{"ok":false}')).toEqual({ ok: false });
  });
});

import { describe, expect, it } from 'vitest';
import { newRun } from '../src/run';
import { p4Verdict } from '../poc/p4-run/verdict';
import { p4SyntheticTurn } from '../poc/p4-run/worker';

describe('P4: run durável em três execuções', () => {
  it('aprova o mesmo run em 3+ execuções, resposta final e um único efeito', () => {
    const runId = 'p4-abc';
    const result = p4Verdict({
      runId,
      executions: [
        { executionId: 'e1', runId, status: 'queued', snapshotStep: 1 },
        { executionId: 'e2', runId, status: 'queued', snapshotStep: 2 },
        { executionId: 'e3', runId, status: 'done', answer: 'p4-ok' },
      ],
      effectCount: 1,
      doneKeys: [`${runId}:0:p4-effect`],
    });

    expect(result.pass).toBe(true);
    expect(result.checks.map((c) => [c.id, c.pass])).toEqual([
      ['C1', true],
      ['C2', true],
      ['C3', true],
    ]);
  });

  it.each([
    ['menos de 3 execuções', { executions: [{ executionId: 'e1', runId: 'r', status: 'done' as const, answer: 'p4-ok' }] }],
    ['mais de 3 execuções', { executions: [{ executionId: 'e1', runId: 'r', status: 'queued' as const, snapshotStep: 1 }, { executionId: 'e2', runId: 'r', status: 'queued' as const, snapshotStep: 2 }, { executionId: 'e3', runId: 'r', status: 'failed' as const }, { executionId: 'e4', runId: 'r', status: 'done' as const, answer: 'p4-ok' }] }],
    ['id de execução repetido', { executions: [{ executionId: 'e1', runId: 'r', status: 'queued' as const, snapshotStep: 1 }, { executionId: 'e1', runId: 'r', status: 'queued' as const, snapshotStep: 2 }, { executionId: 'e3', runId: 'r', status: 'done' as const, answer: 'p4-ok' }] }],
    ['runId mudou', { executions: [{ executionId: 'e1', runId: 'r', status: 'queued' as const, snapshotStep: 1 }, { executionId: 'e2', runId: 'outro', status: 'queued' as const, snapshotStep: 2 }, { executionId: 'e3', runId: 'r', status: 'done' as const, answer: 'p4-ok' }] }],
    ['primeiro checkpoint começou em zero', { executions: [{ executionId: 'e1', runId: 'r', status: 'queued' as const, snapshotStep: 0 }, { executionId: 'e2', runId: 'r', status: 'queued' as const, snapshotStep: 2 }, { executionId: 'e3', runId: 'r', status: 'done' as const, answer: 'p4-ok' }] }],
    ['checkpoint não avançou', { executions: [{ executionId: 'e1', runId: 'r', status: 'queued' as const, snapshotStep: 1 }, { executionId: 'e2', runId: 'r', status: 'queued' as const, snapshotStep: 1 }, { executionId: 'e3', runId: 'r', status: 'done' as const, answer: 'p4-ok' }] }],
    ['execução intermediária não ficou queued', { executions: [{ executionId: 'e1', runId: 'r', status: 'failed' as const, snapshotStep: 1 }, { executionId: 'e2', runId: 'r', status: 'queued' as const, snapshotStep: 2 }, { executionId: 'e3', runId: 'r', status: 'done' as const, answer: 'p4-ok' }] }],
    ['execução final ainda tinha checkpoint', { executions: [{ executionId: 'e1', runId: 'r', status: 'queued' as const, snapshotStep: 1 }, { executionId: 'e2', runId: 'r', status: 'queued' as const, snapshotStep: 2 }, { executionId: 'e3', runId: 'r', status: 'done' as const, snapshotStep: 3, answer: 'p4-ok' }] }],
    ['resposta final errada', { executions: [{ executionId: 'e1', runId: 'r', status: 'queued' as const, snapshotStep: 1 }, { executionId: 'e2', runId: 'r', status: 'queued' as const, snapshotStep: 2 }, { executionId: 'e3', runId: 'r', status: 'done' as const, answer: 'outra' }] }],
    ['efeito ausente', { effectCount: 0 }],
    ['efeito duplicado', { effectCount: 2 }],
    ['chave durável ausente', { doneKeys: [] }],
    ['chave durável errada', { doneKeys: ['r:0:outra'] }],
    ['chave durável extra', { doneKeys: ['r:0:p4-effect', 'r:0:outra'] }],
  ])('reprova quando %s', (_name, override) => {
    const base = {
      runId: 'r',
      executions: [{ executionId: 'e1', runId: 'r', status: 'queued' as const, snapshotStep: 1 }, { executionId: 'e2', runId: 'r', status: 'queued' as const, snapshotStep: 2 }, { executionId: 'e3', runId: 'r', status: 'done' as const, answer: 'p4-ok' }],
      effectCount: 1,
      doneKeys: ['r:0:p4-effect'],
    };
    expect(p4Verdict({ ...base, ...override }).pass).toBe(false);
  });
});

describe('worker sintético da P4', () => {
  it('faz checkpoint por execução e não repete o efeito já gravado', () => {
    const base = newRun({ runId: 'r', session: 'f:poc/p4', folderId: 'f', user: 'dono@x.com', text: 'p4', now: 1 });
    let effects = 0;

    const first = p4SyntheticTurn(base, () => effects++).turn;
    expect(first.state?.step).toBe(1);
    expect(first.done).toEqual({ 'r:0:p4-effect': 'ok' });

    const resumed = { ...base, done: first.done, snapshot: first.state };
    const second = p4SyntheticTurn(resumed, () => effects++).turn;
    expect(second.state?.step).toBe(2);

    const final = p4SyntheticTurn({ ...resumed, snapshot: second.state }, () => effects++).turn;
    expect(final.text).toBe('p4-ok');
    expect(final.stopped).toBeUndefined();
    expect(effects).toBe(1);
  });
});

import { describe, expect, test } from 'vitest';
import { newRun } from '../src/run';
import { syntheticTurn } from '../poc/p3-pump/worker';

describe('step sintético da POC P3', () => {
  test('termina um run sem chamar modelo nem tools reais', () => {
    const r = newRun({ runId: 'p3-x', session: 'agent:poc/p3', folderId: 'agent', user: 'dono@x.com', text: 'responda apenas: ok', now: 1 });
    expect(syntheticTurn(r)).toMatchObject({
      usd: 0,
      turn: { text: 'ok', events: [], done: {}, granted: [] },
    });
  });
});

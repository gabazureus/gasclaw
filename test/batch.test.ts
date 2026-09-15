import { describe, expect, test } from 'vitest';
import { drainBody, QUEUE_PREFIX, queueEntry, shouldDrain, splitQueue } from '../src/batch';
import { finish, span, startRun } from '../src/trace';

const T0 = Date.UTC(2026, 8, 15, 12, 0);
const run = () => finish(span(startRun('r1', 'chat', T0, { question: 'oi sk-or-CANARY-x' }), 'llm_call', T0, T0 + 900, { model: 'a:free', prompt_tokens: 3, completion_tokens: 2, cost: 0 }), T0 + 1000, { answer: 'olá' });

describe('queueEntry (o que o turno grava na fila)', () => {
  test('linha da planilha e registros de uso já prontos e redigidos; pequeno o bastante para uma Property (9 KB)', () => {
    const e = queueEntry(run());
    expect(e.id).toBe('r1');
    expect(e.at).toBe(T0 + 1000);
    expect(e.recs).toEqual([{ at: T0, model: 'a:free', tokens: 5, cost: 0 }]);
    expect(e.row[0]).toBe('r1');
    expect(JSON.stringify(e)).not.toContain('CANARY');
    expect(JSON.stringify(e).length).toBeLessThan(9000);
  });
  test('pergunta e resposta enormes continuam cabendo (a linha corta em 200)', () => {
    const big = { ...run(), question: 'x'.repeat(50_000), answer: 'y'.repeat(50_000) };
    expect(JSON.stringify(queueEntry(big)).length).toBeLessThan(9000);
  });
});

describe('shouldDrain', () => {
  test('gatilho ativo: o turno e a tela nunca drenam (quem drena é o gatilho)', () => {
    expect(shouldDrain(T0 - 10 * 60_000, T0, true)).toBe(false);
  });
  test('sem gatilho: drena quando o item mais antigo tem mais de 1 min', () => {
    expect(shouldDrain(T0 - 61_000, T0, false)).toBe(true);
    expect(shouldDrain(T0 - 30_000, T0, false)).toBe(false);
    expect(shouldDrain(null, T0, false)).toBe(false);
  });
});

describe('drainBody: nenhum run se perde quando o cache expira', () => {
  test('com o JSON completo no cache, grava o completo', () => {
    expect(drainBody(queueEntry(run()), '{"completo":true}')).toBe('{"completo":true}');
  });
  test('sem o JSON no cache (expirou), grava a entrada da fila: linha e uso continuam, com nota', () => {
    const e = queueEntry(run());
    const body = JSON.parse(drainBody(e, undefined));
    expect(body).toMatchObject({ id: 'r1', row: e.row, recs: e.recs });
    expect(body.nota).toMatch(/expirou/);
  });
});

test('splitQueue: só as Properties da fila, ordenadas da mais antiga para a mais nova', () => {
  const props = {
    OPENROUTER_API_KEY: 'sk-or-x',
    [`${QUEUE_PREFIX}b`]: JSON.stringify({ id: 'b', at: 2, row: [], recs: [] }),
    [`${QUEUE_PREFIX}a`]: JSON.stringify({ id: 'a', at: 1, row: [], recs: [] }),
    'USAGE:h:2026-09-15': '{}',
  };
  expect(splitQueue(props).map((e) => e.id)).toEqual(['a', 'b']);
});

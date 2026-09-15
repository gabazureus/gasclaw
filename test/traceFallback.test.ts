import { expect, test } from 'vitest';
import { drainBody, queueEntry } from '../src/batch';
import { finish, renderTree, startRun } from '../src/trace';

test('detalhe do run com o JSON de reserva do lote (cache expirou, sem spans) não quebra e mostra a linha', () => {
  const e = queueEntry(finish(startRun('r9', 'chat', 1, {}), 2, { answer: 'ok' }));
  const run = JSON.parse(drainBody(e, undefined));
  expect(renderTree(run)).toContain('r9 · chat · ok');
});

test('JSON antigo sem spans (gravado antes da correção) também não quebra', () => {
  expect(() => renderTree({ id: 'r8', row: [], recs: [] } as never)).not.toThrow();
});

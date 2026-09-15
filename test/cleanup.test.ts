import { describe, expect, test } from 'vitest';
import { cleanupRequest, runCleanup } from '../src/tools/cleanup';
import type { GReq } from '../src/tools/google';

describe('limpeza dos dados de teste dos evals', () => {
  test('calendar.create aprovado → DELETE do evento, sem avisar convidados', () => {
    expect(cleanupRequest('calendar.create', '{"id":"abc123","link":"l","meet":null}')).toEqual({
      method: 'delete',
      url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events/abc123?sendUpdates=none',
    });
  });
  test('gmail.draft → DELETE do rascunho; gmail.send não tem desfazer', () => {
    expect(cleanupRequest('gmail.draft', '{"id":"r-12345"}')).toEqual({ method: 'delete', url: 'https://gmail.googleapis.com/gmail/v1/users/me/drafts/r-12345' });
    expect(cleanupRequest('gmail.send', '{"id":"sent12345"}')).toBeNull();
  });
  test.each([
    ['calendar.list', '{"id":"abc123"}'],
    ['calendar.create', 'não é json'],
    ['calendar.create', '{"id":"../../x"}'],
    ['calendar.create', '{}'],
  ])('%s %s → nada a limpar', (name, result) => expect(cleanupRequest(name, result)).toBeNull());

  test('runCleanup apaga o que foi criado e conta falhas sem lançar', () => {
    const reqs: GReq[] = [];
    const events = [
      { name: 'calendar.create', status: 'approved', result: '{"id":"ev001"}' },
      { name: 'calendar.create', status: 'pending', result: 'aguardando aprovação' },
      { name: 'calendar.create', status: 'ok', result: '{"id":"ev002"}' },
      { name: 'now', status: 'ok', result: '10:00' },
    ];
    let n = 0;
    const out = runCleanup(events, (r) => (reqs.push(r), ++n === 1 ? { code: 204, body: '' } : { code: 500, body: 'boom' }));
    expect(reqs.map((r) => r.url.split('/events/')[1])).toEqual(['ev001?sendUpdates=none', 'ev002?sendUpdates=none']);
    expect(out).toEqual({ removed: 1, missing: 0, failed: ['calendar.create ev002: Google limpar calendar.create 500: boom'] });
  });
  test('410/404 (já apagado) conta separado como "já não existia"', () => {
    expect(runCleanup([{ name: 'calendar.create', status: 'ok', result: '{"id":"ev001"}' }], () => ({ code: 410, body: 'gone' }))).toEqual({ removed: 0, missing: 1, failed: [] });
  });
});

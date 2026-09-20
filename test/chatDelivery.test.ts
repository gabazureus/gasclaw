import { describe, expect, test } from 'vitest';
import { authorizedDelivery, deliveryDue, markDeliverySent, newChatDelivery, sendChatDelivery } from '../src/chatDelivery';
import { newRun, type RunAuthority } from '../src/run';

const NOW = 1_700_000_000_000;

describe('entrega assincrona duravel', () => {
  test('preserva destino, requestId e prazo minimo sem guardar credencial', () => {
    const delivery = newChatDelivery('spaces/AAA', 'spaces/AAA/threads/T1', '123e4567-e89b-42d3-a456-426614174000', NOW, 120_000);
    expect(delivery).toEqual({ kind: 'google-chat', space: 'spaces/AAA', thread: 'spaces/AAA/threads/T1', requestId: '123e4567-e89b-42d3-a456-426614174000', notBefore: NOW + 120_000, status: 'pending' });
    expect(JSON.stringify(delivery)).not.toMatch(/token|credential|secret/i);
  });

  test('so entrega run terminal depois do prazo e ainda pendente', () => {
    const delivery = newChatDelivery('spaces/AAA', undefined, '123e4567-e89b-42d3-a456-426614174000', NOW, 120_000);
    const run = newRun({ runId: 'r1', session: 'f1:spaces/AAA', folderId: 'f1', user: 'dono@x.com', text: 'oi', now: NOW, delivery });
    expect(deliveryDue({ ...run, status: 'queued' }, NOW + 120_000)).toBe(false);
    expect(deliveryDue({ ...run, status: 'waiting' }, NOW + 120_000)).toBe(false);
    expect(deliveryDue({ ...run, status: 'paused' }, NOW + 120_000)).toBe(false);
    expect(deliveryDue({ ...run, status: 'done' }, NOW + 119_999)).toBe(false);
    expect(deliveryDue({ ...run, status: 'done' }, NOW + 120_000)).toBe(true);
    expect(deliveryDue({ ...run, status: 'failed' }, NOW + 120_000)).toBe(true);
  });

  test('recibo impede novo envio e preserva o requestId original', () => {
    const delivery = newChatDelivery('spaces/AAA', undefined, '123e4567-e89b-42d3-a456-426614174000', NOW, 0);
    const sent = markDeliverySent(delivery, 'spaces/AAA/messages/M1', NOW + 1);
    expect(sent).toMatchObject({ status: 'sent', requestId: delivery.requestId, messageName: 'spaces/AAA/messages/M1', sentAt: NOW + 1 });
    const run = newRun({ runId: 'r1', session: 'f1:spaces/AAA', folderId: 'f1', user: 'dono@x.com', text: 'oi', now: NOW, delivery: sent });
    expect(deliveryDue({ ...run, status: 'done' }, NOW + 2)).toBe(false);
  });

  test('envia texto sanitizado e retry depois de checkpoint falho reutiliza requestId', () => {
    const delivery = newChatDelivery('spaces/AAA', undefined, '123e4567-e89b-42d3-a456-426614174000', NOW, 0);
    const run = { ...newRun({ runId: 'r1', session: 'f1:spaces/AAA', folderId: 'f1', user: 'dono@x.com', text: 'oi', now: NOW, delivery }), status: 'done' as const, answer: '**pronto** <users/all>' };
    const requests: unknown[] = [];
    const create = (input: unknown) => (requests.push(input), { name: 'spaces/AAA/messages/M1' });
    const ponteiro: RunAuthority = { space: 'spaces/AAA', auth: 'a' };
    expect(() => sendChatDelivery(run, NOW + 1, create, () => { throw new Error('Drive caiu'); }, ponteiro)).toThrow('Drive caiu');
    const sent = sendChatDelivery(run, NOW + 2, create, () => undefined, ponteiro);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ requestId: delivery.requestId, message: { text: '**pronto** &lt;users/all>', markupSyntax: 'MARKUP_SYNTAX_MARKDOWN' } });
    expect(requests[1]).toMatchObject({ requestId: delivery.requestId });
    expect(sent.delivery?.status).toBe('sent');
  });

  // Auditoria 2026-09-18: `sentAt` era o mesmo numero capturado ANTES do POST, entao `updatedAt === sentAt`
  // sempre e toda latencia derivada dele excluia o round-trip do Chat — a medicao confirmava a si mesma.
  test('sentAt e lido depois do POST, nao antes (a chamada entra na latencia)', () => {
    const delivery = newChatDelivery('spaces/AAA', undefined, '123e4567-e89b-42d3-a456-426614174000', NOW, 0);
    const run = { ...newRun({ runId: 'r1', session: 'f1:spaces/AAA', folderId: 'f1', user: 'dono@x.com', text: 'oi', now: NOW, delivery }), status: 'done' as const, answer: 'pronto' };
    let relogio = NOW;
    const create = () => {
      relogio += 850; // o POST ao Google levou 850 ms
      return { name: 'spaces/AAA/messages/M1' };
    };

    const sent = sendChatDelivery(run, NOW, create, () => undefined, { space: 'spaces/AAA', auth: 'a' }, () => relogio);

    expect(sent.delivery?.sentAt).toBe(NOW + 850); // e nao NOW
    expect(sent.updatedAt).toBe(NOW + 850);
  });
});

// Auditoria 2026-09-18, fatia 1 da Opcao 2: o destino da entrega e AUTORIDADE e por isso nao pode morar
// no arquivo do run, que vive na pasta compartilhavel do agente. Trocando `delivery.space` ali, a resposta
// do dono seria publicada num espaco do atacante — exfiltracao direta, sem depender de clique nenhum.
// Mesmo principio de `ACCESS:<folderId>` (ADR-021): a pasta sugere, a autoridade mora nas Script Properties.
describe('destino da entrega: autoridade no ponteiro, nao no arquivo', () => {
  const delivery = newChatDelivery('spaces/AAA', undefined, '123e4567-e89b-42d3-a456-426614174000', NOW, 0);
  const run = { ...newRun({ runId: 'r1', session: 'f1:spaces/AAA', folderId: 'f1', user: 'dono@x.com', text: 'oi', now: NOW, delivery }), status: 'done' as const, answer: 'segredo do dono' };
  const ponteiro: RunAuthority = { space: 'spaces/AAA', auth: 'assinatura' };

  test('arquivo batendo com o registro de autoridade: entrega liberada', () => {
    expect(authorizedDelivery(run.delivery, ponteiro)).toEqual({ ok: true, space: 'spaces/AAA' });
  });

  test('arquivo adulterado para outro espaço: RECUSA', () => {
    const adulterado = { ...run.delivery!, space: 'spaces/ATACANTE' };
    expect(authorizedDelivery(adulterado, ponteiro)).toMatchObject({ ok: false });
  });

  test('arquivo adulterado para cair numa thread: RECUSA', () => {
    const adulterado = { ...run.delivery!, thread: 'spaces/AAA/threads/T9' };
    expect(authorizedDelivery(adulterado, ponteiro)).toMatchObject({ ok: false });
  });

  test('ponteiro legado (sem destino) falha fechado: não entrega', () => {
    const legado = { ...ponteiro, space: undefined } as RunAuthority;
    expect(authorizedDelivery(run.delivery, legado)).toMatchObject({ ok: false });
  });

  test('sem registro nenhum falha fechado', () => {
    expect(authorizedDelivery(run.delivery, null)).toMatchObject({ ok: false });
  });

  test('o envio usa o destino REGISTRADO e recusa de vez quando o arquivo diverge', () => {
    const adulterado = { ...run, delivery: { ...run.delivery!, space: 'spaces/ATACANTE' } };
    const enviados: unknown[] = [];
    const salvos: unknown[] = [];
    const out = sendChatDelivery(adulterado, NOW, (i) => (enviados.push(i), { name: 'spaces/ATACANTE/messages/M1' }), (r) => void salvos.push(r), ponteiro);

    expect(enviados).toHaveLength(0); // nada foi publicado no espaço do atacante
    expect(out.delivery?.status).toBe('failed'); // recusa definitiva, não retry
    expect(out.answer).toBe('segredo do dono'); // a resposta continua no painel
    expect(out.error).toMatch(/destination/i);
    expect(salvos).toHaveLength(1);
  });

  test('o registro de autoridade continua muito abaixo dos 9 KB por valor', () => {
    const grande: RunAuthority = { space: `spaces/${'A'.repeat(64)}`, thread: `spaces/${'A'.repeat(64)}/threads/${'T'.repeat(64)}`, auth: 'f'.repeat(64) };
    expect(JSON.stringify(grande).length).toBeLessThan(1_000); // 9 KB é o teto por valor; 500 KB no total
  });
});

import { createAsChatApp, getAsChatApp, spacesAsChatApp } from '../../src/chatApiGas';
import { deliveryDue, newChatDelivery, sendChatDelivery } from '../../src/chatDelivery';
import { newRun, type DurableRun } from '../../src/run';
import { type RunIO } from '../../src/runStore';
import * as store from '../../src/store';
import { ensureTrigger } from '../../src/observe';
import { p2Verdict, type P2Measurement } from './verdict';

const LOCATOR = 'poc:p2:locator';
const FIRST = 'poc:p2:first-send';
const RETRY = 'poc:p2:retry-send';
export const P2_PROTOCOL = 'chat-app-iam-v2';

type Locator = { folderId: string; runId: string; eventAt: number; inlineName: string; inlineSentAt: number };
type Receipt = { name: string; sentAt: number; requestId: string };

const props = () => PropertiesService.getScriptProperties();
const readJson = <T>(key: string): T | null => {
  try { return JSON.parse(props().getProperty(key) ?? 'null') as T | null; } catch { return null; }
};

/** Evento real no Chat dev: cria um run terminal no Drive; o worker comum e quem o entrega. */
export function startP2Event(space: string, thread: string | undefined, io: RunIO): { eventAt: number; dueAt: number; requestId: string } {
  const agent = store.listAgents()[0];
  if (!agent) throw new Error('nenhum agente configurado');
  const eventAt = Date.now();
  const runId = `p2-${Utilities.getUuid()}`;
  const delivery = newChatDelivery(space, thread, Utilities.getUuid(), eventAt, undefined, 'p2');
  const run: DurableRun = {
    ...newRun({ runId, session: `${agent.folderId}:${space}`, folderId: agent.folderId, user: store.getOwner() ?? '', text: '/poc p2', now: eventAt, ownerDm: true, delivery }),
    status: 'done',
    answer: '**POC P2 concluida** <users/all>',
  };
  io.enqueue(run, eventAt);
  // Sem `thread`: o "pensando..." entra no fluxo do espaco, igual a resposta final.
  const inline = createAsChatApp({ space, requestId: Utilities.getUuid(), message: { text: 'pensando...' } });
  const inlineSentAt = Date.now();
  props().deleteProperty(FIRST);
  props().deleteProperty(RETRY);
  props().setProperty(LOCATOR, JSON.stringify({ folderId: agent.folderId, runId, eventAt, inlineName: inline.name, inlineSentAt } satisfies Locator));
  return { eventAt, dueAt: delivery.notBefore, requestId: delivery.requestId };
}

/** Entregador do worker. A primeira tentativa simula morte depois do POST e antes do checkpoint no Drive. */
export function deliverP2Probe(run: DurableRun, io: RunIO, now = Date.now()): DurableRun {
  if (run.delivery?.probe !== 'p2' || !deliveryDue(run, now)) return run;
  const first = readJson<Receipt>(FIRST);
  if (!first) {
    try {
      return sendChatDelivery(run, now, (input) => {
        const receipt = createAsChatApp(input);
        props().setProperty(FIRST, JSON.stringify({ name: receipt.name, sentAt: now, requestId: input.requestId } satisfies Receipt));
        return receipt;
      }, () => { throw new Error('P2: morte simulada antes do checkpoint'); }, io.authority(run.runId));
    } catch {
      // O ponteiro terminal continua na fila; uma morte real nao executaria codigo de recuperacao aqui.
      return run;
    }
  }
  const sent = sendChatDelivery(run, first.sentAt, (input) => {
    const receipt = createAsChatApp(input);
    props().setProperty(RETRY, JSON.stringify({ name: receipt.name, sentAt: now, requestId: input.requestId } satisfies Receipt));
    return receipt;
  }, io.save, io.authority(run.runId));
  return sent;
}

function finish(io: RunIO, params: Record<string, string>) {
  const locator = readJson<Locator>(LOCATOR);
  const first = readJson<Receipt>(FIRST);
  const retry = readJson<Receipt>(RETRY);
  if (!locator || !first || !retry) throw new Error('a entrega P2 ainda nao terminou');
  const run = io.load(locator.folderId, locator.runId);
  if (!run?.delivery?.messageName || !run.delivery.sentAt) throw new Error('checkpoint P2 ausente no Drive');
  const confirmed = getAsChatApp(run.delivery.messageName);
  const expectedCard = confirmed.cardsV2.some((value) => {
    const item = value as { cardId?: unknown; card?: { header?: { title?: unknown }; sections?: unknown[] } };
    return item.cardId === 'p2-chat-assincrono'
      && item.card?.header?.title === 'gasclaw - POC P2'
      && Array.isArray(item.card.sections)
      && item.card.sections.length === 1;
  });
  const inline = getAsChatApp(locator.inlineName);
  const measurement: P2Measurement = {
    eventAt: locator.eventAt,
    sentAt: first.sentAt,
    space: run.delivery.space,
    messageName: first.name,
    retryName: retry.name,
    requestIdStable: first.requestId === run.delivery.requestId && retry.requestId === run.delivery.requestId,
    confirmedCards: confirmed.cardsV2.length,
    expectedCard,
    markdownRendered: confirmed.text.includes('**POC P2 concluida**'),
    mentionNeutralized: confirmed.text.includes('&lt;users/all>'),
    inlineText: inline.text,
    inlineMs: locator.inlineSentAt - locator.eventAt,
    userManagedKeys: Number(params.userManagedKeys),
    policyExact: params.policyExact === 'true',
    secretLeaks: Number(params.secretLeaks),
  };
  return p2Verdict(measurement);
}

export function pocP2(step: string | undefined, params: Record<string, string>, io: RunIO) {
  if (step === 'protocol') return { poc: 'P2', protocol: P2_PROTOCOL, pass: true };
  if (step === 'auth') {
    const spaces = spacesAsChatApp();
    const trigger = ensureTrigger();
    return { poc: 'P2', step, pass: spaces.some((s) => s.type === 'DIRECT_MESSAGE') && trigger === 'active', spaces: spaces.length, trigger };
  }
  if (step === 'reset') {
    props().deleteProperty(LOCATOR); props().deleteProperty(FIRST); props().deleteProperty(RETRY);
    return { poc: 'P2', step, pass: true };
  }
  if (step === 'status') {
    const locator = readJson<Locator>(LOCATOR);
    const run = locator ? io.load(locator.folderId, locator.runId) : null;
    return { poc: 'P2', step, pass: run?.delivery?.status === 'sent', eventAt: locator?.eventAt ?? null, delivery: run?.delivery ?? null };
  }
  if (step === 'finish') return finish(io, params);
  throw new Error(`etapa desconhecida da P2: ${step}`);
}

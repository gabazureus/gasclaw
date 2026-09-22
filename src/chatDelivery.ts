import type { DurableRun, RunAuthority } from './run';
import { CHAT_MARKUP_SYNTAX, safeChatMarkdown } from './chatFormat';
import type { ChatMessage } from './chatApi';

export const P2_DELAY_MS = 120_000;

export type ChatDelivery = {
  kind: 'google-chat';
  space: string;
  thread?: string;
  requestId: string;
  notBefore: number;
  /** `failed` = desistimos de entregar depois de MAX_ATTEMPTS. A RESPOSTA continua no run, para o painel. */
  status: 'pending' | 'sent' | 'failed';
  messageName?: string;
  sentAt?: number;
  probe?: 'p2';
};

const SPACE = /^spaces\/[A-Za-z0-9_-]+$/;
const THREAD = /^spaces\/[A-Za-z0-9_-]+\/threads\/[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function newChatDelivery(space: string, thread: string | undefined, requestId: string, eventAt: number, delayMs = P2_DELAY_MS, probe?: 'p2'): ChatDelivery {
  if (!SPACE.test(space) || (thread !== undefined && !THREAD.test(thread)) || !UUID.test(requestId) || !Number.isFinite(eventAt) || delayMs < 0) throw new Error('entrega do Chat invalida');
  return { kind: 'google-chat', space, ...(thread ? { thread } : {}), requestId, notBefore: eventAt + delayMs, status: 'pending', ...(probe ? { probe } : {}) };
}

export const deliveryDue = (run: DurableRun, now: number): boolean =>
  !!run.delivery && run.delivery.status === 'pending' && ['done', 'failed'].includes(run.status) && Number.isFinite(now) && now >= run.delivery.notBefore;

/**
 * `requestId` determinístico a partir de um SHA-256 em hex: a Chat API devolve a mensagem já criada quando o
 * mesmo `requestId` chega de novo, e é isso que torna idempotente repetir o POST de um cartão. Formato UUID
 * (versão 5, variante RFC), que é o que `createChatMessage` aceita.
 */
export function stableRequestId(sha256Hex: string): string {
  const h = sha256Hex.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) throw new Error('requestId seed must be a SHA-256 hex digest');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${(8 | (parseInt(h[16], 16) & 3)).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function markDeliverySent(delivery: ChatDelivery, messageName: string, sentAt: number): ChatDelivery {
  if (!new RegExp(`^${delivery.space.replace('/', '\\/')}\/messages\/[A-Za-z0-9._-]+$`).test(messageName) || !Number.isFinite(sentAt)) throw new Error('recibo do Chat invalido');
  return { ...delivery, status: 'sent', messageName, sentAt };
}

/**
 * Desistir de entregar depois de MAX_ATTEMPTS. NUNCA descarta a resposta: `answer` e `status` do run ficam
 * intactos (o painel continua mostrando o que o agente respondeu) e o motivo vai para `error`, honestamente.
 * Com a entrega fora de `pending`, o run sai da fila e para de queimar UrlFetch.
 */
export const deliveryGivenUp = (run: DurableRun, reason: string, now: number): DurableRun =>
  run.delivery ? { ...run, delivery: { ...run.delivery, status: 'failed' }, error: reason, updatedAt: now } : run;

export type DeliveryTarget = { ok: true; space: string; thread?: string } | { ok: false; reason: string };

/**
 * Para onde esta resposta PODE ir. A autoridade e o ponteiro (Script Properties), nunca o arquivo do run
 * (pasta compartilhavel do agente). Divergencia nao e erro transitorio: e sinal de adulteracao, entao
 * recusa e falha fechada. Ponteiro legado, sem destino gravado, tambem recusa — ver README/ADR.
 */
export function authorizedDelivery(delivery: ChatDelivery | undefined, authority: RunAuthority | null | undefined): DeliveryTarget {
  if (!delivery) return { ok: false, reason: 'this run has no delivery' };
  if (!authority?.space) return { ok: false, reason: 'no destination on record (run predates this version): there is no way to confirm where the answer should go' };
  if (delivery.space !== authority.space) return { ok: false, reason: 'the destination in the run file differs from the one on record' };
  if ((delivery.thread ?? '') !== (authority.thread ?? '')) return { ok: false, reason: 'the thread in the run file differs from the one on record' };
  return { ok: true, space: authority.space, ...(authority.thread ? { thread: authority.thread } : {}) };
}

export function chatMessageFor(run: DurableRun): ChatMessage {
  const text = safeChatMarkdown(run.answer ?? (run.status === 'failed' ? `Nao consegui terminar: ${run.error ?? 'unknown error'}` : 'Pronto.'));
  if (run.delivery?.probe === 'p2') return {
    text,
    markupSyntax: CHAT_MARKUP_SYNTAX,
    cardsV2: [{ cardId: 'p2-chat-assincrono', card: { header: { title: 'gasclaw - POC P2' }, sections: [{ widgets: [{ textParagraph: { text: 'Card enviado como o app com token efemero do IAM, sem chave armazenada.' } }] }] } }],
  };
  return { text, markupSyntax: CHAT_MARKUP_SYNTAX };
}

/**
 * `now` decide se a hora chegou; `sentAt` é lido SÓ DEPOIS do POST.
 *
 * Antes os dois eram o mesmo número, capturado antes da chamada: `updatedAt === sentAt` sempre, e toda
 * latência medida a partir daí excluía o round-trip do Chat — a medição confirmava a si mesma.
 */
export function sendChatDelivery(
  run: DurableRun,
  now: number,
  create: (input: { space: string; thread?: string; requestId: string; message: ChatMessage }) => { name: string },
  save: (run: DurableRun) => void,
  authority: RunAuthority | null | undefined,
  clock: () => number = Date.now,
): DurableRun {
  if (!run.delivery || !deliveryDue(run, now)) return run;
  // O destino sai do PONTEIRO, nao do arquivo: mesmo que esta guarda falhasse, nao ha para onde exfiltrar.
  const alvo = authorizedDelivery(run.delivery, authority);
  if (!alvo.ok) {
    const recusado = deliveryGivenUp(run, `entrega recusada: ${alvo.reason}`, clock());
    save(recusado);
    return recusado;
  }
  const receipt = create({ space: alvo.space, ...(alvo.thread ? { thread: alvo.thread } : {}), requestId: run.delivery.requestId, message: chatMessageFor(run) });
  const sentAt = clock(); // depois da resposta do Google: a chamada faz parte da latência que o usuário sente
  const next = { ...run, delivery: markDeliverySent(run.delivery, receipt.name, sentAt), updatedAt: sentAt };
  save(next);
  return next;
}

export function parseChatDelivery(value: unknown): ChatDelivery | undefined {
  const d = value as Partial<ChatDelivery> | null;
  if (!d || d.kind !== 'google-chat' || !SPACE.test(String(d.space)) || !UUID.test(String(d.requestId)) || !Number.isFinite(d.notBefore) || !['pending', 'sent', 'failed'].includes(String(d.status))) return undefined;
  if (d.thread !== undefined && !THREAD.test(String(d.thread))) return undefined;
  return { kind: 'google-chat', space: String(d.space), ...(d.thread ? { thread: String(d.thread) } : {}), requestId: String(d.requestId), notBefore: Number(d.notBefore), status: d.status as 'pending' | 'sent' | 'failed', ...(typeof d.messageName === 'string' ? { messageName: d.messageName } : {}), ...(Number.isFinite(d.sentAt) ? { sentAt: Number(d.sentAt) } : {}), ...(d.probe === 'p2' ? { probe: 'p2' } : {}) };
}

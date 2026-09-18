import { CHAT_MARKUP_SYNTAX, safeChatMarkdown } from './chatFormat';
import { isOwnerDm, type AgentEntry, type ChatEvent, type ChatReply } from './chat';
import { newChatDelivery } from './chatDelivery';
import { newRun, type DurableRun } from './run';
import { redact } from './trace';
import { canUse, type AgentSpec } from './workspace';

export type ChatAsyncDeps = {
  enabled: () => boolean;
  owner: () => string;
  apiKey: () => string | null;
  defaultAgent: () => AgentEntry | null;
  load: (folderId: string) => AgentSpec;
  loadRun: (folderId: string, runId: string) => DurableRun | null;
  enqueue: (run: DurableRun, now: number) => void;
  clock: () => number;
  uuid: () => string;
  /**
   * Publica o "pensando..." no ESPACO pela Chat API. A resposta sincrona do Chat sempre cai na thread da
   * mensagem que a disparou — o app nao escolhe — e isso esconde a conversa do fluxo principal.
   * Devolve false quando nao deu (sem app, sem escopo, rede): ai cai no fallback sincrono.
   */
  postToSpace?: (space: string, text: string, requestId: string) => boolean;
};

const response = (text: string): ChatReply => ({ text: safeChatMarkdown(text), markupSyntax: CHAT_MARKUP_SYNTAX });

/**
 * Confirma o recebimento no fluxo principal do espaco. Se a publicacao pela API falhar, devolve o
 * "pensando..." sincrono: ele cai na thread, mas e melhor que o usuario ficar sem retorno nenhum.
 */
function acknowledge(space: string, d: ChatAsyncDeps): ChatReply {
  try {
    if (d.postToSpace?.(space, 'pensando...', d.uuid())) return {};
  } catch {
    // rede, escopo ou app indisponivel: nao deixa o evento sem resposta
  }
  return response('pensando...');
}

/** Aceita o evento dentro da janela do Chat; modelo e tools rodam somente no worker. */
export function acceptChatMessage(e: ChatEvent, d: ChatAsyncDeps): ChatReply {
  if (!d.enabled()) return response('O gasclaw está pausado pelo administrador.');
  const entry = d.defaultAgent();
  if (!entry) return response('Nenhum agente configurado. Abra a tela gasclaw e cole a URL de uma pasta do Drive.');
  if (!d.apiKey()) return response('Falta a chave do OpenRouter. Cole-a na tela gasclaw.');
  const text = (e.message?.argumentText ?? e.message?.text ?? '').trim();
  if (!text) return response('Mande um texto para eu responder.');

  try {
    const owner = d.owner();
    const spec = d.load(entry.folderId);
    if (!canUse(spec.access, e.user.email, owner)) return response(`Você (${e.user.email}) não tem acesso ao agente ${spec.name}.`);

    const now = d.clock();
    const runId = e.message?.name ?? `chat-${d.uuid()}`;
    if (d.loadRun(entry.folderId, runId)) return acknowledge(e.space.name, d); // reentrega do mesmo evento

    // A resposta vai para o ESPACO, nunca para a thread da pergunta: no Chat, responder dentro da thread
    // esconde a resposta do fluxo principal e o usuario le como 'travado no pensando...'.
    const delivery = newChatDelivery(e.space.name, undefined, d.uuid(), now, 0);
    const run = newRun({
      runId,
      session: `${entry.folderId}:${e.space.name}`,
      folderId: entry.folderId,
      user: e.user.email,
      text,
      now,
      ownerDm: isOwnerDm(e, owner),
      delivery,
    });
    d.enqueue(run, now);
    return acknowledge(e.space.name, d);
  } catch (err) {
    const message = redact(String((err as Error)?.message ?? err));
    return response(`Não consegui iniciar a tarefa agora: ${message}`);
  }
}

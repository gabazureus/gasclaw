import { CHAT_BUDGET_MS, DEFAULT_STEPS, runTurn, type TurnInput, type TurnResult } from './agent';
import { approvalCard, decisionFrom, issue, redeem, type Ticket, type TicketStore } from './approval';
import type { Completion, Message, ToolDef } from './llm';
import type { Tool, ToolCtx } from './tools/registry';
import { redact } from './trace';
import { canUse, type AgentSpec } from './workspace';

export type ChatEvent = {
  type: string;
  message?: { name?: string; text?: string; argumentText?: string };
  user: { email: string };
  space: { name: string; type?: string; singleUserBotDm?: boolean };
  common?: { parameters?: Record<string, string> }; // CARD_CLICKED
};
export type AgentEntry = { folderId: string; name: string };
/** Tools do agente neste turno; a memória só é lida quando ownerDm (spec §8). */
export type Toolkit = { tools: Tool[]; ctx: ToolCtx; steps: number };
/** `open(sessão)` = token de um `ask` aberto nessa conversa (a próxima mensagem responde). */
export type Tickets = TicketStore & { open?: (session: string) => string | null };
export type ChatReply = { text?: string; cardsV2?: unknown[]; actionResponse?: { type: 'UPDATE_MESSAGE' } };
export type ChatDeps = {
  enabled: () => boolean;
  owner: () => string;
  apiKey: () => string | null;
  defaultAgent: () => AgentEntry | null;
  load: (folderId: string) => AgentSpec;
  history: (key: string) => Message[];
  saveHistory: (key: string, history: Message[]) => void;
  llm: (apiKey: string, model: string, messages: Message[], tools?: ToolDef[]) => Completion;
  toolkit?: (spec: AgentSpec, ownerDm: boolean) => Toolkit;
  tickets?: Tickets;
  newToken?: () => string;
  clock?: () => number;
  budgetMs?: number; // padrão: 20 s do evento do Chat; a tela usa 300 s
  onTurn?: (turn: TurnResult) => void;
};

const NO_TOOLS: Toolkit = { tools: [], ctx: { now: () => '', ownerDm: false, memory: { read: () => '', write: () => {} } }, steps: DEFAULT_STEPS };

export const isOwnerDm = (e: ChatEvent, owner: string): boolean =>
  (e.space.singleUserBotDm === true || e.space.type === 'DM') && e.user.email.toLowerCase() === owner.toLowerCase();

export function handleChat(e: ChatEvent, d: ChatDeps): ChatReply {
  if (e.type === 'ADDED_TO_SPACE') return { text: 'Olá! Sou o gasclaw 🦀. Me mande uma mensagem para falar com seu agente.' };
  const click = e.type === 'CARD_CLICKED';
  if (e.type !== 'MESSAGE' && !click) return {};
  // Clique atualiza o próprio card (tira os botões); mensagem responde normalmente.
  const reply = (text: string, extra: Partial<ChatReply> = {}): ChatReply => (click ? { actionResponse: { type: 'UPDATE_MESSAGE' }, text, cardsV2: [], ...extra } : { text, ...extra });
  if (!d.enabled()) return reply('O gasclaw está pausado pelo administrador.');
  const entry = d.defaultAgent();
  if (!entry) return reply('Nenhum agente configurado. Abra a tela gasclaw e cole a URL de uma pasta do Drive.');
  const key = d.apiKey();
  if (!key) return reply('Falta a chave do OpenRouter. Cole-a na tela gasclaw.');
  try {
    const spec = d.load(entry.folderId);
    if (!canUse(spec.config, e.user.email, d.owner())) return reply(`Você (${e.user.email}) não tem acesso ao agente ${spec.name}.`);
    const hk = `${entry.folderId}:${e.space.name}`;
    const ownerDm = isOwnerDm(e, d.owner());
    const kit = d.toolkit?.(spec, ownerDm) ?? NO_TOOLS;
    const clock = d.clock ?? Date.now;
    const start = clock();
    const typed = (e.message?.argumentText ?? e.message?.text ?? '').trim();

    let ticket: Ticket | undefined;
    let resume: TurnInput['resume'];
    const askToken = !click && typed ? (d.tickets?.open?.(hk) ?? null) : null;
    if (click || askToken) {
      if (!d.tickets) return reply('Aprovação indisponível neste gasclaw.');
      const params = click ? (e.common?.parameters ?? {}) : { answer: typed };
      const r = redeem(d.tickets, click ? (params.token ?? '') : askToken!, e.user.email, start);
      if (r.ok) {
        const decision = r.ticket.session === hk ? decisionFrom(r.ticket.pending, params) : null;
        if (!decision) {
          d.tickets.put(r.ticket);
          return reply('Resposta inválida para este pedido.');
        }
        ticket = r.ticket;
        resume = { ...ticket.state, messages: [{ role: 'system', content: spec.system }, ...ticket.state.messages], decision };
      } else if (click) return reply(`Não dá para responder: ${r.error}.`);
      // ask aberto de outra pessoa: segue como mensagem comum
    }
    if (!ticket && !typed) return reply('Mande um texto para eu responder.');

    const text = ticket?.text ?? typed;
    const history = d.history(hk); // na retomada também: mensagens trocadas enquanto a aprovação esperava não se perdem
    const runId = ticket?.runId ?? e.message?.name ?? `${hk}:${start}`;
    const out = runTurn({
      system: spec.system,
      history,
      text,
      memory: ownerDm && !resume ? kit.ctx.memory.read() : undefined,
      tools: kit.tools,
      ctx: kit.ctx,
      llm: (m, defs) => d.llm(key, spec.config.model, m, defs),
      runId,
      steps: kit.steps,
      deadlineMs: start + (d.budgetMs ?? CHAT_BUDGET_MS),
      clock,
      granted: ticket?.granted,
      resume,
    });
    d.onTurn?.(out);
    if (out.pending && out.state) {
      if (!d.tickets || !d.newToken) return reply('Esta ação precisa de aprovação, que ainda não está ligada neste gasclaw.');
      // O system prompt fica fora do ticket (tamanho do cache); na retomada vem do agente atual.
      const state = { ...out.state, messages: out.state.messages.slice(1) };
      const t = issue({ user: e.user.email, session: hk, text, history, state, pending: out.pending, granted: out.granted, runId }, d.newToken(), start);
      d.tickets.put(t);
      return reply(out.text, approvalCard(t, out.text));
    }
    d.saveHistory(hk, out.history);
    return reply(out.text);
  } catch (err) {
    console.error('chat', redact(String((err as Error)?.stack ?? err))); // corpo de erro HTTP pode ecoar chave
    return reply(`Não consegui responder agora: ${redact(String((err as Error)?.message ?? err))}`); // chega a qualquer usuário do agente
  }
}

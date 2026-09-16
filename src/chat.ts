import { CHAT_BUDGET_MS, DEFAULT_STEPS, MAX_HISTORY, runTurn, withEngineRules, type Decision, type Snapshot, type TurnInput, type TurnResult } from './agent';
import { bootstrapDone, bootstrapMessage, shouldBootstrap } from './bootstrap';
import { flushMemory } from './tools/memoryFlush';
import { approvalCard, decisionFrom, issue, redeem, type Ticket, type TicketStore } from './approval';
import type { Completion, Message, ToolDef } from './llm';
import type { Skill } from './skills';
import { skillsBlock } from './skills';
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
/** Tools do agente neste turno; a memória só é lida quando ownerDm (spec §8). `skills` é só o índice: o corpo vem por read_skill. */
export type Toolkit = { tools: Tool[]; ctx: ToolCtx; steps: number; skills?: Skill[]; bootstrap?: { read: () => string | null; consume: () => void } };
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
  /** Compacta a sessão depois de salvar, se ela passou do teto (resumo + cauda). Sem isso, o histórico só é cortado. */
  compact?: (key: string, llm: (messages: Message[]) => Completion) => void;
};

const NO_TOOLS: Toolkit = { tools: [], ctx: { now: () => '', ownerDm: false, memory: { read: () => '', write: () => {} } }, steps: DEFAULT_STEPS };

export const isOwnerDm = (e: ChatEvent, owner: string): boolean =>
  (e.space.singleUserBotDm === true || e.space.type === 'DM') && e.user.email.toLowerCase() === owner.toLowerCase();

/** Um turno montado e rodado: papéis + skills + memória + ritual + tools. Não toca em histórico, ticket, card nem compactação. */
export type ChatTurnInput = {
  spec: AgentSpec;
  kit: Toolkit;
  text: string;
  history: Message[]; // já resolvido por quem chama
  ownerDm: boolean; // fonte única aqui dentro (kit.ctx.ownerDm vem do mesmo lugar)
  runId: string;
  budgetMs: number;
  llm: (messages: Message[], tools: ToolDef[]) => Completion;
  resume?: Snapshot & { decision?: Decision };
  done?: Record<string, string>;
  granted?: string[];
  clock?: () => number;
  /** Instante do início, quando quem chama já leu o relógio (evita uma leitura a mais por turno). */
  startMs?: number;
};
/** `ritual` = o bootstrap entrou neste turno; `ritualDone` = ele cumpriu o papel (quem persiste decide consumir). */
export type ChatTurnResult = { turn: TurnResult; ritual: boolean; ritualDone: boolean };

export function chatTurn(i: ChatTurnInput): ChatTurnResult {
  const system = i.spec.system + skillsBlock(i.kit.skills ?? []); // só nome e descrição das skills entram no prompt
  const clock = i.clock ?? Date.now;
  const start = i.startMs ?? clock();
  // Ritual de estreia: só na 1ª conversa da DM do dono e nunca numa retomada.
  const bootstrapMd = !i.resume && i.kit.bootstrap && i.ownerDm && i.history.length === 0 ? i.kit.bootstrap.read() : null;
  const ritual = shouldBootstrap(bootstrapMd, i.history.length, i.ownerDm);
  const ritualMsgs: Message[] = ritual ? [{ role: 'user', content: bootstrapMessage(bootstrapMd ?? '') }] : [];
  // O system fica fora do snapshot (tamanho do cache) e volta do agente atual na retomada.
  const resume = i.resume ? { ...i.resume, messages: [{ role: 'system' as const, content: withEngineRules(system, i.kit.tools.length > 0) }, ...i.resume.messages] } : undefined;
  const turn = runTurn({
    system,
    history: [...ritualMsgs, ...i.history],
    text: i.text,
    memory: i.ownerDm && !i.resume ? (i.kit.ctx.memory.recall?.() ?? i.kit.ctx.memory.read()) : undefined, // curada + notas de hoje e ontem
    tools: i.kit.tools,
    ctx: i.kit.ctx,
    llm: i.llm,
    runId: i.runId,
    steps: i.kit.steps,
    deadlineMs: start + i.budgetMs,
    clock,
    granted: i.granted,
    done: i.done,
    resume,
  });
  const usadas = turn.events.filter((ev) => ev.status === 'ok' || ev.status === 'approved').map((ev) => ev.name);
  return { turn, ritual, ritualDone: ritual && bootstrapDone(usadas) };
}

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
    if (!canUse(spec.access, e.user.email, d.owner())) return reply(`Você (${e.user.email}) não tem acesso ao agente ${spec.name}.`); // acesso aprovado no painel (ADR-021)
    const hk = `${entry.folderId}:${e.space.name}`;
    const ownerDm = isOwnerDm(e, d.owner());
    const isOwner = e.user.email.toLowerCase() === d.owner().toLowerCase();
    const base = d.toolkit?.(spec, ownerDm) ?? NO_TOOLS;
    // O acesso ao Google só entra no contexto de quem é o dono (em qualquer espaço); outro usuário aprovado não o recebe.
    const kit: Toolkit = { ...base, ctx: { ...base.ctx, isOwner, google: isOwner ? base.ctx.google : undefined } };
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
        resume = { ...ticket.state, decision };
      } else if (click) return reply(`Não dá para responder: ${r.error}.`);
      // ask aberto de outra pessoa: segue como mensagem comum
    }
    if (!ticket && !typed) return reply('Mande um texto para eu responder.');

    const text = ticket?.text ?? typed;
    const history = d.history(hk); // na retomada também: mensagens trocadas enquanto a aprovação esperava não se perdem
    const runId = ticket?.runId ?? e.message?.name ?? `${hk}:${start}`;
    const { turn: out, ritualDone } = chatTurn({
      spec,
      kit,
      text,
      history,
      ownerDm,
      runId,
      budgetMs: d.budgetMs ?? CHAT_BUDGET_MS,
      llm: (m, defs) => d.llm(key, spec.config.model, m, defs),
      startMs: start,
      resume,
      done: ticket?.done, // o que já rodou antes da aprovação não roda de novo (idempotência entre execuções)
      granted: ticket?.granted,
      clock,
    });
    d.onTurn?.(out);
    if (out.pending && out.state) {
      if (!d.tickets || !d.newToken) return reply('Esta ação precisa de aprovação, que ainda não está ligada neste gasclaw.');
      // O system prompt fica fora do ticket (tamanho do cache); na retomada vem do agente atual.
      const state = { ...out.state, messages: out.state.messages.slice(1) };
      const t = issue({ user: e.user.email, session: hk, text, history, state, pending: out.pending, granted: out.granted, done: out.done, runId }, d.newToken(), start);
      d.tickets.put(t);
      return reply(out.text, approvalCard(t, out.text));
    }
    // O ritual só é consumido quando cumpriu o papel (o agente gravou algo); senão, fica para a próxima conversa.
    if (ritualDone) kit.bootstrap?.consume();
    // Flush de memória antes de compactar: o que for durável vira nota do dia, para não se perder no corte do histórico.
    if (ownerDm && out.history.length >= MAX_HISTORY && kit.ctx.memory.saveDay && kit.ctx.memory.today) flushMemory(out.history, kit.ctx, (m) => d.llm(key, spec.config.model, m));
    d.saveHistory(hk, out.history);
    d.compact?.(hk, (m) => d.llm(key, spec.config.model, m)); // conversa longa vira resumo + cauda (sessões no Drive)
    return reply(out.text);
  } catch (err) {
    console.error('chat', redact(String((err as Error)?.stack ?? err))); // corpo de erro HTTP pode ecoar chave
    return reply(`Não consegui responder agora: ${redact(String((err as Error)?.message ?? err))}`); // chega a qualquer usuário do agente
  }
}

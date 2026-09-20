import type { Completion, Message, ToolCall, ToolDef } from './llm';
import { EFFECT } from './run';
import { memoryMessage } from './tools/memory';
import { findTool, toDefs, validateArgs, type Tool, type ToolCtx } from './tools/registry';
import type { AgentSpec } from './workspace';

export const MAX_HISTORY = 20;
export const DEFAULT_STEPS = 10;
export const CHAT_BUDGET_MS = 20_000; // evento do Chat tem 30 s
export const SCREEN_BUDGET_MS = 300_000; // execução tem 6 min

export function trimHistory(history: Message[], max = MAX_HISTORY): Message[] {
  return history.slice(-max);
}

// minimal: 1 chamada ao LLM, sem tools (usado pelo Testar da tela até a integração do runTurn).
export function reply(
  spec: AgentSpec,
  history: Message[],
  text: string,
  llm: (messages: Message[]) => Completion,
): { text: string; history: Message[] } {
  const past = trimHistory(history);
  const answer = llm([{ role: 'system', content: spec.system }, ...past, { role: 'user', content: text }]).text.trim() || '(sem resposta do modelo)';
  return { text: answer, history: trimHistory([...past, { role: 'user', content: text }, { role: 'assistant', content: answer }]) };
}

export type ToolStatus = 'ok' | 'error' | 'refused' | 'pending' | 'approved' | 'denied';
/** `argsKey` = identidade da CHAMADA (tool + argumentos), não só da tool: é o que distingue duas chamadas irmãs. */
export type ToolEvent = { name: string; callId: string; key: string; argsKey: string; status: ToolStatus; result: string };
export type Pending = { kind: 'approval' | 'ask'; name: string; callId: string; key: string; args: Record<string, unknown> };
/** Onde o turno parou: conversa até aqui, passo e chamadas do lote que faltam (a 1ª é a pendente). */
export type Snapshot = { messages: Message[]; step: number; queue: ToolCall[] };
export type Decision = { approved: boolean } | { answer: string };
export type TurnInput = {
  system: string;
  history: Message[];
  text: string;
  memory?: string; // só na DM do dono (quem chama decide)
  tools: Tool[]; // já filtradas pela allowlist do agente
  ctx: ToolCtx;
  llm: (messages: Message[], tools: ToolDef[]) => Completion;
  runId: string;
  steps: number;
  deadlineMs: number;
  clock: () => number;
  done?: Record<string, string>; // runId:step:callId → resultado já executado
  granted?: string[]; // tools `once` já aprovadas nesta sessão
  /** Shell durável: persiste a marca antes de uma tool com efeito tocar o mundo. */
  beforeEffect?: (name: string) => void;
  /**
   * Continua um turno interrompido. `decision` só existe quando o usuário respondeu um card (aprovar/negar/ask);
   * um run que parou por tempo ou por limite volta SEM decisão, e aí a aprovação é exigida de novo (nada é auto-aprovado).
   */
  resume?: Snapshot & { decision?: Decision };
};
export type TurnResult = {
  text: string;
  history: Message[];
  events: ToolEvent[];
  done: Record<string, string>;
  granted: string[];
  pending?: Pending;
  state?: Snapshot;
  stopped?: 'steps' | 'deadline';
};

/** Regras fixas do motor (não vêm da pasta): honestidade sobre falha de ferramenta. */
export const ENGINE_RULES = `

## gasclaw engine rules (fixed)
- If a tool fails, say clearly that it did not work, and why.
- Never claim something was done without a successful tool result.
- Never make data up (free slots, e-mails, contacts, files) when a read fails.`;

// O motor NÃO injeta conteúdo de prompt. O idioma é decidido pelo AGENTS.md do agente, que é do usuário:
// o template novo já nasce com "Reply in the same language the person writes to you in", e quem tem agente
// antigo edita o arquivo. Uma regra de idioma imposta aqui venceria — ou brigaria com — o que a pessoa
// escreveu na própria pasta, e a pasta é a fonte da verdade (ADR-002).
export const withEngineRules = (system: string, hasTools: boolean): string => (hasTools ? `${system}${ENGINE_RULES}` : system);

const errorOf = (result: string): string => {
  try {
    return String((JSON.parse(result) as { error?: unknown }).error ?? result);
  } catch {
    return result;
  }
};
/** Identidade de uma chamada, em forma canônica. Argumento ilegível cai no texto cru — pior chave, nunca falsa. */
function callSignature(name: string, rawArgs: string | undefined): string {
  try {
    const o = JSON.parse(rawArgs || '{}') as unknown;
    return o && typeof o === 'object' && !Array.isArray(o) ? grantKey(name, o as Record<string, unknown>) : `${name}:${rawArgs ?? ''}`;
  } catch {
    return `${name}:${rawArgs ?? ''}`;
  }
}

/**
 * Guarda determinística (falha honesta): tool que falhou e não teve sucesso depois no turno → aviso fixo do motor no lugar da
 * resposta do modelo, para nenhuma afirmação de sucesso ou dado inventado chegar ao usuário.
 */
export function failureNotice(events: ToolEvent[]): string | null {
  // Por CHAMADA, não por tool. Chaveado por nome, um fan-out (o modelo quebra "minha agenda do trimestre" em
  // três `calendar.list`) escondia a falha de um período atrás do sucesso dos outros: o agente respondia a
  // agenda pela metade, com convicção e sem aviso. Um retry da MESMA chamada continua perdoado, que é o caso
  // em que o sucesso de fato desmente a falha.
  const ok = new Set(events.filter((e) => e.status === 'ok' || e.status === 'approved').map((e) => e.argsKey));
  const failed = new Map(events.filter((e) => e.status === 'error' && !ok.has(e.argsKey)).map((e) => [e.argsKey, e]));
  const lines = [...failed.values()].map((e) => {
    const why = errorOf(e.result).replace(/\s+/g, ' ').slice(0, 160);
    return EFFECT.test(e.name) ? `⚠️ A ação ${e.name} falhou: ${why}. Nada foi feito.` : `⚠️ Não consegui ler ${e.name.split('.')[0]}: ${why}.`;
  });
  return lines.length ? lines.join('\n') : null;
}

/**
 * Chave do grant `once`: tool + TODOS os argumentos validados, em forma canônica (chaves ordenadas).
 *
 * Antes a chave só considerava o alvo quando o argumento se chamava literalmente `id`. Tools como `gmail.draft`,
 * `docs.create` e `tasks.create` não têm `id`, então a chave delas era só o nome da tool: **uma** aprovação liberava
 * todas as chamadas seguintes, para qualquer destinatário — e `granted` é durável, atravessando execuções.
 *
 * Prender só alguns argumentos dá falsa precisão (prende o destino e liberta o corpo), então a chave prende todos.
 * Consequência aceita: mudar qualquer argumento faz pedir de novo. Para uma tool com efeito, é o lado certo do erro.
 */
export function grantKey(name: string, args: Record<string, unknown>): string {
  const canonical = JSON.stringify(Object.keys(args).sort().map((k) => [k, args[k]]));
  return `${name}:${canonical}`;
}

const askText = (a: Record<string, unknown>) => `${String(a.question)}${a.options ? `\nOpções: ${String(a.options)}` : ''}`;

const LONG_FIELDS = ['body', 'description', 'content', 'notes'];
const PREVIEW = 300;
/**
 * Texto do card de aprovação (revisão E6, blocker 1): um campo por linha, TODOS por inteiro (to, cc, attendees, subject, ids,
 * range…); só corpo/descrição/conteúdo/notas são cortados, com "(+N chars)". Quebra de linha no valor vira ⏎, para que um
 * corpo não finja outra linha de campo.
 */
export function approvalText(name: string, args: Record<string, unknown>, originAgent?: string): string {
  const lines = Object.entries(args).map(([k, v]) => {
    const s = (typeof v === 'string' ? v : JSON.stringify(v)).replace(/\r?\n/g, ' ⏎ ');
    return LONG_FIELDS.includes(k) && s.length > PREVIEW ? `${k}: ${s.slice(0, PREVIEW)}… (+${s.length - PREVIEW} chars)` : `${k}: ${s}`;
  });
  // ADR-040 §A, controle (c): QUEM PEDIU aparece. Sem isto, um pedido que nasceu de OUTRO agente chegava
  // ao dono idêntico a um pedido do agente com quem ele está falando — e ele aprovaria achando que era
  // este. O cabeçalho vem ANTES dos argumentos, porque é o que muda a decisão.
  // Em inglês como o resto do que o motor escreve (ADR-033). O card antigo estava em pt-BR e entrava na
  // dívida de idioma; traduzir os DOIS mantém o cartão coerente — um cabeçalho em inglês sobre argumentos
  // anunciados em português seria pior para quem lê.
  const cabeca = originAgent ? `Agent ${originAgent} asked for this through me. May I use ${name}?` : `May I use ${name}? I need your approval.`;
  return [cabeca, ...lines].join('\n');
}

/** Um turno: LLM com tools → valida → executa `never` (ou aprovada) → devolve ao modelo → repete até a resposta, a pendência ou o limite. */
export function runTurn(i: TurnInput): TurnResult {
  const past = trimHistory(i.history);
  const mem = i.memory ? memoryMessage(i.memory) : null;
  const messages: Message[] = i.resume ? [...i.resume.messages] : [{ role: 'system', content: withEngineRules(i.system, i.tools.length > 0) }, ...(mem ? [mem] : []), ...past, { role: 'user', content: i.text }];
  const defs = toDefs(i.tools);
  const done = { ...i.done };
  const granted = new Set(i.granted);
  const events: ToolEvent[] = [];
  const finish = (answer: string, extra: Partial<TurnResult> = {}): TurnResult => {
    const text = (extra.pending ? null : failureNotice(events)) ?? answer;
    return { text, history: trimHistory([...past, { role: 'user', content: i.text }, { role: 'assistant', content: text }]), events, done, granted: [...granted], ...extra };
  };
  /** Prazo estourado: para e devolve ONDE parou (messages, passo e o que falta do lote), para o run poder continuar depois. */
  const late = (step: number, queue: ToolCall[]) =>
    i.clock() >= i.deadlineMs ? finish('Parei por tempo antes de terminar. Tente de novo ou peça algo menor.', { stopped: 'deadline', state: { messages: [...messages], step, queue } }) : undefined;

  /** Chamadas de um lote; devolve o resultado se o turno precisa parar (pendência ou prazo). */
  const batch = (step: number, calls: ToolCall[], decision?: Decision): TurnResult | undefined => {
    for (const [k, call] of calls.entries()) {
      const key = `${i.runId}:${step}:${call.id}`;
      const tool = findTool(i.tools, call.function.name);
      const nome = tool?.name ?? call.function.name;
      const argsKey = callSignature(nome, call.function.arguments);
      const ev = (status: ToolStatus, result: string) => {
        events.push({ name: nome, callId: call.id, key, argsKey, status, result });
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      };
      if (!tool) {
        ev('refused', `recusado: a tool "${call.function.name}" não está disponível para este agente`);
        continue;
      }
      const v = validateArgs(tool.parameters, call.function.arguments);
      if (!v.ok) {
        ev('refused', `recusado: ${v.error}`);
        continue;
      }
      if (tool.ownerOnly && !i.ctx.isOwner) {
        ev('refused', 'recusado: as ferramentas do Google são só do dono do gasclaw');
        continue;
      }
      const d = k === 0 ? decision : undefined;
      if (d && 'answer' in d) {
        ev('ok', `resposta do usuário: ${d.answer}`);
        continue;
      }
      if (d && !d.approved) {
        ev('denied', 'negado pelo usuário: não execute e não tente de novo neste turno');
        continue;
      }
      const grant = grantKey(tool.name, v.args);
      const needs = tool.name === 'ask' ? 'ask' : tool.approval === 'always' || (tool.approval === 'once' && !granted.has(grant)) ? 'approval' : null;
      if (needs && !d) {
        events.push({ name: tool.name, callId: call.id, key, argsKey, status: 'pending', result: needs === 'ask' ? 'aguardando resposta' : 'aguardando aprovação' });
        const text = needs === 'ask' ? askText(v.args) : approvalText(tool.name, v.args, i.ctx.originAgent);
        return finish(text, { pending: { kind: needs, name: tool.name, callId: call.id, key, args: v.args }, state: { messages: [...messages], step, queue: calls.slice(k) } });
      }
      if (d && tool.approval === 'once') granted.add(grant);
      const status = d ? 'approved' : 'ok';
      if (done[key] !== undefined) {
        ev(status, done[key]);
        continue;
      }
      const stop = late(step, calls.slice(k));
      if (stop) return stop;
      const effect = EFFECT.test(tool.name);
      let crossedEffectBoundary = false;
      const ctx = effect && i.beforeEffect ? { ...i.ctx, beforeEffect: () => { crossedEffectBoundary = true; i.beforeEffect!(tool.name); } } : i.ctx;
      try {
        done[key] = tool.run(v.args, ctx);
        ev(status, done[key]);
      } catch (err) {
        // Na casca durável, a marca já foi gravada e uma falha da API pode ter ocorrido depois do efeito remoto.
        // O pump relê o run e fecha com incerteza, sem repetir. Canais sem essa casca mantêm o tratamento local.
        if (crossedEffectBoundary) throw err;
        ev('error', JSON.stringify({ ok: false, error: (err as Error).message, did_nothing: true })); // inequívoco para o modelo
      }
    }
    return undefined;
  };

  let first = 0;
  if (i.resume) {
    const r = batch(i.resume.step, i.resume.queue, i.resume.decision);
    if (r) return r;
    first = i.resume.step + 1;
  }
  for (let step = first; step < i.steps; step++) {
    const stop = late(step, []);
    if (stop) return stop;
    const c = i.llm(messages, defs);
    if (!c.toolCalls?.length) return finish(c.text.trim() || '(sem resposta do modelo)');
    messages.push({ role: 'assistant', content: c.text, tool_calls: c.toolCalls });
    const r = batch(step, c.toolCalls);
    if (r) return r;
  }
  return finish(`Parei: atingi o limite de ${i.steps} passos sem terminar.`, { stopped: 'steps', state: { messages: [...messages], step: i.steps, queue: [] } });
}

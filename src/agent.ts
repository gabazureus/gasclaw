import type { Completion, Message, ToolCall, ToolDef } from './llm';
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
export type ToolEvent = { name: string; callId: string; key: string; status: ToolStatus; result: string };
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
  resume?: Snapshot & { decision: Decision };
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

## Regras do motor gasclaw (fixas)
- Se uma ferramenta falhar, diga claramente que não foi possível e o motivo.
- Nunca afirme que algo foi feito sem resultado de sucesso da ferramenta.
- Nunca invente dados (agenda livre, e-mails, contatos, arquivos) quando a leitura falhar.`;
export const withEngineRules = (system: string, hasTools: boolean): string => (hasTools ? `${system}${ENGINE_RULES}` : system);

const EFFECT = /\.(create|update|draft|send|append|complete|save|remove)$/;
const errorOf = (result: string): string => {
  try {
    return String((JSON.parse(result) as { error?: unknown }).error ?? result);
  } catch {
    return result;
  }
};
/**
 * Guarda determinística (falha honesta): tool que falhou e não teve sucesso depois no turno → aviso fixo do motor no lugar da
 * resposta do modelo, para nenhuma afirmação de sucesso ou dado inventado chegar ao usuário.
 */
export function failureNotice(events: ToolEvent[]): string | null {
  const ok = new Set(events.filter((e) => e.status === 'ok' || e.status === 'approved').map((e) => e.name));
  const failed = new Map(events.filter((e) => e.status === 'error' && !ok.has(e.name)).map((e) => [e.name, e]));
  const lines = [...failed.values()].map((e) => {
    const why = errorOf(e.result).replace(/\s+/g, ' ').slice(0, 160);
    return EFFECT.test(e.name) ? `⚠️ A ação ${e.name} falhou: ${why}. Nada foi feito.` : `⚠️ Não consegui ler ${e.name.split('.')[0]}: ${why}.`;
  });
  return lines.length ? lines.join('\n') : null;
}

const askText = (a: Record<string, unknown>) => `${String(a.question)}${a.options ? `\nOpções: ${String(a.options)}` : ''}`;

const LONG_FIELDS = ['body', 'description', 'content', 'notes'];
const PREVIEW = 300;
/**
 * Texto do card de aprovação (revisão E6, blocker 1): um campo por linha, TODOS por inteiro (to, cc, attendees, subject, ids,
 * range…); só corpo/descrição/conteúdo/notas são cortados, com "(+N chars)". Quebra de linha no valor vira ⏎, para que um
 * corpo não finja outra linha de campo.
 */
export function approvalText(name: string, args: Record<string, unknown>): string {
  const lines = Object.entries(args).map(([k, v]) => {
    const s = (typeof v === 'string' ? v : JSON.stringify(v)).replace(/\r?\n/g, ' ⏎ ');
    return LONG_FIELDS.includes(k) && s.length > PREVIEW ? `${k}: ${s.slice(0, PREVIEW)}… (+${s.length - PREVIEW} chars)` : `${k}: ${s}`;
  });
  return [`Posso usar ${name}? Preciso da sua aprovação.`, ...lines].join('\n');
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
  const late = () => (i.clock() >= i.deadlineMs ? finish('Parei por tempo antes de terminar. Tente de novo ou peça algo menor.', { stopped: 'deadline' }) : undefined);

  /** Chamadas de um lote; devolve o resultado se o turno precisa parar (pendência ou prazo). */
  const batch = (step: number, calls: ToolCall[], decision?: Decision): TurnResult | undefined => {
    for (const [k, call] of calls.entries()) {
      const key = `${i.runId}:${step}:${call.id}`;
      const tool = findTool(i.tools, call.function.name);
      const ev = (status: ToolStatus, result: string) => {
        events.push({ name: tool?.name ?? call.function.name, callId: call.id, key, status, result });
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
      // once vale por tool + alvo (revisão E6, item 6): aprovar sheets.append:<id A> não libera <id B> no mesmo turno.
      const grant = typeof v.args.id === 'string' ? `${tool.name}:${v.args.id}` : tool.name;
      const needs = tool.name === 'ask' ? 'ask' : tool.approval === 'always' || (tool.approval === 'once' && !granted.has(grant)) ? 'approval' : null;
      if (needs && !d) {
        events.push({ name: tool.name, callId: call.id, key, status: 'pending', result: needs === 'ask' ? 'aguardando resposta' : 'aguardando aprovação' });
        const text = needs === 'ask' ? askText(v.args) : approvalText(tool.name, v.args);
        return finish(text, { pending: { kind: needs, name: tool.name, callId: call.id, key, args: v.args }, state: { messages: [...messages], step, queue: calls.slice(k) } });
      }
      if (d && tool.approval === 'once') granted.add(grant);
      const status = d ? 'approved' : 'ok';
      if (done[key] !== undefined) {
        ev(status, done[key]);
        continue;
      }
      const stop = late();
      if (stop) return stop;
      try {
        done[key] = tool.run(v.args, i.ctx);
        ev(status, done[key]);
      } catch (err) {
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
    const stop = late();
    if (stop) return stop;
    const c = i.llm(messages, defs);
    if (!c.toolCalls?.length) return finish(c.text.trim() || '(sem resposta do modelo)');
    messages.push({ role: 'assistant', content: c.text, tool_calls: c.toolCalls });
    const r = batch(step, c.toolCalls);
    if (r) return r;
  }
  return finish(`Parei: atingi o limite de ${i.steps} passos sem terminar.`, { stopped: 'steps' });
}

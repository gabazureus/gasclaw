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

const askText = (a: Record<string, unknown>) => `${String(a.question)}${a.options ? `\nOpções: ${String(a.options)}` : ''}`;

/** Um turno: LLM com tools → valida → executa `never` (ou aprovada) → devolve ao modelo → repete até a resposta, a pendência ou o limite. */
export function runTurn(i: TurnInput): TurnResult {
  const past = trimHistory(i.history);
  const mem = i.memory ? memoryMessage(i.memory) : null;
  const messages: Message[] = i.resume ? [...i.resume.messages] : [{ role: 'system', content: i.system }, ...(mem ? [mem] : []), ...past, { role: 'user', content: i.text }];
  const defs = toDefs(i.tools);
  const done = { ...i.done };
  const granted = new Set(i.granted);
  const events: ToolEvent[] = [];
  const finish = (text: string, extra: Partial<TurnResult> = {}): TurnResult => ({
    text,
    history: trimHistory([...past, { role: 'user', content: i.text }, { role: 'assistant', content: text }]),
    events,
    done,
    granted: [...granted],
    ...extra,
  });
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
      const d = k === 0 ? decision : undefined;
      if (d && 'answer' in d) {
        ev('ok', `resposta do usuário: ${d.answer}`);
        continue;
      }
      if (d && !d.approved) {
        ev('denied', 'negado pelo usuário: não execute e não tente de novo neste turno');
        continue;
      }
      const needs = tool.name === 'ask' ? 'ask' : tool.approval === 'always' || (tool.approval === 'once' && !granted.has(tool.name)) ? 'approval' : null;
      if (needs && !d) {
        events.push({ name: tool.name, callId: call.id, key, status: 'pending', result: needs === 'ask' ? 'aguardando resposta' : 'aguardando aprovação' });
        const text = needs === 'ask' ? askText(v.args) : `Posso usar ${tool.name} com ${JSON.stringify(v.args).slice(0, 300)}? Preciso da sua aprovação.`;
        return finish(text, { pending: { kind: needs, name: tool.name, callId: call.id, key, args: v.args }, state: { messages: [...messages], step, queue: calls.slice(k) } });
      }
      if (d && tool.approval === 'once') granted.add(tool.name);
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
        ev('error', `erro: ${(err as Error).message}`);
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

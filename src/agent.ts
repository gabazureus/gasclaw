import type { Completion, Message, ToolDef } from './llm';
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

export type ToolStatus = 'ok' | 'error' | 'refused' | 'pending';
export type ToolEvent = { name: string; callId: string; key: string; status: ToolStatus; result: string };
export type Pending = { name: string; callId: string; key: string; args: Record<string, unknown> };
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
};
export type TurnResult = { text: string; history: Message[]; events: ToolEvent[]; done: Record<string, string>; pending?: Pending; stopped?: 'steps' | 'deadline' };

/** Um turno: LLM com tools → valida → executa `never` → devolve ao modelo → repete até a resposta, a pendência ou o limite. */
export function runTurn(i: TurnInput): TurnResult {
  const past = trimHistory(i.history);
  const mem = i.memory ? memoryMessage(i.memory) : null;
  const messages: Message[] = [{ role: 'system', content: i.system }, ...(mem ? [mem] : []), ...past, { role: 'user', content: i.text }];
  const defs = toDefs(i.tools);
  const done = { ...i.done };
  const events: ToolEvent[] = [];
  const finish = (text: string, extra: Partial<TurnResult> = {}): TurnResult => ({
    text,
    history: trimHistory([...past, { role: 'user', content: i.text }, { role: 'assistant', content: text }]),
    events,
    done,
    ...extra,
  });

  for (let step = 0; step < i.steps; step++) {
    if (i.clock() >= i.deadlineMs) return finish('Parei por tempo antes de terminar. Tente de novo ou peça algo menor.', { stopped: 'deadline' });
    const c = i.llm(messages, defs);
    if (!c.toolCalls?.length) return finish(c.text.trim() || '(sem resposta do modelo)');
    messages.push({ role: 'assistant', content: c.text, tool_calls: c.toolCalls });
    for (const call of c.toolCalls) {
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
      if (tool.approval !== 'never') {
        events.push({ name: tool.name, callId: call.id, key, status: 'pending', result: 'aguardando aprovação' });
        return finish(`Preciso da sua aprovação para usar ${tool.name}.`, { pending: { name: tool.name, callId: call.id, key, args: v.args } });
      }
      if (done[key] !== undefined) {
        ev('ok', done[key]);
        continue;
      }
      try {
        done[key] = tool.run(v.args, i.ctx);
        ev('ok', done[key]);
      } catch (err) {
        ev('error', `erro: ${(err as Error).message}`);
      }
    }
  }
  return finish(`Parei: atingi o limite de ${i.steps} passos sem terminar.`, { stopped: 'steps' });
}

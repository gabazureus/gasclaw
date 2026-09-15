// Execução de um cenário de eval no dev (E0). runEval recebe o ambiente injetado (testável); evalAction liga no GAS.
import { DEFAULT_STEPS, type TurnResult } from './agent';
import type { Ticket } from './approval';
import { cacheTickets, newToken } from './approvalStore';
import { handleChat, type ChatDeps, type ChatEvent, type Tickets } from './chat';
import { evaluate, judgeMessages, parseJudge, parseScenario, scriptedLlm, type Report, type TurnOutcome } from './eval';
import { complete, type Completion, type Message, type ToolDef } from './llm';
import * as store from './store';
import { memoryIO } from './tools/memoryStore';
import { allowedTools, type ToolCtx } from './tools/registry';
import { webClick, webSend } from './webchat';
import { agentFolderPath, ensureFolderPath, loadAgent, seedAgent, type AgentSpec } from './workspace';

export type EvalEnv = {
  owner: string;
  apiKey: string | null;
  agent: () => AgentSpec;
  folderId: string;
  memory: ToolCtx['memory'];
  now: () => string;
  llm: (model: string, messages: Message[], tools: ToolDef[]) => Completion;
  clock: () => number;
  tickets?: Tickets; // padrão: em memória (testes); no dev, o CacheService real
  newToken?: () => string;
};
export type EvalResult = Report & { replies: string[]; ms: number };

/** Turnos especiais que simulam o clique no card (Chat) ou no botão (tela): (aprovar), (negar), (repetir clique). */
const CLICK = /^\((aprovar|negar|repetir clique)\)$/i;

function memoryTickets(): Tickets {
  const data = new Map<string, Ticket>();
  return {
    put: (t) => void data.set(t.token, t),
    take: (tok) => {
      const t = data.get(tok) ?? null;
      data.delete(tok);
      return t;
    },
    open: (s) => [...data.values()].find((t) => t.session === s && t.pending.kind === 'ask')?.token ?? null,
  };
}

export function runEval(md: string, env: EvalEnv, modelOverride?: string): EvalResult {
  const t0 = env.clock();
  const s = parseScenario(md);
  const script = s.script.length ? scriptedLlm(s.script) : null;
  if (!script && !env.apiKey) throw new Error('falta a chave do OpenRouter para rodar evals com modelo');
  if (s.resetMemory) env.memory.write('');
  const spec = env.agent();
  const model = s.model ?? modelOverride ?? spec.config.model;
  const allow = s.tools ?? spec.config.tools;
  const base = env.tickets ?? memoryTickets();
  let lastToken = '';
  let lastDecision = 'approve';
  const tickets: Tickets = { ...base, put: (t) => (base.put(t), void (lastToken = t.token)) };
  let n = 0;
  const token = env.newToken ?? (() => `eval${String(++n).padStart(28, '0')}`);
  let history: Message[] = [];
  const turns: TurnOutcome[] = [];
  const convo: { user: string; reply: string }[] = [];

  for (const text of s.turns) {
    if (text === null) {
      history = [];
      continue;
    }
    const spans: string[] = [];
    const llm = (m: Message[], defs: ToolDef[]) => (spans.push('llm_call'), script ? script() : env.llm(model, m, defs));
    const tools = allowedTools(allow).map((t) => ({ ...t, run: (a: Record<string, unknown>, c: ToolCtx) => (spans.push('tool_call'), t.run(a, c)) }));
    const steps = s.steps ?? DEFAULT_STEPS;
    let turn: TurnResult | undefined;
    const d: ChatDeps = {
      enabled: () => true,
      owner: () => env.owner,
      apiKey: () => env.apiKey ?? 'roteiro',
      defaultAgent: () => ({ folderId: env.folderId, name: spec.name }),
      load: () => spec,
      history: () => history,
      saveHistory: (_k, h) => void (history = h),
      llm: (_k, _m, m, defs = []) => llm(m, defs),
      toolkit: (_s, ownerDm) => ({ tools, ctx: { now: env.now, ownerDm, memory: env.memory }, steps }),
      tickets,
      newToken: token,
      clock: env.clock,
      onTurn: (r) => void (turn = r),
    };
    const click = text.match(CLICK)?.[1].toLowerCase();
    if (click && click !== 'repetir clique') lastDecision = click === 'aprovar' ? 'approve' : 'deny';
    const params = { token: lastToken, decision: lastDecision };
    let reply: string;
    if (s.channel === 'tela') {
      // O mesmo caminho da tela de chat (chatSend/chatClick).
      reply = (click ? webClick(d, env.owner, params) : webSend(d, env.owner, text)).text ?? '';
    } else {
      const space = { name: 'spaces/gasclaw-eval', singleUserBotDm: true };
      const event: ChatEvent = click
        ? { type: 'CARD_CLICKED', user: { email: env.owner }, space, common: { parameters: params } }
        : { type: 'MESSAGE', message: { text }, user: { email: env.owner }, space };
      reply = handleChat(event, d).text ?? '';
    }
    spans.push('reply');
    turns.push({ reply, spans, tools: turn?.events.map(({ name, status }) => ({ name, status })) ?? [], ...(turn?.stopped ? { stopped: turn.stopped } : {}) });
    convo.push({ user: text, reply });
  }

  let judge: Report['judge'];
  if (s.judge && env.apiKey) {
    try {
      judge = parseJudge(env.llm(model, judgeMessages(s.judge, convo), []).text);
    } catch (err) {
      judge = { pass: false, reason: `juiz falhou: ${(err as Error).message}` };
    }
  }
  return { ...evaluate(s, { turns, judge }), replies: convo.map((c) => c.reply), ms: env.clock() - t0 };
}

const EVAL_AGENTS = `---
model: openrouter/auto
tools: [now, memory, ask]
---
# Regras (agente de eval do gasclaw, recriado sozinho; não guarde nada importante aqui)

- Responda em português do Brasil, curto.
- Use as ferramentas quando precisar de algo que você não sabe (hora atual, memória do usuário).
- Quando o usuário pedir para lembrar algo, salve com a ferramenta de memória.
`;

/** Liga o runEval no GAS: agente próprio em Meu Drive/gasclaw/agentes/eval (criado/reusado sozinho). */
export function evalAction(md: string, owner: string, model?: string): EvalResult {
  const folder = ensureFolderPath(agentFolderPath('eval'));
  if (!folder.getFilesByName('AGENTS.md').hasNext()) folder.createFile('AGENTS.md', EVAL_AGENTS, 'text/markdown');
  seedAgent(folder.getId(), owner);
  const key = store.getApiKey();
  const tz = Session.getScriptTimeZone();
  return runEval(
    md,
    {
      owner,
      apiKey: key,
      agent: () => loadAgent(folder.getId()),
      folderId: folder.getId(),
      memory: memoryIO(folder.getId()),
      now: () => Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX (EEEE)") + ` fuso ${tz}`,
      llm: (m, messages, defs) => complete(key ?? '', m, messages, 1000, undefined, defs),
      clock: Date.now,
      tickets: cacheTickets(),
      newToken,
    },
    model,
  );
}

// Execução de um cenário de eval no dev (E0). runEval recebe o ambiente injetado (testável); evalAction liga no GAS.
import { DEFAULT_STEPS, type ToolEvent, type TurnResult } from './agent';
import type { Ticket } from './approval';
import { cacheTickets, newToken } from './approvalStore';
import { handleChat, type ChatDeps, type ChatEvent, type Tickets } from './chat';
import { evaluate, judgeMessages, parseJudge, parseScenario, scriptedLlm, type Report, type TurnOutcome } from './eval';
import { complete, type Completion, type Message, type ToolDef } from './llm';
import * as store from './store';
import { runCleanup } from './tools/cleanup';
import type { Google } from './tools/google';
import { gasGoogle, zone } from './tools/googleHttp';
import { memoryIO } from './tools/memoryStore';
import { allowedTools, type ToolCtx } from './tools/registry';
import { webClick, webSend } from './webchat';
import { agentFolderPath, ensureFolderPath, loadAgent, seedAgent, withAccess, type Access, type AgentSpec } from './workspace';

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
  google?: Google; // ferramentas do Workspace (E6); o runner também usa para apagar os dados de teste
  zone?: { timeZone: string; offset: string };
};
export type EvalResult = Report & { replies: string[]; ms: number; errors: string[]; cleanup?: { removed: number; failed: string[] } };

/** Turnos especiais que simulam o clique no card (Chat) ou no botão (tela): (aprovar), (negar), (repetir clique). */
const CLICK = /^\((aprovar|negar|repetir clique)\)$/i;
const OWNER_EMAIL = /^[^\s@"\\]+@[^\s@"\\]+$/;

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
  if (!OWNER_EMAIL.test(env.owner)) throw new Error('e-mail do dono inválido para o eval');
  // {{dono}} no roteiro = e-mail do dono (nunca um terceiro nos evals do Workspace).
  // {{id}} = id do último recurso criado por uma tool (ex.: docs.create → docs.read), resolvido na hora da chamada.
  let lastId = '';
  const scripted = s.script.length ? scriptedLlm(s.script.map((i) => ('tool' in i ? { ...i, args: i.args.split('{{dono}}').join(env.owner) } : i))) : null;
  const script = scripted
    ? () => {
        const c = scripted();
        return c.toolCalls ? { ...c, toolCalls: c.toolCalls.map((t) => ({ ...t, function: { ...t.function, arguments: t.function.arguments.split('{{id}}').join(lastId) } })) } : c;
      }
    : null;
  const remember = (result: string) => {
    try {
      const id = (JSON.parse(result) as { id?: unknown }).id;
      if (typeof id === 'string' && /^[A-Za-z0-9_-]{5,200}$/.test(id)) lastId = id;
    } catch {
      /* resultado não é JSON: nada a lembrar */
    }
    return result;
  };
  if (!script && !env.apiKey) throw new Error('falta a chave do OpenRouter para rodar evals com modelo');
  if (s.resetMemory) env.memory.write('');
  const spec = env.agent();
  const model = s.model ?? modelOverride ?? spec.config.model;
  const allow = s.tools ?? spec.access.tools; // sem tools: no cenário, vale o acesso efetivo do agente (ADR-021)
  const base = env.tickets ?? memoryTickets();
  let lastToken = '';
  let lastDecision = 'approve';
  const tickets: Tickets = { ...base, put: (t) => (base.put(t), void (lastToken = t.token)) };
  let n = 0;
  const token = env.newToken ?? (() => `eval${String(++n).padStart(28, '0')}`);
  let history: Message[] = [];
  const turns: TurnOutcome[] = [];
  const convo: { user: string; reply: string }[] = [];
  const events: ToolEvent[] = [];
  let cleanup: { removed: number; failed: string[] } | undefined;

  try {
    for (const text of s.turns) {
      if (text === null) {
        history = [];
        continue;
      }
      const spans: string[] = [];
      const llm = (m: Message[], defs: ToolDef[]) => (spans.push('llm_call'), script ? script() : env.llm(model, m, defs));
      const tools = allowedTools(allow).map((t) => ({ ...t, run: (a: Record<string, unknown>, c: ToolCtx) => (spans.push('tool_call'), remember(t.run(a, c))) }));
      const steps = s.steps ?? spec.config.steps ?? DEFAULT_STEPS; // mesma precedência da produção (main.ts toolkit)
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
        toolkit: (_s, ownerDm) => ({ tools, ctx: { now: env.now, ownerDm, memory: env.memory, google: env.google, ...env.zone }, steps }),
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
        const space = { name: `spaces/gasclaw-eval-${t0}`, singleUserBotDm: true }; // um espaço por execução: ask aberto de um eval não vaza para o próximo
        const event: ChatEvent = click
          ? { type: 'CARD_CLICKED', user: { email: env.owner }, space, common: { parameters: params } }
          : { type: 'MESSAGE', message: { text }, user: { email: env.owner }, space };
        reply = handleChat(event, d).text ?? '';
      }
      const got = (turn as TurnResult | undefined)?.events ?? [];
      events.push(...got);
      spans.push('reply');
      turns.push({ reply, spans, tools: got.map(({ name, status }) => ({ name, status })), ...(turn?.stopped ? { stopped: turn.stopped } : {}) });
      convo.push({ user: text, reply });
    }
  } finally {
    // Tudo que o eval criou na conta do dono é apagado, mesmo se um turno lançar.
    cleanup = env.google ? runCleanup(events, env.google) : undefined;
  }

  let judge: Report['judge'];
  if (s.judge && env.apiKey) {
    try {
      judge = parseJudge(env.llm(model, judgeMessages(s.judge, convo), []).text);
    } catch (err) {
      judge = { pass: false, reason: `juiz falhou: ${(err as Error).message}` };
    }
  }
  const errors = events.filter((e) => e.status === 'error').map((e) => `${e.name}: ${e.result.slice(0, 200)}`);
  return { ...evaluate(s, { turns, judge, cleaned: cleanup?.removed ?? 0 }), replies: convo.map((c) => c.reply), ms: env.clock() - t0, errors, ...(cleanup ? { cleanup } : {}) };
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

/** Acesso do agente eval, fixo no código: ele é criado pelo gasclaw e só roda por doGet?action=eval (dono). */
export const EVAL_ACCESS: Access = { users: [], tools: ['now', 'memory', 'ask'] };

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
      agent: () => withAccess(loadAgent(folder.getId()), EVAL_ACCESS),
      folderId: folder.getId(),
      memory: memoryIO(folder.getId()),
      now: () => Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX (EEEE)") + ` fuso ${tz}`,
      llm: (m, messages, defs) => complete(key ?? '', m, messages, 1000, undefined, defs),
      clock: Date.now,
      tickets: cacheTickets(),
      newToken,
      google: gasGoogle,
      zone: zone(),
    },
    model,
  );
}

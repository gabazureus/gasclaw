// Execução de um cenário de eval no dev (E0). runEval recebe o ambiente injetado (testável); evalAction liga no GAS.
import { runTurn, SCREEN_BUDGET_MS, DEFAULT_STEPS, type TurnResult } from './agent';
import { handleChat } from './chat';
import { evaluate, judgeMessages, parseJudge, parseScenario, scriptedLlm, type Report, type TurnOutcome } from './eval';
import { complete, type Completion, type Message, type ToolDef } from './llm';
import * as store from './store';
import { memoryIO } from './tools/memoryStore';
import { allowedTools, type ToolCtx } from './tools/registry';
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
};
export type EvalResult = Report & { replies: string[]; ms: number };

export function runEval(md: string, env: EvalEnv, modelOverride?: string): EvalResult {
  const t0 = env.clock();
  const s = parseScenario(md);
  const script = s.script.length ? scriptedLlm(s.script) : null;
  if (!script && !env.apiKey) throw new Error('falta a chave do OpenRouter para rodar evals com modelo');
  if (s.resetMemory) env.memory.write('');
  const spec = env.agent();
  const model = s.model ?? modelOverride ?? spec.config.model;
  const allow = s.tools ?? (spec.config as { tools?: string[] }).tools ?? [];
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
    const ctx = (ownerDm: boolean): ToolCtx => ({ now: env.now, ownerDm, memory: env.memory });
    const steps = s.steps ?? DEFAULT_STEPS;
    let turn: TurnResult | undefined;
    let reply: string;
    if (s.channel === 'chat') {
      reply =
        handleChat(
          { type: 'MESSAGE', message: { text }, user: { email: env.owner }, space: { name: 'spaces/gasclaw-eval', singleUserBotDm: true } },
          {
            enabled: () => true,
            owner: () => env.owner,
            apiKey: () => env.apiKey ?? 'roteiro',
            defaultAgent: () => ({ folderId: env.folderId, name: spec.name }),
            load: () => spec,
            history: () => history,
            saveHistory: (_k, h) => void (history = h),
            llm: (_k, _m, m, defs = []) => llm(m, defs),
            toolkit: (_s, ownerDm) => ({ tools, ctx: ctx(ownerDm), memory: ownerDm ? env.memory.read() : undefined, steps }),
            clock: env.clock,
            onTurn: (r) => void (turn = r),
          },
        ).text ?? '';
    } else {
      const start = env.clock();
      turn = runTurn({ system: spec.system, history, text, memory: env.memory.read(), tools, ctx: ctx(true), llm, runId: `eval:${start}`, steps, deadlineMs: start + SCREEN_BUDGET_MS, clock: env.clock });
      history = turn.history;
      reply = turn.text;
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
tools: [now, memory]
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
    },
    model,
  );
}

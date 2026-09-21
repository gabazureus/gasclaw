// Execução de um cenário de eval no dev (E0). runEval recebe o ambiente injetado (testável); evalAction liga no GAS.
import { DEFAULT_STEPS, type ToolEvent, type TurnResult } from './agent';
import type { Ticket } from './approval';
import { cacheTickets, newToken } from './approvalStore';
import { handleChat, type ChatDeps, type ChatEvent, type Tickets } from './chat';
import { evaluate, gradeMessages, judgeMessages, parseGrade, parseJudge, parseScenario, scriptedLlm, type Report, type Scenario, type TurnOutcome } from './eval';
import { complete, type Completion, type Message, type ToolDef } from './llm';
import * as store from './store';
import { runCleanup, UNDOABLE } from './tools/cleanup';
import type { Google } from './tools/google';
import { gasGoogle, zone } from './tools/googleHttp';
import { bootstrapIO } from './tools/bootstrapStore';
import { memoryIO } from './tools/memoryStore';
import { skillsIO } from './tools/skillsStore';
import { allowedTools, findTool, TOOLS, type ToolCtx } from './tools/registry';
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
  skill?: (name: string) => string | null; // corpo das skills (delivery 3); no dev vem do skillsIO da pasta do agente
  bootstrap?: { read: () => string | null; consume: () => void }; // ritual de estreia (delivery 4)
  google?: Google; // ferramentas do Workspace (E6); o runner também usa para apagar os dados de teste
  zone?: { timeZone: string; offset: string };
  /** A chave geral do dono (`./gasclaw disable`). Ausente = ligado, para o harness de teste. */
  enabled?: () => boolean;
  /**
   * Modo CAIXA DE AREIA: ninguém está olhando, então nada do cenário concede poder.
   *
   * Ligado só no ciclo de sonho. No `./gasclaw eval` o dono digitou o comando, e o que o cenário pede
   * é o que ele quis rodar — tratar os dois iguais confundiria "o dono mandou" com "a pasta pediu".
   */
  sandboxed?: boolean;
};
export type EvalResult = Report & { replies: string[]; ms: number; errors: string[]; grade?: { grade: number; reason: string }; cleanup?: { removed: number; missing: number; failed: string[] } };

/** Turnos especiais que simulam o clique no card (Chat) ou no botão (tela): (aprovar), (aprovar <tool>), (negar), (repetir clique). */
const CLICK = /^\((aprovar|negar|repetir clique)(?:\s+([\w.]+))?\)$/i;
/**
 * "(aprovar)" do eval só aprova o que a limpeza desfaz ou o que não mexe na conta do Google (revisão E6, item 4);
 * qualquer outra tool pendente só com o nome no cenário, ex.: "(aprovar gmail.send)". O resto é negado.
 */
export const evalApproves = (pending: string, named?: string): boolean => (named ? named === pending : UNDOABLE.includes(pending) || !findTool(TOOLS, pending)?.ownerOnly);
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

/**
 * O que o sucessor precisa para RODAR um cenário — e nada do gabarito (P34).
 *
 * O sucessor tem o código que o Opus reescreveu. Se ele recebesse o critério do juiz, a rubrica ou as
 * verificações, um patch malicioso poderia ler o critério e responder para agradar. O esperado nunca
 * atravessa: é a mesma regra do CSV da F6, agora para agentes.
 */
export type RunSpec = Omit<Scenario, 'judge' | 'rubric' | 'checks' | 'set'>;

export const toRunSpec = (s: Scenario): RunSpec => {
  const { judge: _judge, rubric: _rubric, checks: _checks, set: _set, ...run } = s;
  return run;
};

/**
 * O RunSpec que chega pela REDE, conferido (P34). O pai é confiável, mas a porta do sucessor recebe
 * JSON de uma requisição HTTP: malformado vira `null`, nunca um eval que roda qualquer coisa. E só os
 * campos de RODAR atravessam — um `judge`/`checks`/`rubric` que chegue junto é DESCARTADO, para o
 * gabarito não entrar nem pela porta de trás.
 */
export function parseRunSpec(raw: string | null | undefined): RunSpec | null {
  let o: Record<string, unknown>;
  try {
    const v = JSON.parse(String(raw ?? '')) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    o = v as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof o.name !== 'string' || !o.name.trim()) return null;
  if (o.channel !== 'chat' && o.channel !== 'tela') return null;
  if (!Array.isArray(o.turns) || o.turns.length === 0 || !o.turns.every((t) => t === null || typeof t === 'string')) return null;
  if (o.steps !== undefined && !(Number.isInteger(o.steps) && (o.steps as number) >= 1 && (o.steps as number) <= 50)) return null;
  if (o.tools !== undefined && !(Array.isArray(o.tools) && o.tools.every((t) => typeof t === 'string'))) return null;
  if (o.model !== undefined && typeof o.model !== 'string') return null;
  return {
    name: o.name,
    channel: o.channel,
    ...(o.model !== undefined ? { model: o.model as string } : {}),
    ...(o.tools !== undefined ? { tools: o.tools as string[] } : {}),
    ...(o.steps !== undefined ? { steps: o.steps as number } : {}),
    resetMemory: o.resetMemory === true,
    turns: o.turns as (string | null)[],
    script: Array.isArray(o.script) ? (o.script as RunSpec['script']) : [],
  } as RunSpec;
}

/** O que aconteceu quando o cenário rodou — sem veredito nenhum. É isto que o sucessor devolve ao pai. */
export type RunTrace = { name: string; turns: TurnOutcome[]; convo: { user: string; reply: string }[]; events: ToolEvent[]; cleanup?: EvalResult['cleanup']; t0: number; model: string };

/**
 * `runEval` = `runSpec` + `judgeRun`, e o comportamento é o de sempre. As duas metades existem
 * separadas para o PAI julgar o sucessor com o próprio juiz (P34): o avaliado responde, quem julga é
 * outro — se o juiz morasse no código que o Opus reescreveu, o Opus poderia reescrever o juiz.
 */
export function runEval(md: string, env: EvalEnv, modelOverride?: string): EvalResult {
  const s = parseScenario(md);
  return judgeRun(s, runSpec(toRunSpec(s), env, modelOverride), env);
}

/** A metade que RODA. Recebe o cenário sem gabarito e devolve o que aconteceu. */
export function runSpec(runSpec: RunSpec, env: EvalEnv, modelOverride?: string): RunTrace {
  const t0 = env.clock();
  const s = runSpec;
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
  // INTERSECTA, NÃO SUBSTITUI (ciclo 3, 2026-09-20). Era `s.tools ?? spec.access.tools`: o frontmatter
  // do cenário — que vem da pasta COMPARTILHÁVEL — trocava a lista que o dono aprovou no painel.
  // `allowedTools` filtra só contra o REGISTRO, então isto era literalmente a "união disfarçada de
  // filtro" que o cabeçalho do `subagent.ts` escreveu para não cometer, e que `subagentTools` existe
  // por causa dela.
  //
  // A distinção que importa e que eu quase achatei: quando o DONO digita `./gasclaw eval e6-agenda`,
  // os tools do cenário SÃO a intenção dele — ele escolheu rodar aquilo. Quando o SONHO roda sozinho,
  // a cada minuto, não são: ali o frontmatter da pasta compartilhável estaria concedendo `calendar`,
  // `drive` e `gmail` na OAuth do dono, sem ninguém olhando.
  //
  // Por isso a interseção vale só no modo `sandboxed`, que é o do sonho. Aplicá-la nos dois quebraria
  // o harness manual — e foi o que 17 testes me disseram, corretamente.
  const allow = s.tools ? (env.sandboxed ? s.tools.filter((t) => spec.access.tools.includes(t)) : s.tools) : spec.access.tools;
  const base = env.tickets ?? memoryTickets();
  let lastToken = '';
  let lastDecision = 'approve';
  let lastPending = '';
  const tickets: Tickets = { ...base, put: (t) => (base.put(t), (lastToken = t.token), void (lastPending = t.pending.name)) };
  let n = 0;
  const token = env.newToken ?? (() => `eval${String(++n).padStart(28, '0')}`);
  let history: Message[] = [];
  const turns: TurnOutcome[] = [];
  const convo: { user: string; reply: string }[] = [];
  const events: ToolEvent[] = [];
  /** O que as tools criaram, registrado no próprio wrapper (revisão E6, item 3): falha depois da tool não deixa dado na conta. */
  const created: { name: string; status: 'ok'; result: string }[] = [];
  let cleanup: EvalResult['cleanup'];

  try {
    for (const text of s.turns) {
      if (text === null) {
        history = [];
        continue;
      }
      const spans: string[] = [];
      const llm = (m: Message[], defs: ToolDef[]) => (spans.push('llm_call'), script ? script() : env.llm(model, m, defs));
      const tools = allowedTools(allow).map((t) => ({ ...t, run: (a: Record<string, unknown>, c: ToolCtx) => {
          spans.push('tool_call');
          const result = t.run(a, c);
          created.push({ name: t.name, status: 'ok', result });
          return remember(result);
        } }));
      const steps = s.steps ?? spec.config.steps ?? DEFAULT_STEPS; // mesma precedência da produção (main.ts toolkit)
      let turn: TurnResult | undefined;
      const d: ChatDeps = {
        // A CHAVE GERAL DO DONO VALE AQUI TAMBÉM. Era `() => true` fixo, então `./gasclaw disable` —
        // o interruptor que se puxa numa emergência — não alcançava o caminho autônomo do sonho.
        // Duas grafias para a mesma intenção é a deriva que o `mayAct` existe para acabar.
        enabled: () => env.enabled?.() ?? true,
        owner: () => env.owner,
        apiKey: () => env.apiKey ?? 'roteiro',
        defaultAgent: () => ({ folderId: env.folderId, name: spec.name }),
        load: () => spec,
        history: () => history,
        saveHistory: (_k, h) => void (history = h),
        llm: (_k, _m, m, defs = []) => llm(m, defs),
        toolkit: (_s, ownerDm) => ({
          tools,
          ctx: { now: env.now, ownerDm, memory: env.memory, google: env.google, skill: env.skill, ...env.zone },
          steps,
          bootstrap: env.bootstrap && {
            read: () => {
              const md = env.bootstrap!.read();
              if (md?.trim()) spans.push('bootstrap'); // ritual entrou neste turno
              return md;
            },
            consume: () => env.bootstrap!.consume(),
          },
        }),
        tickets,
        newToken: token,
        clock: env.clock,
        onTurn: (r) => void (turn = r),
      };
      const clicked = text.match(CLICK);
      const click = clicked?.[1].toLowerCase();
      if (click === 'aprovar') lastDecision = evalApproves(lastPending, clicked?.[2]) ? 'approve' : 'deny';
      else if (click === 'negar') lastDecision = 'deny';
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
    cleanup = env.google ? runCleanup(created, env.google) : undefined;
  }

  return { name: s.name, turns, convo, events, ...(cleanup ? { cleanup } : {}), t0, model };
}

/**
 * A metade que JULGA — no processo de quem avalia, com o cenário INTEIRO (juiz, rubrica, verificações).
 * `judgeModel` é do avaliador; por padrão, o mesmo modelo que rodou, como sempre foi no `runEval`.
 */
export function judgeRun(scenario: Scenario, run: RunTrace, env: EvalEnv, judgeModel: string = run.model): EvalResult {
  const s = scenario;
  const model = judgeModel;
  const { turns, convo, events, cleanup, t0 } = run;
  let judge: Report['judge'];
  if (s.judge && env.apiKey) {
    try {
      judge = parseJudge(env.llm(model, judgeMessages(s.judge, convo), []).text);
    } catch (err) {
      judge = { pass: false, reason: `juiz falhou: ${(err as Error).message}` };
    }
  }
  // Nota graduada 0–4 dos conjuntos `quality` e `holdout`. O `gate` não tem rubrica e não ganha nota:
  // portão é binário por natureza, e somar as duas réguas destruiria a propriedade boa de cada uma.
  let grade: { grade: number; reason: string } | null = null;
  if (s.rubric && env.apiKey) {
    try {
      grade = parseGrade(env.llm(model, gradeMessages(s.rubric, convo), []).text);
    } catch {
      grade = null; // sem nota legível é `null`, nunca 0 — 0 seria lido como "ruim"
    }
  }
  const errors = events.filter((e) => e.status === 'error').map((e) => `${e.name}: ${e.result.slice(0, 200)}`);
  return { ...evaluate(s, { turns, judge, cleaned: (cleanup?.removed ?? 0) + (cleanup?.missing ?? 0) }), replies: convo.map((c) => c.reply), ms: env.clock() - t0, errors, ...(grade ? { grade } : {}), ...(cleanup ? { cleanup } : {}) };
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

/** Cria skills/<nome>/SKILL.md no agente de eval, se faltar (o cenário skill-usa precisa de uma skill real). */
function seedSkill(folder: GoogleAppsScript.Drive.Folder, name: string, md: string): void {
  const skills = folder.getFoldersByName('skills');
  const dir = skills.hasNext() ? skills.next() : folder.createFolder('skills');
  const sub = dir.getFoldersByName(name);
  const target = sub.hasNext() ? sub.next() : dir.createFolder(name);
  if (!target.getFilesByName('SKILL.md').hasNext()) target.createFile('SKILL.md', md, 'text/markdown');
}

/** Acesso do agente eval, fixo no código: ele é criado pelo gasclaw e só roda por doGet?action=eval (dono). */
export const EVAL_ACCESS: Access = { users: [], tools: ['now', 'memory', 'ask', 'read_skill'] };

/**
 * Modelo usado pelo eval e pelo juiz. O main.ts passa o `llm` embrulhado pelo trace (cada chamada vira `llm_call` com modelo e
 * custo, P16); sem ele, cai no `complete` direto e o custo fica fora do trace.
 */
export const evalLlm = (key: string | null, traced?: EvalEnv['llm']): EvalEnv['llm'] => traced ?? ((m, messages, defs) => complete(key ?? '', m, messages, 1000, undefined, defs));

/** Liga o runEval no GAS: agente próprio em Meu Drive/gasclaw/agents/eval (criado/reusado sozinho). */
export function evalAction(md: string, owner: string, model?: string, llm?: EvalEnv['llm']): EvalResult {
  const folder = ensureFolderPath(agentFolderPath('eval'));
  if (!folder.getFilesByName('AGENTS.md').hasNext()) folder.createFile('AGENTS.md', EVAL_AGENTS, 'text/markdown');
  if (!folder.getFilesByName('BOOTSTRAP.md').hasNext()) folder.createFile('BOOTSTRAP.md', 'Pergunte como a pessoa prefere ser chamada e que estilo de resposta prefere.\n', 'text/markdown');
  seedSkill(folder, 'briefing', '---\ndescription: Briefing semanal\n---\n1. abra os números da semana\n2. compare com a semana anterior\n3. escreva 3 linhas\n');
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
      llm: evalLlm(key, llm),
      clock: Date.now,
      tickets: cacheTickets(),
      newToken,
      skill: (name) => skillsIO(folder.getId()).body(name),
      bootstrap: bootstrapIO(folder.getId()),
      google: gasGoogle,
      zone: zone(),
    },
    model,
  );
}

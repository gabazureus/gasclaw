// Execução de um cenário de eval no dev (E0). runEval recebe o ambiente injetado (testável); evalAction liga no GAS.
import { judgeFor } from './judgeSet';
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
import { agentFolderPath, DEFAULT_MODEL, ensureFolderPath, loadAgent, seedAgent, withAccess, type Access, type AgentSpec } from './workspace';

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
  /** Escreve uma skill na pasta do agente do eval (tool `skill.write`), para o cenário exercitar o caminho real. */
  skillWrite?: (name: string, md: string, replace: boolean) => 'created' | 'replaced' | 'exists' | 'full';
  /** Índice das skills da pasta, lido a cada turno: é o que `skillsBlock` põe no prompt. */
  skills?: () => { name: string; description: string }[];
  bootstrap?: { read: () => string | null; consume: () => void }; // ritual de estreia (delivery 4)
  google?: Google; // ferramentas do Workspace (E6); o runner também usa para apagar os dados de teste
  zone?: { timeZone: string; offset: string };
  /** A chave geral do dono (`./gasclaw disable`). Ausente = ligado, para o harness de teste. */
  enabled?: () => boolean;
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
 * O cenário sem o GABARITO: o bastante para rodar, e nada do critério.
 *
 * Quem responde não pode ler o que o juiz espera — senão responde para agradar, e a nota deixa de
 * medir qualidade. É a separação que mantém `runEval` = rodar + julgar como dois atos.
 */
export type RunSpec = Omit<Scenario, 'judge' | 'rubric' | 'checks' | 'set'>;

export const toRunSpec = (s: Scenario): RunSpec => {
  const { judge: _judge, rubric: _rubric, checks: _checks, set: _set, ...run } = s;
  return run;
};

/** O que aconteceu quando o cenário rodou — sem veredito nenhum. */
export type RunTrace = { name: string; turns: TurnOutcome[]; convo: { user: string; reply: string }[]; events: ToolEvent[]; cleanup?: EvalResult['cleanup']; t0: number; model: string };

/**
 * `runEval` = `runSpec` + `judgeRun`. As duas metades ficam separadas porque quem RESPONDE não pode
 * ser quem JULGA: o gabarito só existe do lado do juiz, e o juiz vem de outra família (ADR-048).
 */
export function runEval(md: string, env: EvalEnv, modelOverride?: string): EvalResult {
  const s = parseScenario(md);
  const trace = runSpec(toRunSpec(s), env, modelOverride);
  // O juiz vem de `judgeFor`: outra família que a de quem respondeu (F10). Antes era o MESMO modelo.
  return judgeRun(s, trace, env, judgeFor(trace.model));
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
  // QUEM MANDOU RODAR É O DONO. `./gasclaw eval e6-agenda` é ele digitando o comando: os tools do
  // cenário SÃO a intenção dele, e por isso valem como pedidos. `allowedTools` ainda filtra contra o
  // REGISTRO, então um nome inventado no frontmatter não vira ferramenta.
  //
  // Havia um modo `sandboxed` que INTERSECTAVA com o que o dono aprovou no painel, para o caso em que
  // o eval rodava SOZINHO (o ciclo de sonho, a cada minuto): ali o frontmatter da pasta compartilhável
  // estaria concedendo `calendar`, `drive` e `gmail` na OAuth do dono sem ninguém olhando. Esse
  // caminho autônomo saiu desta branch, e com ele o único produtor da bandeira — que fica registrada
  // aqui em vez de sobreviver como um interruptor que ninguém liga.
  const allow = s.tools ?? spec.access.tools;
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
        // o interruptor que se puxa numa emergência — não alcançava o eval.
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
          ctx: { now: env.now, ownerDm, memory: env.memory, google: env.google, skill: env.skill, skillWrite: env.skillWrite, ...env.zone },
          steps,
          // O índice das skills FALTAVA aqui: sem ele `skillsBlock` era sempre vazio no eval, e nenhum
          // cenário conseguia provar que a skill aprovada aparece no prompt do turno seguinte.
          skills: env.skills?.(),
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
/**
 * O modelo do eval quando ninguém pediu um: o do MOTOR, não o da pasta de teste.
 *
 * Achado ao vivo (dev v181): a pasta `agentes/eval` é semeada pelo motor e ficou com `openrouter/auto`
 * de uma semeadura antiga; sem `--model`, TODO cenário rodava nele — e o juiz recusa gerador de
 * roteamento automático, porque ele pode cair na família do juiz. A pasta do eval é caixa de areia do
 * motor, não escolha do dono: o padrão certo é o do motor. O que o dono pedir no comando vence.
 */
export const modelForEval = (pedido: string | undefined, _daPasta: string): string => pedido ?? DEFAULT_MODEL;

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
      skillWrite: (name: string, md: string, replace: boolean) => skillsIO(folder.getId()).write(name, md, replace),
      skills: () => skillsIO(folder.getId()).index(),
      bootstrap: bootstrapIO(folder.getId()),
      google: gasGoogle,
      zone: zone(),
    },
    modelForEval(model, ''),
  );
}

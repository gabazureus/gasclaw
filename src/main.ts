import { namesOf, scenarioMd, SCENARIOS } from './judgeSet';
import { startDream, tickDream, type DreamDeps } from './dreamTick';
import { dreamIO } from './dreamStore';
import { failProp, failuresFrom, parseFailures, serializeFailures, withFailure } from './failureLog';
import { mergeAcrossGenerations, originLabel, parseSchema, validateValues, type ConfigField } from './agentConfig';
import { afterDelivery, armDelivery, capAction, childrenSpendUpperBound, deliverySpan, FAMILY_CAP_USD, FAMILY_NOTE, mayDeliverKey, rearmDelivery, type KeyDelivery } from './family';
import { cluster, hasMaterial, type Failure } from './dreamCycle';
import { AUTH_LABEL, authState, KIND_LABEL, KIND_WHAT, parseChildren, serializeChildren, withChild, withoutChild, type Child } from './children';
import { pocP10 } from '../poc/p10-editor/harness';
import { pocP14 } from '../poc/p14-trace/harness';
import { pocP15 } from '../poc/p15-limites/harness';
import { pocP16 } from '../poc/p16-custo/harness';
import { pocP3 } from '../poc/p3-pump/harness';
import { runP3SyntheticWorker, syntheticTurn } from '../poc/p3-pump/worker';
import { pocP4 } from '../poc/p4-run/harness';
import { pocP19 } from '../poc/p19-inflight/harness';
import { pocP20 } from '../poc/p20-approval/harness';
import { pocP22, TICK_REQ as P22_TICK_REQ, TICK_RESULT as P22_TICK_RESULT, WAKE_REQ as P22_WAKE_REQ, WAKE_RESULT as P22_WAKE_RESULT } from '../poc/p22-proatividade/harness';
import { dueAgenda, evaluateAgenda, syntheticAgenda } from '../poc/p22-proatividade/probe';
import { deliverP2Probe, pocP2, startP2Event } from '../poc/p2-chat-async/harness';
import { chatAppAvailable, createAsChatApp } from './chatApiGas';
import { acceptChatMessage } from './chatAsync';
import { deliveryDue, sendChatDelivery } from './chatDelivery';
import { pocP6 } from '../poc/p6-docs-nativos/harness';
import { CHAT_BUDGET_MS, DEFAULT_STEPS, MAX_HISTORY, reply, runTurn } from './agent';
import { parseSubagent, subagentGrants, subagentSpan, subagentTools } from './subagent';
import type { AgentSpec } from './workspace';
import { personaIO } from './tools/personaStore';
import { approvalCard, decisionFrom, issue, issueGrant } from './approval';
import { cacheTickets, decideChatApproval, decideScreenApproval, durableTickets, hashToken, newToken } from './approvalStore';
import { chatTurn, handleChat, type ChatDeps, type ChatEvent, type ChatReply } from './chat';
import { withChatFormatRules } from './chatFormat';
import { extendBudget, markInflight, newRun, resumeOf, RUN_BUDGET_USD, view, withDecision, type DurableRun } from './run';
import { asEnv, panelList } from './panels';
import { pump, pumpById, type StepDeps } from './runner';
import { runIO, type RunIO } from './runStore';
import { flushMemory } from './tools/memoryFlush';
import { cliAuthorized, MUTATING, validSecret } from './cli';
import { evalAction } from './evalEntry';
import { pocP11 } from '../poc/p11-free/harness';
import { pocP18 } from '../poc/p18-sessoes/harness';
import { sessionMessages } from './session';
import { compactSession, toSession } from './sessionCompact';
import { sessionIO } from './sessionStore';
import { bootstrapIO } from './tools/bootstrapStore';
import { skillsIO } from './tools/skillsStore';
import { isFree } from './freeModels';
import { runFree } from './freeRun';
import { complete, type Completion, type Message, type ToolDef } from './llm';
import { gasGoogle, zone } from './tools/googleHttp';
import { offsetMinutes } from './agenda';
import { folderModel, getOverride, listModels as openRouterModels, type ModelInfo, setOverride, validateChoice } from './models';
import * as observe from './observe';
import * as runlog from './runlog';
import {
  CAPABILITIES, can, canSucceed, capsAfterSuccession, creatorOf, DEFAULT_INTERVAL_MS, forgetAgentProps, intervalOf, mayGenerate,
  nextGeneration, parseCapabilities, parseStatus, setCreator, type Capability, type LineageEntry,
} from './agentCaps';
import { CODEGEN_BUDGET_USD, CODEGEN_DAILY_CAP_USD, mayWriteProject } from './dream';
import { generateSuccessor, type SuccessorDeps } from './successor';
import { CHILD_FORBIDDEN_SCOPES, narrowScopes, OPUS_MODEL } from './codegen';
import * as store from './store';
import { memoryIO } from './tools/memoryStore';
import { allowedTools, toolCatalog } from './tools/registry';
import { coverage, redact } from './trace';
import { agentInfo, llmInfo, traceDeps } from './traced';
import { webClick, webSend, webSpace } from './webchat';
import { agentRoles, saveRole, agentFolderPath, canUse, effectiveAccess, enabledTools, ensureFolderPath, extractFolderId, loadAgent, parseAccess, parseSteps, pendingSuggestions, seedAgent, validAgentName, withAccess, withTool, withUser, type Access, type LoadedAgent } from './workspace';

const CHAT_MAX_TOKENS = 1000; // resposta síncrona precisa caber em 30 s

function ownerEmail(): string {
  const saved = store.getOwner();
  if (saved) return saved;
  const effective = Session.getEffectiveUser().getEmail(); // no web app (USER_DEPLOYING) = dono
  if (effective) store.setOwner(effective);
  return effective.toLowerCase();
}

function assertOwner(): string {
  const me = Session.getActiveUser().getEmail().toLowerCase();
  if (!me || me !== ownerEmail()) throw new Error('Only the gasclaw owner can do this.');
  return me;
}

function json(o: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Teto de passos escolhido na tela; ausente ou fora de 1..50 → vale o da pasta (mesma precedência do modelo). */
const stepsOf = (folderId: string): number | null => parseSteps(PropertiesService.getScriptProperties().getProperty(`STEPS:${folderId}`));

/** A lista do OpenRouter para DECIDIR, nunca para derrubar o turno: `null` quando não deu para ler.
 *  `listModels` já guarda 6 h no cache e só busca com o cache frio — o caminho do turno é quente. */
function modelsOrNull(): ModelInfo[] | null {
  try {
    return openRouterModels();
  } catch {
    return null;
  }
}

/**
 * ADR-018: o que foi escolhido na tela (MODEL:/STEPS:<folderId>) vence a planilha config e o AGENTS.
 *
 * Sem escolha na tela, o modelo vem da PASTA — e aí ele é conferido (`folderModel`), porque a pasta é
 * compartilhável e era a única entrada de modelo que nunca passava por `validateChoice`. `modelSource`
 * passa a ter um terceiro valor, `padrao`, que é como quem for depurar "por que meu agente mudou de
 * modelo?" acha a resposta: o span `resolve_agent` carrega a fonte e o motivo.
 */
function withOverride(spec: LoadedAgent): LoadedAgent & { modelSource: 'tela' | 'pasta' | 'padrao'; modelReason?: string } {
  const steps = stepsOf(spec.folderId);
  const withSteps = steps === null ? spec : { ...spec, config: { ...spec.config, steps } };
  const o = getOverride(spec.folderId);
  if (o) return { ...withSteps, config: { ...withSteps.config, model: o }, modelSource: 'tela' };
  // As ferramentas que valem são as APROVADAS no painel (ADR-021), não as sugeridas pela pasta: é com elas
  // que o agente vai rodar, então é com elas que "este modelo aceita ferramentas?" tem de ser respondido.
  const escolha = folderModel(withSteps.config.model, modelsOrNull(), withSteps.access?.tools ?? []);
  return {
    ...withSteps,
    config: { ...withSteps.config, model: escolha.model },
    modelSource: escolha.source,
    ...(escolha.reason ? { modelReason: escolha.reason } : {}),
  };
}
/** ADR-021: acesso e tools valem só o que o dono aprovou no painel (ACCESS:<folderId>); sem aprovação, fechado. */
const approvedOf = (folderId: string) => parseAccess(PropertiesService.getScriptProperties().getProperty(`ACCESS:${folderId}`));
// O acesso entra ANTES do override: o `withOverride` precisa das tools APROVADAS para decidir se o
// modelo pedido pela pasta serve. Trocar a ordem e seguro: o `withAccess` nao olha `config.model`.
const loadAgentForTurn = (folderId: string) => withOverride(withAccess(loadAgent(folderId), approvedOf(folderId)));

/** A3/M16: Chat, tela de conversa e clique de aprovação registram os mesmos passos (resolve_agent, llm_call, tool_call). */
const traced = (t: runlog.Tracer, d: ChatDeps): ChatDeps => traceDeps(t, d, loadAgentForTurn);

/** A chave da conversa é "<folderId>:<espaço>"; o folderId é a pasta do agente (ADR-024). */
const folderOf = (key: string): string => key.split(':')[0];

declare const __DEV__: boolean; // embutido pelo build: true só no deploy do dev (POCs)
const isDev = () => typeof __DEV__ !== 'undefined' && __DEV__ === true;

// P21: identidade do ambiente e URL do painel irmão, embutidas no build (nada é lido do outro ambiente)
declare const __ENV__: string;
declare const __SIBLING_URL__: string;
const envName = () => (typeof __ENV__ !== 'undefined' ? __ENV__ : '');
const siblingUrl = () => (typeof __SIBLING_URL__ !== 'undefined' ? __SIBLING_URL__ : '');

/** Ações com efeito (M1): só chegam aqui pelo doPost, com o segredo da CLI já conferido. */
function mutate(action: string, p: Record<string, string>): unknown {
  if (action === 'eval') {
    // o cenário (md) é só dado: nunca vira código (ADR-002); o modelo pedido precisa existir no OpenRouter
    const model = p.model || undefined;
    if (model) {
      const err = validateChoice(openRouterModels(), model, []);
      if (err) return { ok: false, status: 400, error: err };
    }
    const t = runlog.begin('test', { question: 'eval' });
    try {
      // C1 da P16: o eval e o juiz chamam o modelo pelo trace (llm_call), para o custo entrar no medido
      const r = t.step('eval', () =>
        evalAction(p.md ?? '', ownerEmail(), model, (m: string, messages: Message[], tools: ToolDef[]) =>
          t.step('llm_call', () => complete(store.getApiKey() ?? '', m, messages, 1000, undefined, tools), llmInfo(m, messages), true),
        ),
      );
      t.end({ answer: JSON.stringify(r).slice(0, 500) });
      return { ok: true, ...r };
    } catch (err) {
      t.end({ error: (err as Error).message });
      throw err;
    }
  }
  if (action === 'poc') {
    if (!isDev()) return { ok: false, pass: false, status: 404, error: 'POCs only exist in the dev build' };
    const run = POCS[p.id ?? ''];
    if (!run) return { ok: false, pass: false, error: `unknown POC: ${p.id}` };
    if (p.trace === '0') return run(p.step, p); // sondas da P14 não viram run
    const t = runlog.begin('poc', { question: `poc ${p.id} ${p.step ?? ''}`.trim() });
    try {
      const r = t.step(`poc_${p.id}`, () => run(p.step, p));
      t.end({ answer: JSON.stringify(r).slice(0, 500) });
      return r;
    } catch (err) {
      t.end({ error: (err as Error).message });
      throw err;
    }
  }
  if (action === 'step') return stepRuns();
  if (action === 'disable' || action === 'enable') {
    store.setEnabled(action === 'enable');
    return { ok: true, enabled: store.isEnabled() };
  }
  if (action === 'drain') return { ok: true, trigger: observe.ensureTrigger(), ...observe.drain() };
  if (action === 'tools') return setTools(p.folder || '', p.set ?? '');
  return { ok: false, status: 400, error: `unknown action: ${action}` };
}

// ---------- Job da CLI (ADR-020): a resposta do web app às vezes se perde no Google (echo 404), sem relação com a duração ----------
const JOB_ID = /^[0-9a-f]{16,32}$/;
const JOB_TTL = 21_600; // 6 h
const jobKey = (id: string) => `job:${id}`;

/** Executa uma vez por id e guarda o resultado; o mesmo id de novo devolve o guardado (ou "em execução") sem reexecutar. */
function runJob(id: string, fn: () => unknown): unknown {
  if (!JOB_ID.test(id)) return { ok: false, status: 400, error: 'invalid job' };
  const cache = CacheService.getScriptCache();
  const prev = cache.get(jobKey(id));
  if (prev) {
    const j = JSON.parse(prev) as { status: string; result?: unknown };
    return j.status === 'done' ? j.result : { ok: false, status: 409, error: 'job still running', job: id };
  }
  cache.put(jobKey(id), JSON.stringify({ status: 'running', at: Date.now() }), JOB_TTL);
  let result: unknown;
  try {
    result = fn();
  } catch (err) {
    result = { ok: false, error: (err as Error).message };
  }
  const raw = JSON.stringify({ status: 'done', result });
  cache.put(jobKey(id), raw.length < 95_000 ? raw : JSON.stringify({ status: 'done', result: { ok: false, error: 'result larger than the cache (100 KB)' } }), JOB_TTL);
  return result;
}

/** GET de leitura: estado do job (unknown · running · done com o resultado). */
function readJob(id: string) {
  if (!JOB_ID.test(id)) return { ok: false, status: 400, error: 'invalid job' };
  const raw = CacheService.getScriptCache().get(jobKey(id));
  if (!raw) return { ok: true, status: 'unknown' };
  const j = JSON.parse(raw) as { status: string; result?: unknown };
  return { ok: true, status: j.status, ...(j.status === 'done' ? { result: j.result } : {}) };
}

/** M1 (CSRF): ações com efeito só por POST do ./gasclaw, com CLI_SECRET no corpo (nunca na URL), comparado em tempo constante. */
export function doPost(e: GoogleAppsScript.Events.DoPost) {
  const p = (e?.parameter ?? {}) as Record<string, string>;
  const action = p.action ?? '';
  try {
    assertOwner();
    const props = PropertiesService.getScriptProperties();
    const stored = props.getProperty('CLI_SECRET');
    if (action === 'setsecret') {
      // primeira vez: o dono grava o segredo gerado no PC; depois, só quem já tem o segredo atual
      if (!validSecret(p.secret ?? '')) return json({ ok: false, status: 400, error: 'invalid secret: use 64 hexadecimal characters (openssl rand -hex 32)' });
      if (stored && !cliAuthorized(stored, p.secret)) return json({ ok: false, status: 403, error: 'wrong CLI secret' });
      if (!stored) {
        props.setProperty('CLI_SECRET', p.secret);
        props.setProperty('CLI_SECRET_AT', new Date().toISOString()); // a data aparece no painel (ADR-022)
      }
      return json({ ok: true });
    }
    if (!cliAuthorized(stored, p.secret)) return json({ ok: false, status: 403, error: 'CLI secret missing or wrong (run ./gasclaw up)' });
    if (!MUTATING.has(action)) return json({ ok: false, status: 400, error: `unknown action: ${action}` });
    if (p.job !== undefined) return json(runJob(p.job, () => mutate(action, p)));
    return json(mutate(action, p));
  } catch (err) {
    return json({ ok: false, error: (err as Error).message });
  }
}

// ---------- Web app ----------
export function doGet(e: GoogleAppsScript.Events.DoGet) {
  const action = e?.parameter?.action;
  if (!action) {
    // P21: o ambiente entra no título porque o painel roda em iframe — com dev e prod abertos lado a
    // lado, as duas abas se chamariam "gasclaw" e a pílula no <h1> só ajuda depois de entrar na errada.
    const title = (s: string) => `${s} · ${panelEnv()}`;
    // hub e painel servem a tela com ownerEmail() (a mesma guarda de sempre); quem protege o dado é o
    // assertOwner() dentro de panelsState()/settingsState(). O chat usa assertOwner() já na rota.
    if (e?.parameter?.page === 'hub') {
      ownerEmail();
      return HtmlService.createHtmlOutputFromFile('hub').setTitle(title('gasclaw · panels')).addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    if (e?.parameter?.page === 'chat') {
      assertOwner();
      return HtmlService.createHtmlOutputFromFile('chat').setTitle(title('gasclaw · conversa')).addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    ownerEmail();
    return HtmlService.createHtmlOutputFromFile('settings').setTitle(title('gasclaw')).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  try {
    assertOwner();
    if (MUTATING.has(action)) return json({ ok: false, status: 405, error: 'this action has an effect: use POST with the CLI secret (./gasclaw)' });
    if (action === 'job') return json(readJob(e.parameter.id ?? ''));
    if (action === 'health') {
      const agents = store.listAgents();
      const folders = agents.map((a) => `${a.name}: https://drive.google.com/drive/folders/${a.folderId}`);
      return json({ ok: true, enabled: store.isEnabled(), agents: agents.length, hasKey: !!store.getApiKey(), folders, appUrl: appUrl(), auth: authStatus() });
    }
    if (action === 'trace') return json({ ok: true, ...runlog.runDetail(e.parameter.run) });
    if (action === 'live') return json({ ok: true, ...runlog.liveRuns() });
    if (action === 'runs') return json({ ok: true, url: runlog.sheetUrl(runlog.ensureRunStore().sheetId) });
    if (action === 'limits') return json({ ok: true, ...observe.limitsNow(store.getApiKey(), e.parameter.fresh === '1') });
    if (action === 'usage') return json({ ok: true, ...observe.usageView(store.getApiKey(), e.parameter.day || undefined) });
    if (action === 'models') return json({ ok: true, models: openRouterModels() });
    return json({ ok: false, error: `unknown action: ${action}` });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message });
  }
}

// ---------- Google Chat (app clássico) ----------
const nowText = () => {
  const tz = Session.getScriptTimeZone();
  return `${Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX (EEEE)")} fuso ${tz}`;
};

/**
 * Roda uma PERSONA como passo dentro do turno do pai (item 31, ADR-039).
 *
 * `subagent.ts` tinha 14 exports e ZERO importadores até a auditoria de 2026-09-20 — o caso exato de
 * "código testado que ninguém chama parece pronto e não está". Esta função é a fiação que faltava, e
 * ela custa dobrado: `subagentTools` é também o QUARTO controle do item 16.
 *
 * **A restrição que o desenho IMPÕE, e que precisa estar dita:** de dentro de uma tool NÃO existe
 * caminho até o card de aprovação. Uma persona que chamasse `gmail.send` ficaria pendurada esperando
 * um clique que não tem onde aparecer. Por isso ela recebe apenas as ferramentas que não pedem
 * aprovação — recusa explícita, não sorte. O que precisa de clique continua sendo do pai, na
 * conversa, onde o dono está olhando.
 */
function runPersona(spec: AgentSpec, name: string, task: string): string {
  const md = personaIO(spec.folderId).body(name);
  if (md === null) throw new Error(`there is no persona "${name}" in this agent's folder`);
  const p = parseSubagent(name, md);
  if (!p) throw new Error(`the persona "${name}" has no role written in it`);

  const key = store.getApiKey();
  if (!key) throw new Error('the OpenRouter key is missing');

  // Interseção DUPLA: contra o registro e contra o que o dono aprovou para o pai. Depois, só o que
  // não pede aprovação — ver o comentário acima.
  const nomes = subagentTools(p.declaredTools, spec.access.tools);
  const tools = allowedTools(nomes).filter((t) => t.approval === 'never' && !t.ownerOnly);
  const span = subagentSpan(name);
  const t = runlog.begin('subagent', { question: task.slice(0, 500), agent: span ?? name });
  try {
    const r = runTurn({
      system: p.role,
      history: [],
      text: task,
      tools,
      // A persona NÃO herda a memória nem o Google do pai: ela é um papel para pensar, não uma
      // segunda identidade com as mesmas chaves.
      ctx: { now: nowText, ownerDm: false, memory: memoryIO(spec.folderId, zone().timeZone) },
      llm: (m: Message[], defs: ToolDef[]) => complete(key, spec.config.model, m, 1000, undefined, defs),
      runId: `${spec.folderId}:${span ?? name}`,
      steps: p.steps,
      deadlineMs: Date.now() + 60_000,
      clock: Date.now,
      // §E: aprovação do pai NÃO é herdada. `once` libera a tool pelo resto do turno DELE; herdar
      // faria valer para uma persona que o dono não estava olhando quando clicou.
      granted: subagentGrants(),
    });
    t.end({ answer: r.text });
    return r.text;
  } catch (err) {
    t.end({ error: (err as Error).message });
    throw err;
  }
}

function chatDeps(): ChatDeps {
  return {
    enabled: store.isEnabled,
    owner: ownerEmail,
    apiKey: store.getApiKey,
    defaultAgent: () => store.listAgents()[0] ?? null,
    load: loadAgentForTurn,
    // ADR-024: a conversa passa a morar na pasta do agente, com compactação por resumo
    history: (k) => sessionMessages(sessionIO(folderOf(k)).load(k)),
    saveHistory: (k, h) => {
      const io = sessionIO(folderOf(k));
      io.save(k, toSession(io.load(k), h));
    },
    compact: (k, llm) => void compactSession(sessionIO(folderOf(k)), k, llm),
    // ADR-025: `model: free` vira rodízio entre os gratuitos; qualquer outro id continua indo direto ao complete()
    llm: (key, model, messages, tools) => {
      const call = (id: string) => complete(key, id, messages, CHAT_MAX_TOKENS, undefined, tools);
      return isFree(model) ? runFree(call, { tools: (tools ?? []).length > 0 }) : call(model);
    },
    toolkit: (spec, ownerDm) => ({
      tools: allowedTools(spec.access.tools),
      ctx: {
        now: nowText,
        ownerDm,
        memory: memoryIO(spec.folderId, zone().timeZone),
        skill: (name: string) => skillsIO(spec.folderId).body(name),
        persona: (name: string, task: string) => runPersona(spec, name, task),
        google: gasGoogle,
        ...zone(),
      },
      steps: spec.config.steps ?? DEFAULT_STEPS,
      skills: skillsIO(spec.folderId).index(),
      bootstrap: bootstrapIO(spec.folderId),
    }),
    tickets: durableTickets(runIO(), cacheTickets()),
    newToken,
  };
}

const updateCard = (body: Omit<ChatReply, 'actionResponse'>): ChatReply => ({ actionResponse: { type: 'UPDATE_MESSAGE' }, ...body });

/** Clique de aprovação do Chat: ator vem do evento autenticado, nunca dos parâmetros do card. */
function durableChatClick(e: ChatEvent): ChatReply {
  const p = e.common?.parameters ?? {};
  const io = runIO();
  const replacement = newToken();
  const out = decideChatApproval(io, p, e.user.email, replacement, Date.now());
  if (out.kind === 'rejected') return { text: `Cannot answer this: ${out.error}.` }; // mantém o card de outra pessoa intacto
  if (out.kind === 'refreshed') return updateCard(approvalCard({ token: replacement, pending: out.run.pending!, folderId: out.run.folderId, runId: out.run.runId }, out.run.answer ?? 'This action still needs your approval.'));
  const done = pumpById(stepDeps(CHAT_BUDGET_MS), out.run.runId) ?? out.run;
  if (done.status === 'waiting' && done.pending?.kind === 'approval') {
    const token = newToken();
    const waiting = { ...done, approval: issueGrant(done.pending, done.user, hashToken(token), Date.now()) };
    io.save(waiting);
    return updateCard(approvalCard({ token, pending: waiting.pending!, folderId: waiting.folderId, runId: waiting.runId }, waiting.answer ?? 'This action needs your approval.'));
  }
  if (done.status === 'waiting' && done.pending?.kind === 'ask' && done.snapshot) {
    const token = newToken();
    const t = issue({ user: done.user, session: done.session, text: done.text, history: [], state: done.snapshot, pending: done.pending, granted: done.granted, done: done.done, runId: done.runId }, token, Date.now());
    cacheTickets().put(t);
    return updateCard(approvalCard(t, done.answer ?? 'I need an answer.'));
  }
  return updateCard({ text: done.answer ?? (done.status === 'failed' ? `I could not finish: ${done.error ?? 'erro desconhecido'}` : 'Approval recorded; I will carry on with the task.'), cardsV2: [] });
}

export function onMessage(e: ChatEvent) {
  const typed = (e.message?.argumentText ?? e.message?.text ?? '').trim().toLowerCase();
  if (isDev() && e.type === 'MESSAGE' && typed === '/poc p2') {
    if (e.user.email.toLowerCase() !== ownerEmail()) return { text: 'POC P2 can only be started by the gasclaw owner.' };
    startP2Event(e.space.name, undefined, runIO()); // sem thread: tudo no fluxo do espaco
    return {}; // `pensando...` ja foi criado como o app e confirmado por message.name na POC
  }
  const d = chatDeps();
  if (e.type === 'MESSAGE') {
    // Sem a identidade do app no Chat não existe entrega posterior: o caminho assíncrono deixaria o usuário
    // no "pensando..." para sempre (é como o build de prod sai hoje — `build.mjs` tira o escopo IAM e não
    // embute a service account). Então cai no síncrono, que é exatamente como a prod da v1 responde.
    if (!chatAppAvailable()) {
      const ts = runlog.begin('chat', { question: (e.message?.argumentText ?? e.message?.text ?? '').trim(), user: e.user.email });
      ts.mark('entrada_sincrona', { motivo: 'the Chat app identity is unavailable' });
      const sincrono = handleChat(e, traced(ts, d));
      ts.mark('reply');
      ts.end({ answer: sincrono.text });
      observe.maybeDrain();
      return sincrono;
    }
    const io = runIO();
    return acceptChatMessage(e, {
      enabled: d.enabled,
      owner: d.owner,
      apiKey: d.apiKey,
      defaultAgent: d.defaultAgent,
      load: d.load,
      loadRun: io.load,
      enqueue: io.enqueue,
      clock: Date.now,
      uuid: () => Utilities.getUuid(),
      postToSpace: (space, text, requestId) => !!createAsChatApp({ space, requestId, message: { text } }).name,
    });
  }
  if (e.type !== 'CARD_CLICKED') return handleChat(e, d);
  const t = runlog.begin('chat', { question: (e.message?.argumentText ?? e.message?.text ?? '').trim(), user: e.user.email });
  const p = e.common?.parameters ?? {};
  const out = p.folderId && p.runId ? durableChatClick(e) : handleChat(e, traced(t, d));
  t.mark('reply');
  t.end({ answer: out.text });
  observe.maybeDrain(); // fallback sem gatilho: só grava se a fila tiver mais de 1 min
  return out;
}

export function onCardClick(e: ChatEvent) {
  return onMessage({ ...e, type: 'CARD_CLICKED' });
}

// ---------- Tela de conversa de texto (?page=chat) ----------
export function chatSend(text: string) {
  const me = assertOwner();
  const t = runlog.begin('webchat', { question: String(text).slice(0, 2000), user: me });
  const out = webSend(traced(t, chatDeps()), me, String(text).slice(0, 4000));
  t.mark('reply');
  t.end({ answer: out.text });
  observe.maybeDrain();
  return out;
}

/** M16: o clique de aprovação ou a resposta de uma pergunta continua o turno; vira um run webchat com os passos e o custo. */
export function chatClick(params: Record<string, string>) {
  const me = assertOwner();
  const p = params ?? {};
  const what = p.decision ? `aprovação: ${String(p.decision)}` : p.answer ? `resposta: ${String(p.answer).slice(0, 200)}` : 'clique'; // lang-ok: texto do TRACE, que e pt-BR por decisao
  const t = runlog.begin('webchat', { question: what, user: me });
  const out = webClick(traced(t, chatDeps()), me, { token: String(p.token ?? ''), ...(p.decision ? { decision: String(p.decision) } : {}), ...(p.answer ? { answer: String(p.answer) } : {}) });
  t.mark('reply');
  t.end({ answer: out.text });
  observe.maybeDrain();
  return out;
}

// ---------- Run durável (ADR-026): o pump dá um passo por vez, e o estado vive na pasta do agente ----------

const STEP_BUDGET_MS = 120_000; // um passo cabe folgado nos 6 min da execução, sobrando tempo para gravar o checkpoint
const PUMP_BUDGET_MS = 240_000; // 4 dos 6 min: o resto é margem para o último checkpoint
const PUMP_MAX_STEPS = 20;

/**
 * Um passo de um run durável: monta o turno com as mesmas peças da conversa (papéis, skills, memória, ritual, tools)
 * e **só persiste a conversa quando o run termina** — um checkpoint intermediário não pode gravar "Parei por tempo"
 * no histórico do usuário.
 */
function stepDeps(budgetMs = STEP_BUDGET_MS, io = runIO()): StepDeps {
  return {
    io,
    clock: Date.now,
    step: (r: DurableRun) => {
      const me = ownerEmail();
      const loaded = loadAgentForTurn(r.folderId);
      // `r.delivery` é o mesmo discriminador que escolhe 'chat' ou 'webchat' no trace: run com entrega
      // vai para o Google Chat e precisa das regras de formatação; run da tela, não. Sem isto, a P2 tirou
      // a mensagem normal do `handleChat` e toda resposta do Chat passou a sair sem as regras.
      const spec = withChatFormatRules(loaded, !!r.delivery);
      if (!canUse(spec.access, r.user, me)) throw new Error(`${r.user} has no access to agent ${spec.name}`); // acesso aprovado no painel (ADR-021)
      const apiKey = store.getApiKey();
      if (!apiKey) throw new Error('The OpenRouter key is missing. Paste it into the gasclaw panel.');
      const d = chatDeps();
      // ADR-040 §A: SER O E-MAIL DO DONO NÃO BASTA. Um run nascido de mensagem de outro agente carrega
      // `originAgent` — e ele é ASSINADO, então não dá para apagá-lo editando o arquivo. Sem esta
      // segunda condição, texto numa pasta compartilhável faria um agente usar as ferramentas de OUTRO
      // com a autoridade do dono: a interseção protege a composição, não a conversa.
      const isOwner = r.user === me.toLowerCase() && !r.originAgent;
      const ownerDm = r.ownerDm;
      const base = d.toolkit!(spec, ownerDm);
      // O acesso ao Google só entra no contexto de quem é o dono, igual à conversa (ADR-023).
      const kit = { ...base, ctx: { ...base.ctx, isOwner, originAgent: r.originAgent, google: isOwner ? base.ctx.google : undefined } };
      const t = runlog.begin(r.delivery ? 'chat' : 'webchat', { question: r.text.slice(0, 2000), user: r.user });
      // TODA chamada ao modelo deste passo passa por aqui. O resumo da sessão e o flush de memória também
      // custam dinheiro: fora do `llm_call` eles não apareciam no trace nem entravam no `usedUsd`, e o teto
      // de US$ 0,10 por run cobria só parte do gasto real.
      const llm = (m: Message[], defs?: ToolDef[]) =>
        t.step('llm_call', () => d.llm(apiKey, spec.config.model, m, defs), llmInfo(spec.config.model, m), true);
      try {
        const { turn, ritualDone } = chatTurn({
          spec,
          kit,
          text: r.text,
          history: d.history(r.session),
          ownerDm,
          runId: r.runId,
          budgetMs,
          llm,
          resume: resumeOf(r),
          done: r.done,
          granted: r.granted,
          beforeEffect: (name) => io.save(markInflight(r, name, Date.now())),
        });
        // Fim do run = não ficou pendência nem parada. Só aqui a conversa é gravada, compactada e o ritual consumido.
        if (!turn.pending && !turn.stopped) {
          if (ritualDone) kit.bootstrap?.consume();
          if (ownerDm && turn.history.length >= MAX_HISTORY && kit.ctx.memory.saveDay && kit.ctx.memory.today) flushMemory(turn.history, kit.ctx, (m) => llm(m));
          d.saveHistory(r.session, turn.history);
          d.compact?.(r.session, (m) => llm(m));
        }
        // ITEM 24 — A LIGAÇÃO QUE FALTAVA. A auditoria de 2026-09-20 encontrou `recordFailure` com ZERO
        // call sites: o contador existia, tinha teste verde, e nada o alimentava. Eu vinha lendo o trace
        // vazio como "falta uso real do agente"; era o contador que nunca tinha sido ligado — e foi isso
        // que travou o ciclo de sonho esperando um dado que não tinha como chegar.
        //
        // Aqui, e não no `agent.ts`: contar é efeito em Script Properties, e o turno é núcleo.
        // Só quando o passo NÃO está pendente: um run esperando o clique do dono não falhou, está esperando.
        if (!turn.pending) countTurnFailures(r.folderId, turn);
        t.mark('reply');
        return { turn, usd: t.end({ answer: turn.text }).cost ?? 0 };
      } catch (err) {
        t.end({ error: (err as Error).message });
        throw err;
      }
    },
  };
}

// ---------- Entrada do run durável pela tela (?page=chat) ----------

/** Onde a conversa da tela mora, igual ao webchat: `<pasta do agente>:tela/chat/<e-mail>`. */
const screenSession = (folderId: string, owner: string) => `${folderId}:${webSpace(owner).name}`;
/** Emite só quando não há credencial válida. Perder cache nunca rotaciona autorização ainda válida. */
function screenApproval(io: RunIO, r: DurableRun, now: number, knownToken?: string): { run: DurableRun; token?: string } {
  if (r.status !== 'waiting' || r.pending?.kind !== 'approval') return { run: r };
  if (knownToken && r.approval?.tokenHash === hashToken(knownToken) && now >= r.approval.issuedAt && now < r.approval.expiresAt) return { run: r, token: knownToken };
  if (r.approval && now >= r.approval.issuedAt && now < r.approval.expiresAt) return { run: r };
  const token = knownToken ?? newToken();
  const next = { ...r, approval: issueGrant(r.pending, r.user, hashToken(token), now), updatedAt: now };
  io.save(next);
  return { run: next, token };
}

function runResponse(io: RunIO, r: DurableRun, now: number, token?: string) {
  const ready = screenApproval(io, r, now, token);
  return { ok: true, runId: ready.run.runId, ...view(ready.run), ...pendingView(ready.run, ready.token) };
}

/**
 * A tela pede algo ao agente. Tentamos responder **na hora**, dentro dos 20 s (é o caso comum);
 * se não der, o run já está durável na fila e a tela passa a acompanhar por `runState`.
 */
export function runAsk(text: string) {
  const me = assertOwner();
  const entry = store.listAgents()[0];
  if (!entry) return { ok: false, error: 'No agent set up yet. Paste the URL of a Drive folder into the gasclaw panel.' };
  const t = String(text ?? '').slice(0, 4000).trim();
  if (!t) return { ok: false, error: 'Send me some text and I will answer.' };
  const now = Date.now();
  const r = newRun({ runId: `tela-${now}-${Utilities.getUuid().slice(0, 8)}`, session: screenSession(entry.folderId, me), folderId: entry.folderId, user: me, text: t, now, ownerDm: true });
  const io = runIO();
  io.enqueue(r, now);
  const done = pumpById(stepDeps(CHAT_BUDGET_MS), r.runId) ?? r;
  return runResponse(io, done, Date.now());
}

/** A tela acompanha um run em andamento. Só o dono do run o enxerga. */
export function runState(runId: string, approvalToken?: string) {
  const me = assertOwner();
  const entry = store.listAgents()[0];
  if (!entry) return { ok: false, error: 'No agent set up yet.' };
  const r = runIO().load(entry.folderId, String(runId ?? ''));
  if (!r) return { ok: false, error: 'I could not find that task.' };
  if (r.user !== me.toLowerCase()) return { ok: false, error: 'That task is not yours.' };
  return runResponse(runIO(), r, Date.now(), String(approvalToken ?? ''));
}

/**
 * A resposta do usuário a um run parado: aprovar/negar uma ferramenta, responder uma pergunta, ou mandar continuar
 * depois do teto de custo. Devolve o run à fila e já tenta terminar na hora.
 */
export function runDecide(runId: string, params: Record<string, string>) {
  const me = assertOwner();
  const entry = store.listAgents()[0];
  if (!entry) return { ok: false, error: 'No agent set up yet.' };
  const io = runIO();
  const r = io.load(entry.folderId, String(runId ?? ''));
  if (!r) return { ok: false, error: 'I could not find that task.' };
  if (r.user !== me.toLowerCase()) return { ok: false, error: 'That task is not yours.' };
  const p = params ?? {};
  const now = Date.now();
  if (r.status === 'paused') {
    if (p.decision !== 'continue') return { ok: false, error: 'That task is paused at the cost limit: tell me whether to carry on.' };
    const next = extendBudget(r, RUN_BUDGET_USD, now);
    io.enqueue(next, now, true);
    return runResponse(io, pumpById(stepDeps(CHAT_BUDGET_MS), next.runId) ?? next, Date.now());
  }
  if (r.status !== 'waiting' || !r.pending) return { ok: false, error: 'That task is not waiting for an answer.' };
  const decision = decisionFrom(r.pending, p);
  if (!decision) return { ok: false, error: 'That is not a valid answer for this request.' };
  if (r.pending.kind === 'approval') {
    if (!r.approval) return runResponse(io, r, now); // run antigo: emite credencial sem refazer o turno
    const replacement = newToken();
    const out = decideScreenApproval(io, r, p, me, replacement, now);
    if (out.kind === 'rejected') return { ok: false, error: out.error };
    if (out.kind === 'refreshed') return runResponse(io, out.run, now, replacement);
    return runResponse(io, pumpById(stepDeps(CHAT_BUDGET_MS), out.run.runId) ?? out.run, Date.now());
  }
  const next = withDecision(r, decision, now);
  io.enqueue(next, now, true);
  return runResponse(io, pumpById(stepDeps(CHAT_BUDGET_MS), next.runId) ?? next, Date.now());
}

/** O que a tela precisa desenhar além do texto: os botões (Aprovar/Negar, opções do `ask`, Continuar). */
function pendingView(r: DurableRun, token?: string): { approvalToken?: string; choices?: { key: 'decision' | 'answer'; value: string; label: string }[] } {
  if (r.status === 'paused') return { choices: [{ key: 'decision', value: 'continue', label: 'Continuar' }] };
  if (r.status !== 'waiting' || !r.pending) return {};
  if (r.pending.kind === 'ask') {
    const options = String(r.pending.args.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).slice(0, 6);
    return { choices: options.map((o) => ({ key: 'answer' as const, value: o, label: o.slice(0, 40) })) };
  }
  return { ...(token ? { approvalToken: token } : {}), choices: [{ key: 'decision', value: 'approve', label: 'Aprovar' }, { key: 'decision', value: 'deny', label: 'Negar' }] };
}

/** Ação manual `step` (POST com o segredo da CLI): executa o mesmo pump usado diretamente pelo gatilho. */
function syntheticStepDeps(): StepDeps {
  return { io: runIO(), clock: Date.now, step: syntheticTurn };
}

export function stepRuns() {
  const touched = pump(stepDeps(), PUMP_MAX_STEPS, Date.now() + PUMP_BUDGET_MS);
  return { ok: true, steps: touched.length, runs: touched.map((r) => ({ runId: r.runId, ...view(r) })) };
}

const P3_IDLE_REQ = 'poc:p3:drain:req';
const P3_IDLE_RESULT = 'poc:p3:drain:result';
const P3_WORKER_REQ = 'poc:p3:kick:req';
const P3_WORKER_RESULT = 'poc:p3:kick:result';

function runP3IdleProbe(): boolean {
  if (!isDev()) return false;
  const cache = CacheService.getScriptCache();
  if (cache.get(P3_IDLE_REQ) !== '1') return false;
  cache.remove(P3_IDLE_REQ);
  const t0 = Date.now();
  try {
    const reconcileAt = Date.now();
    runlog.reconcileStaleRuns();
    const reconcileMs = Date.now() - reconcileAt;
    const drainAt = Date.now();
    const drained = observe.drain();
    const drainMs = Date.now() - drainAt;
    const queueAt = Date.now();
    const pointers = runIO().pointers();
    if (!pointers.length) workRuns(pointers);
    const queueMs = Date.now() - queueAt;
    // Detalhe do reconcile: a investigação da regressão do tique precisa de número POR PARTE, não
    // de "o reconcile está lento". Quatro Date.now() custam nada.
    cache.put(P3_IDLE_RESULT, JSON.stringify({ ok: pointers.length === 0, ms: Date.now() - t0, reconcileMs, drainMs, queueMs, drained, queued: pointers.length, reconcile: runlog.reconcileDetail() }), 21_600);
  } catch (err) {
    cache.put(P3_IDLE_RESULT, JSON.stringify({ ok: false, error: redactMsg(err), ms: Date.now() - t0 }), 21_600);
  }
  return true;
}

function runP3WorkerProbe(): boolean {
  if (!isDev()) return false;
  const cache = CacheService.getScriptCache();
  const requested = cache.get(P3_WORKER_REQ);
  if (!requested) return false;
  cache.remove(P3_WORKER_REQ);
  const t0 = Date.now();
  try {
    const touched = runP3SyntheticWorker(requested, runIO().pointers(), syntheticStepDeps(), Date.now() + PUMP_BUDGET_MS);
    const run = touched[0];
    cache.put(P3_WORKER_RESULT, JSON.stringify({ ok: run?.runId === requested && run.status === 'done', runId: run?.runId, status: run?.status, ms: Date.now() - t0 }), 21_600);
  } catch (err) {
    cache.put(P3_WORKER_RESULT, JSON.stringify({ ok: false, error: redactMsg(err), ms: Date.now() - t0 }), 21_600);
  }
  return true;
}

/**
 * Sonda da P22: quanto a agenda acrescenta a um tique. Só no dev, e só quando pedida.
 *
 * O valor pedido é quantos compromissos sintéticos avaliar: `0` mede o tique ocioso (C1) e `20`
 * mede o mesmo tique carregando uma agenda cheia que NÃO vence nada (C2) — que é o preço que a
 * proatividade cobra em todos os 1.440 tiques do dia, mesmo sem nada a fazer.
 *
 * A agenda vem de uma string, não do Drive: pela decisão H3 ela é aprovada no painel e mora nas
 * Properties, como o `Access`. Ler a pasta a cada tique é justamente o que tornaria isto caro.
 */
function runP22TickProbe(): boolean {
  if (!isDev()) return false;
  const cache = CacheService.getScriptCache();
  const requested = cache.get(P22_TICK_REQ);
  if (requested === null) return false;
  cache.remove(P22_TICK_REQ);
  const t0 = Date.now();
  try {
    const n = Number(requested) || 0;
    const tz = offsetMinutes(zone().offset);
    const text = n > 0 ? syntheticAgenda(n, Date.now(), tz) : '';
    runlog.reconcileStaleRuns();
    observe.drain();
    const agenda = evaluateAgenda(text, {}, Date.now(), tz);
    const pointers = runIO().pointers();
    if (!pointers.length) workRuns(pointers);
    cache.put(P22_TICK_RESULT, JSON.stringify({ ok: true, ms: Date.now() - t0, jobs: agenda.jobs, due: agenda.due, errors: agenda.errors }), 21_600);
  } catch (err) {
    cache.put(P22_TICK_RESULT, JSON.stringify({ ok: false, error: redactMsg(err), ms: Date.now() - t0 }), 21_600);
  }
  return true;
}

/**
 * Sonda da P22: um despertar inteiro, do compromisso vencido ao run terminal, com passo SINTÉTICO.
 * Mede o overhead da proatividade — nunca o custo real do turno, que não passa por aqui e por isso
 * entra na projeção como número observado de fora (`--turno`).
 */
function runP22WakeProbe(): boolean {
  if (!isDev()) return false;
  const cache = CacheService.getScriptCache();
  if (cache.get(P22_WAKE_REQ) !== '1') return false;
  cache.remove(P22_WAKE_REQ);
  const t0 = Date.now();
  try {
    const agent = store.listAgents()[0];
    if (!agent) throw new Error('no agent registered: add one in the panel before running P22');
    const due = evaluateAgenda(dueAgenda(), {}, Date.now(), offsetMinutes(zone().offset));
    if (!due.dueList.length) throw new Error('the synthetic wake schedule is not due: invalid measurement');
    const io = runIO();
    const runId = `p22-wake-${Date.now().toString(36)}`;
    const r = newRun({ runId, session: `${agent.folderId}:poc/p22`, folderId: agent.folderId, user: store.getOwner() ?? '', text: due.dueList[0].intent, now: Date.now() });
    io.enqueue(r, Date.now());
    // Só o run pedido avança; a fila compartilhada não é tocada (mesma trava que a P3 precisou adotar).
    const targeted: StepDeps = { ...syntheticStepDeps(), io: { ...io, claimNext: (now) => io.claimById(runId, now) } };
    const touched = pump(targeted, 1, Date.now() + PUMP_BUDGET_MS);
    const done = touched[0];
    cache.put(P22_WAKE_RESULT, JSON.stringify({ ok: true, ms: Date.now() - t0, completed: done?.runId === runId && done.status === 'done' }), 21_600);
  } catch (err) {
    cache.put(P22_WAKE_RESULT, JSON.stringify({ ok: false, error: redactMsg(err), ms: Date.now() - t0 }), 21_600);
  }
  return true;
}

/**
 * O gatilho é o worker do run durável. O produto exige Workspace, cuja cota de gatilhos é 6 h/dia; a P3 mede
 * o consumo real antes de aceitar este desenho. A fila vazia não abre Drive nem chama modelo.
 */
function workRuns(pointers = runIO().pointers()): void {
  try {
    if (!pointers.length) return;
    const io = runIO();
    // A entrega acontece assim que CADA run fica pronto, dentro do laco do pump. Antes ela esperava o pump
    // inteiro terminar (ate 20 runs / 240 s), entao uma resposta pronta em 36 s so saia minutos depois,
    // refem do trabalho dos outros runs — o usuario lia isso como "travado no pensando...".
    pump(stepDeps(STEP_BUDGET_MS, io), PUMP_MAX_STEPS, Date.now() + PUMP_BUDGET_MS, (run) => deliverIfDue(run, io));
  } catch (err) {
    console.warn(`trigger pump failed: ${redactMsg(err)}`);
  }
}

/** Entrega um run terminal cuja hora chegou. Falha de entrega nunca derruba o pump: o run volta para a fila. */
function deliverIfDue(run: DurableRun, io: RunIO): void {
  if (!run.delivery || run.delivery.status !== 'pending') return;
  const now = Date.now();
  if (!deliveryDue(run, now)) {
    // Só um run TERMINAL ainda vai ficar `due` — o que falta a ele é a hora. `waiting`/`paused` esperam o
    // usuário e nunca ficam due: recolocá-los aqui desfaz o que o `settle` decidiu e os faz girar na fila
    // sem fim. O ponteiro deles volta pelo `io.decide`, quando o usuário responde.
    if (run.status === 'done' || run.status === 'failed') io.enqueue(run, now, true);
    return;
  }
  try {
    const sent = isDev() && run.delivery.probe === 'p2'
      ? deliverP2Probe(run, io, now)
      : sendChatDelivery(run, now, createAsChatApp, io.save, io.authority(run.runId));
    if (sent.delivery?.status !== 'pending') {
      io.dequeue(sent.runId); // entregue ou recusado de vez: sai da fila
      io.forget(sent.runId); // e a autoridade some junto, para o `A:` não se acumular nas Properties
    }
  } catch (err) {
    // `progressed: false`: falha de entrega É tentativa falha. Com `true`, `attempts` zerava a cada volta e o
    // mesmo run indelivravel queimava as 20 voltas de PUMP_MAX_STEPS por tique, sem MAX_ATTEMPTS nunca cortar
    // e sem nenhum outro run ser atendido. O requestId estavel mantem o retry seguro.
    io.enqueue(run, now, false);
    console.warn(`Chat delivery failed: ${redactMsg(err)}`);
  }
}

const redactMsg = (err: unknown) => redact(String((err as Error)?.message ?? err)).slice(0, 200);

export function onAddToSpace(e: ChatEvent) {
  return handleChat({ ...e, type: 'ADDED_TO_SPACE' }, chatDeps());
}

export function onRemoveFromSpace() {
  // nada a limpar na F0 (histórico expira sozinho no cache)
}

// ---------- Tela gasclaw (google.script.run) ----------
/** URL absoluta do web app (/exec, ou /dev no modo de teste): a tela roda num iframe em googleusercontent.com e link relativo não funciona. */
export const appUrl = (): string => ScriptApp.getService().getUrl() ?? '';
/** O projeto em execução é onde os arquivos `.md.html` dos agentes aparecem no editor (ADR-013/P10). */
export const scriptUrl = (): string => `https://script.google.com/home/projects/${ScriptApp.getScriptId()}/edit`;

export function settingsState() {
  const me = assertOwner();
  observe.maybeDrain(); // fallback sem gatilho ao abrir a tela
  const props = PropertiesService.getScriptProperties();
  const cliSecretAt = props.getProperty('CLI_SECRET_AT');
  return { me, enabled: store.isEnabled(), hasKey: !!store.getApiKey(), agents: store.listAgents(), appUrl: appUrl(), scriptUrl: scriptUrl(), env: panelEnv(), cliSecretAt, auth: authStatus() };
}

/** P21: ambiente já normalizado (desconhecido conta como prod), para o rótulo do cabeçalho. */
const panelEnv = () => asEnv(envName());

/**
 * Tela do hub (`?page=hub`): só os painéis conhecidos. De propósito NÃO passa por settingsState(),
 * que drena o lote e lê todos os agentes — o hub é uma página de navegação, não um painel.
 */
export function panelsState() {
  assertOwner();
  return { env: panelEnv(), panels: panelList(envName(), appUrl(), siblingUrl()) };
}

/**
 * Consentimento granular (scopes, doc oficial): escopo sem autorização vira exceção capturável, e o Google não pede
 * sozinho enquanto o código a captura (o limits capturava). A tela mostra o link; o editor roda `authorize`.
 * getAuthorizationInfo só consulta, sem pedir; se a leitura falhar, a tela segue sem o aviso.
 */
function authStatus(): { required: boolean; url: string | null; editorFunction: string } {
  try {
    const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    const required = info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED;
    return { required, url: required ? info.getAuthorizationUrl() || null : null, editorFunction: 'authorize' };
  } catch {
    return { required: false, url: null, editorFunction: 'authorize' };
  }
}

/**
 * Rode no editor (arquivo _motor.gs → função "authorize" → ▶ Executar): requireAllScopes encerra a execução e mostra o
 * pedido de permissões se faltar alguma (só funciona no editor). Com tudo concedido, cria o gatilho de 1 min e devolve "ok".
 */
export function authorize() {
  assertOwner();
  // medido na v22: com permissão faltando, requireAllScopes mostra o pedido e ENCERRA a execução, e o gatilho não era criado.
  // Só chamamos quando falta algo; com tudo concedido, segue direto para o gatilho (rodar de novo resolve o 1º caso).
  if (authStatus().required) ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  observe.ensureTrigger(); // a doc recomenda criar o gatilho só depois de garantir o escopo script.scriptapp
  return 'ok';
}

/** ADR-022: apaga o segredo da CLI (pela tela, via google.script.run, que não é CSRF-ável); o próximo ./gasclaw up registra de novo. */
export function resetCliSecret() {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('CLI_SECRET');
  props.deleteProperty('CLI_SECRET_AT');
  return settingsState();
}

export function saveKey(key: string) {
  assertOwner();
  if (!/^sk-or-[\w-]{10,}$/.test(key.trim())) throw new Error('Invalid key: an OpenRouter key starts with sk-or-');
  store.setApiKey(key);
  return settingsState();
}

export function addAgent(url: string) {
  const me = assertOwner();
  const id = extractFolderId(url);
  if (!id) throw new Error('Invalid folder URL. Copy the folder URL from Google Drive.');
  const created = seedAgent(id, me);
  const spec = loadAgent(id);
  store.saveAgents([...store.listAgents().filter((a) => a.folderId !== id), { folderId: id, name: spec.name }]);
  return { state: settingsState(), created };
}

/** "Novo agente": cria (ou reutiliza) Meu Drive/gasclaw/agents/<nome>/, semeia os arquivos e registra a pasta. */
export function createAgent(name: string) {
  assertOwner();
  const n = name.trim();
  if (!validAgentName(n)) throw new Error('Invalid name: use lowercase letters, numbers and hyphens (e.g. assistant).');
  return addAgent(ensureFolderPath(agentFolderPath(n)).getId());
}

export function removeAgent(folderId: string) {
  assertOwner();
  store.saveAgents(store.listAgents().filter((a) => a.folderId !== folderId));
  // ADR-040 §C: apaga TODA chave presa a este folderId, não só `ACCESS:`. Antes, `MODEL:` e `STEPS:`
  // sobravam; com capacidade e carimbo de intervalo na jogada, sobra vira RESSURREIÇÃO — remover e
  // recriar a pasta com o mesmo nome (`ensureFolderPath` reusa a primeira homônima) devolveria os
  // poderes sem um clique, e o carimbo apagado zeraria a trava de custo da geração.
  const props = PropertiesService.getScriptProperties();
  for (const key of forgetAgentProps(Object.keys(props.getProperties()), folderId)) props.deleteProperty(key);
  return settingsState();
}

// ---------- Acesso e ferramentas aprovados no painel (ADR-021) ----------
/**
 * Serializa a leitura-modificação-escrita de ACCESS:<folderId>.
 *
 * Cada caixinha do painel é um `google.script.run` próprio e o Apps Script atende chamadas em paralelo:
 * marcar cinco ferramentas depressa fazia cinco leituras do MESMO estado antigo, e a última gravação apagava
 * as outras quatro — em silêncio, com a tela mostrando um resultado plausível. Aqui a perda vira erro visível.
 */
function underAccessLock<T>(fn: () => T): T {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10_000)) throw new Error('another access change is in progress; try again');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

const asAccess = (a: Partial<Access> | null | undefined): Access => ({
  users: Array.isArray(a?.users) ? a!.users.map(String) : [],
  tools: Array.isArray(a?.tools) ? a!.tools.map(String) : [],
});
const agentName = (folderId: string) => store.listAgents().find((a) => a.folderId === folderId)?.name ?? folderId;
const describeAccess = (a: Access) => `${a.users.length ? a.users.join(', ') : 'só o dono'} · ${a.tools.length ? a.tools.join(', ') : 'sem ferramentas'}`;

/** O que a pasta sugere, o que está aprovado, o que falta aprovar e o catálogo para o liga/desliga por ferramenta. */
export function agentAccess(folderId: string) {
  assertOwner();
  const spec = loadAgent(folderId);
  const approved = approvedOf(folderId);
  return {
    folderId,
    name: spec.name,
    suggested: spec.config.suggested,
    approved: effectiveAccess(approved),
    pending: pendingSuggestions(spec.config.suggested, approved),
    enabled: enabledTools(approved), // grupo já expandido: é isto que as caixas marcam
    catalog: toolCatalog(),
    steps: { tela: stepsOf(folderId), pasta: spec.config.steps ?? null, padrao: DEFAULT_STEPS },
  };
}

/**
 * Teto de passos do agente escolhido na tela (STEPS:<folderId>); `null` devolve a decisão para a pasta.
 *
 * Não entra no ACCESS nem na trava dele: passos não são acesso, e uma chave própria evita que mexer no teto
 * concorra com o liga/desliga de ferramenta.
 */
export function setAgentSteps(folderId: string, steps: number | null) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const vazio = steps === null || steps === undefined || String(steps).trim() === ''; // campo limpo na tela = volta para a pasta
  const next = vazio ? null : parseSteps(steps);
  if (!vazio && next === null) throw new Error('steps: use a whole number from 1 to 50');
  const name = agentName(folderId);
  const before = stepsOf(folderId);
  const t = runlog.begin('config', { question: `passos de ${name}: ${before ?? 'da pasta'} → ${next ?? 'da pasta'}`, agent: name }); // lang-ok: texto do TRACE, que e pt-BR por decisao
  t.step('set_steps', () => (next === null ? props.deleteProperty(`STEPS:${folderId}`) : props.setProperty(`STEPS:${folderId}`, String(next))), () => ({ folderId, before, after: next }));
  t.end({ answer: `passos: ${next ?? 'da pasta'}` });
  return agentAccess(folderId);
}

/**
 * Liga/desliga UMA ferramenta do agente (ADR-021 continua valendo: o efetivo mora em ACCESS:<folderId>).
 *
 * O cliente manda **um nome e um booleano**, nunca a lista inteira: o próximo estado é derivado aqui, do que
 * está gravado, e `withTool` recusa qualquer nome que `allowedTools` não reconheça.
 */
export function setAgentTool(folderId: string, tool: string, enabled: boolean) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const on = enabled === true; // estrito: qualquer coisa que não seja `true` desliga
  return underAccessLock(() => {
    const before = effectiveAccess(parseAccess(props.getProperty(`ACCESS:${folderId}`)));
    const next = withTool(before, String(tool), on); // lança antes de qualquer gravação
    const name = agentName(folderId);
    const t = runlog.begin('config', { question: `ferramenta ${tool} de ${name}: ${on ? 'ligar' : 'desligar'}`, agent: name }); // lang-ok: texto do TRACE, que e pt-BR por decisao
    t.step('set_tool', () => props.setProperty(`ACCESS:${folderId}`, JSON.stringify(next)), () => ({ folderId, tool, enabled: on, before, after: next }));
    t.end({ answer: `ferramentas: ${next.tools.length ? next.tools.join(', ') : 'nenhuma'}` });
    return { folderId, approved: next, enabled: enabledTools(next) };
  });
}

/**
 * Libera/revoga UMA pessoa do agente, sem mexer nas ferramentas (ADR-021).
 *
 * Mesmo contrato do `setAgentTool`: o cliente manda **um e-mail e um booleano**, nunca a lista inteira, e o
 * próximo estado é derivado aqui do que está gravado. Assim dois painéis abertos não escrevem um por cima do outro.
 */
export function setAgentUser(folderId: string, email: string, allowed: boolean) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const on = allowed === true; // estrito: qualquer coisa que não seja `true` revoga
  return underAccessLock(() => {
    const before = effectiveAccess(parseAccess(props.getProperty(`ACCESS:${folderId}`)));
    const next = withUser(before, String(email), on); // lança antes de qualquer gravação
    const name = agentName(folderId);
    const t = runlog.begin('config', { question: `pessoa ${email} em ${name}: ${on ? 'liberar' : 'revogar'}`, agent: name });
    t.step('set_user', () => props.setProperty(`ACCESS:${folderId}`, JSON.stringify(next)), () => ({ folderId, email, allowed: on, before, after: next }));
    t.end({ answer: `pessoas: ${next.users.length ? next.users.join(', ') : 'só o dono'}` });
    return { folderId, approved: next, enabled: enabledTools(next) };
  });
}

/**
 * Define a lista INTEIRA de ferramentas do agente pela CLI (`./gasclaw tools all`).
 *
 * Existe porque "deixe tudo ligado no dev" por 23 cliques é operação manual, e o projeto não aceita operação
 * manual depois do setup. Passa pela mesma trava e pelo mesmo `withTool` do painel: um nome fora do registry
 * derruba a chamada inteira, antes de qualquer gravação.
 */
/**
 * Núcleo ÚNICO da gravação da lista inteira de ferramentas. A CLI (`./gasclaw tools`) e o painel
 * ("Select all" / "Clear all") entram os dois por aqui.
 *
 * Existe porque marcar as 23 caixas do painel disparava 23 chamadas concorrentes, cada uma disputando a
 * trava global: sob contenção várias falhavam com "another access change is in progress" e o acesso
 * simplesmente não era concedido. Uma chamada, uma tomada da trava, uma gravação.
 *
 * O `reduce` sobre `withTool` valida nome a nome — nome desconhecido lança ANTES de qualquer gravação — e
 * sai na ordem canônica do registry, não na ordem dos cliques. `users` é preservado: mexer em ferramenta
 * nunca expulsa ninguém (ADR-021).
 */
function writeTools(folderId: string, names: string[], origem: string) {
  const props = PropertiesService.getScriptProperties();
  return underAccessLock(() => {
    const before = effectiveAccess(parseAccess(props.getProperty(`ACCESS:${folderId}`)));
    const next = names.reduce<Access>((acc, n) => withTool(acc, n, true), { users: before.users, tools: [] });
    const name = agentName(folderId);
    const t = runlog.begin('config', { question: `ferramentas de ${name} ${origem}: ${before.tools.length} → ${next.tools.length}`, agent: name }); // lang-ok: texto do TRACE, que e pt-BR por decisao
    t.step('set_tools', () => props.setProperty(`ACCESS:${folderId}`, JSON.stringify(next)), () => ({ folderId, before, after: next }));
    t.end({ answer: `ferramentas: ${next.tools.length}` });
    return { folderId, approved: next, enabled: enabledTools(next), users: next.users };
  });
}

/** Painel: liga ou desliga a lista inteira numa chamada. Mesma gravação da CLI, mesma trava. */
export function setAgentTools(folderId: string, tools: string[]) {
  assertOwner();
  const names = Array.isArray(tools) ? tools.map(String) : [];
  return writeTools(folderId, names, 'pela tela'); // lang-ok: rotulo do TRACE
}

function setTools(folder: string, set: string) {
  const folderId = folder || store.listAgents()[0]?.folderId || '';
  if (!folderId) return { ok: false, status: 400, error: 'no agent registered' };
  const pedido = set.trim();
  if (!pedido) return { ok: false, status: 400, error: 'use set=all, set=none or set=<comma-separated names>' };
  const names = pedido === 'all' ? toolCatalog().map((t) => t.name) : pedido === 'none' ? [] : pedido.split(',').map((x) => x.trim()).filter(Boolean);
  const r = writeTools(folderId, names, 'pela CLI'); // lang-ok: rotulo do TRACE
  return { ok: true, folderId, agent: agentName(folderId), enabled: r.enabled, users: r.users };
}

/**
 * O conjunto-juiz que veio NO BUNDLE. Serve ao painel e, principalmente, prova que ele existe do lado do
 * motor — sem isto o ciclo de sonho não enxergaria o próprio juiz, e a frase "o juiz vem do build" seria
 * aspiracional. O `holdout` aparece na contagem mas NUNCA no plano de um ciclo.
 */
export function judgeSet() {
  assertOwner();
  return {
    total: SCENARIOS.length,
    gate: namesOf('gate'),
    quality: namesOf('quality'),
    holdout: namesOf('holdout'),
    sample: scenarioMd(namesOf('quality')[0] ?? '')?.slice(0, 120) ?? null,
  };
}

// ---------- Capacidades do agente (ADR-038): o que ele pode fazer além de responder ----------

/**
 * O que cada capacidade significa, e O QUE FALTA para ela existir.
 *
 * `missing` não é enfeite: enquanto ele estiver preenchido, o interruptor NÃO LIGA. Um interruptor que
 * liga e não faz nada é pior que um interruptor ausente — o dono acha que aprovou um poder, e não
 * aprovou coisa nenhuma. Quando a peça ficar pronta, é este campo que vira `null`, num lugar só.
 */
const CAP_TEXT: Record<Capability, { label: string; what: string; missing: string | null }> = {
  dream: {
    label: 'Dream',
    what: 'Rewrites its own prompt and scores itself against the judge set. Costs quota; nothing takes effect without your click.',
    // O ciclo EXISTE: `dreamTick` está fiado no gatilho, o juiz veio no build e a contagem de falhas
    // roda. O que ainda não há é MATERIAL — e isso o próprio ciclo diz ao recusar começar, o que é
    // diferente de a capacidade não existir.
    missing: null,
  },
  initiative: {
    label: 'Reach out',
    what: 'Starts a conversation with you without being asked.',
    missing: 'the proactivity design was rejected in review and has no measurement: `ask` expires in 10 minutes and delivering a new card from the trigger is out of scope',
  },
  succeed: {
    label: 'Succeed',
    what: 'Writes a successor — its CODE, generated with Opus 5, as its own Apps Script project with its own, narrower permissions. Succession replaces: the previous one is archived, so the count does not grow.',
    missing: 'the code is written and deployed, but no successor has been measured against the incumbent yet, so passing the baton is still a human decision in this panel — and the generated code has never run here',
  },
  create: {
    label: 'Create agents',
    what: 'Creates NEW agents that are not successors. This one multiplies, so only ONE agent in the environment can have it.',
    missing: 'there is no `agent.create` tool in the closed registry, and the P25 measurement found no failure clusters in the trace to justify creating anyone',
  },
};

const capsProp = (folderId: string) => `CAP:${folderId}`;

/** As capacidades de um agente, com o texto que explica cada uma e quem é o criador designado hoje. */
export function agentCapabilities(folderId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const caps = parseCapabilities(props.getProperty(capsProp(folderId)));
  const creator = creatorOf(props.getProperty('CREATOR'), store.listAgents());
  return {
    folderId,
    capabilities: CAPABILITIES.map((c) => ({ name: c, on: can(caps, c), label: CAP_TEXT[c].label, what: CAP_TEXT[c].what, missing: CAP_TEXT[c].missing, available: CAP_TEXT[c].missing === null })),
    creator,
    isCreator: creator === folderId,
  };
}

/**
 * Liga ou desliga UMA capacidade. Só o dono, só nome da lista fechada.
 *
 * `create` é SINGLETON por forma do dado: uma Property `CREATOR` com UM folderId. Ligar aqui aponta o
 * criador para este agente — e, como não há dois lugares onde escrever, o anterior deixa de ser criador
 * sem que ninguém precise lembrar de desligá-lo. O estado ruim não é evitado: ele não é representável.
 */
export function setAgentCapability(folderId: string, cap: string, on: boolean) {
  assertOwner();
  if (!(CAPABILITIES as readonly string[]).includes(String(cap))) throw new Error(`unknown capability: ${cap}`);
  // A recusa vem do MESMO campo que a tela mostra: não há como a tela dizer "pronto" e o servidor
  // aceitar (nem o contrário), porque é uma fonte só.
  const falta = CAP_TEXT[cap as Capability].missing;
  if (on === true && falta) throw new Error(`${cap} is not available yet: ${falta}`);
  const nome = agentName(folderId);
  const t = runlog.begin('config', { question: `${cap} de ${nome}: ${on ? 'ligar' : 'desligar'}`, agent: nome });
  t.step(
    'set_capability',
    () =>
      underAccessLock(() => {
        const props = PropertiesService.getScriptProperties();
        const atual = parseCapabilities(props.getProperty(capsProp(folderId)));
        const proximo = on ? [...new Set([...atual, cap as Capability])] : atual.filter((c) => c !== cap);
        props.setProperty(capsProp(folderId), JSON.stringify(proximo));
        if (cap === 'create') {
          if (on) props.setProperty('CREATOR', setCreator(folderId));
          else if (props.getProperty('CREATOR') === folderId) props.deleteProperty('CREATOR');
        }
      }),
    () => ({ folderId, cap, on }),
  );
  t.end({ answer: `${cap} ${on ? 'ligada' : 'desligada'}` });
  return agentCapabilities(folderId);
}

/**
 * Os projetos filhos e o estado REAL de autorização de cada um.
 *
 * A P24 mediu no dev v96 que um filho criado, escrito e implantado pela API **não executa** até o dono
 * consentir — e que a tela de consentimento do Google vem com **código 200**. Por isso aqui o estado não é
 * guardado nem deduzido: ele é **conferido**, chamando a URL do filho e lendo o que volta. Guardar
 * "autorizado" seria afirmar hoje o que foi verdade ontem.
 *
 * O painel não consegue consentir pelo dono (não há API para isso, e é bom que não haja). O que ele pode
 * fazer é mostrar O QUE O FILHO PEDE antes do clique, e levar o dono até o lugar certo.
 */
export function listChildren(folderId?: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const list = parseChildren(props.getProperty('CHILDREN'));
  // O filho da POC P24 é real e está na conta do dono: mostrá-lo é o que permite conferir a tela de ponta
  // a ponta hoje, em vez de uma seção vazia que ninguém sabe se funciona.
  const poc = props.getProperty('P24_CHILD');
  const todos: Child[] = poc && !list.some((c) => c.scriptId === poc) ? [...list, { scriptId: poc, kind: 'automation' as const, folderId: null, title: 'POC P24', url: props.getProperty('P24_URL'), scopes: ['https://www.googleapis.com/auth/calendar.events'], parent: null, reason: 'returns a string — it is code, not an agent', at: 0 }] : list;
  // A lista é PLANA: agente e filho aparecem um embaixo do outro, e o vínculo é marcador, não
  // hierarquia. Um filho pode SUCEDER e virar o principal — aninhar exigiria redesenhar a árvore a cada
  // sucessão, e descreveria como permanente uma relação que é temporária.
  const meus = folderId ? todos.filter((c) => c.parent === folderId) : todos;
  return {
    folderId: folderId ?? null,
    children: meus.map((c) => {
      let probe: { code: number; body: string } | null = null;
      try {
        if (c.url) probe = fetchChild(c.url);
      } catch {
        probe = null; // filho fora do ar vira `unknown`, que NÃO é permissão — nunca `authorized`
      }
      const state = authState(c.url, probe ? probe.code : null, probe ? probe.body : null);
      return { ...c, state, stateLabel: AUTH_LABEL[state], kindLabel: KIND_LABEL[c.kind], kindWhat: KIND_WHAT[c.kind], editorUrl: `https://script.google.com/d/${c.scriptId}/edit` };
    }),
  };
}

/** Uma chamada só, curta, sem exceção: o painel não pode cair porque um filho está fora do ar. */
function fetchChild(url: string): { code: number; body: string } {
  // O TOKEN É O QUE TORNA A PERGUNTA VÁLIDA. Sem ele a chamada é anônima, e um web app `access: MYSELF`
  // responde com a PÁGINA DE LOGIN — um 200 com HTML dentro, sem a marca "Authorization needed". A tela
  // então lia 200 + corpo e concluía "autorizado" para um filho que não estava: o fail-closed do
  // `authState` foi derrotado não pela regra, mas por quem fazia a pergunta.
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
  });
  return { code: res.getResponseCode(), body: res.getContentText().slice(0, 1200) };
}

/** Tira o filho da lista do painel. NÃO apaga o projeto no Google — dizer isso na tela é parte do controle. */
export function forgetChild(scriptId: string, folderId?: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const id = String(scriptId ?? '').trim();
  if (!id) throw new Error('unknown child project');
  props.setProperty('CHILDREN', serializeChildren(withoutChild(parseChildren(props.getProperty('CHILDREN')), id)));
  if (props.getProperty('P24_CHILD') === id) {
    props.deleteProperty('P24_CHILD');
    props.deleteProperty('P24_URL'); // a URL sozinha reapareceria como filho meio registrado
  }
  return listChildren(folderId || undefined);
}

/**
 * O prompt do agente para a tela: os quatro papéis com conteúdo, procedência e se dá para editar daqui,
 * mais o prompt MONTADO — que é o que o modelo recebe de verdade.
 *
 * Mostrar o montado importa tanto quanto poder editar: a ordem dos papéis, o corte por orçamento e o
 * `(missing)` de um arquivo ausente só aparecem ali. Sem isso, "por que o agente ignorou o que escrevi?" não
 * tem resposta observável.
 */
export function agentPrompt(folderId: string) {
  assertOwner();
  const { name, roles } = agentRoles(folderId);
  const spec = loadAgentForTurn(folderId);
  return { folderId, name, roles, system: spec.system, model: spec.config.model, modelSource: spec.modelSource };
}

/** Grava UM papel. Só o dono, só arquivo `.md` da pasta — `saveRole` recusa as outras origens antes de escrever. */
export function setAgentRole(folderId: string, role: string, text: string) {
  assertOwner();
  const nome = agentName(folderId);
  const t = runlog.begin('config', { question: `${role} de ${nome}: ${String(text ?? '').length} caracteres`, agent: nome });
  const view = t.step('set_role', () => saveRole(folderId, String(role), String(text ?? '')), () => ({ folderId, role }));
  t.end({ answer: `${role} gravado` });
  return { ...agentPrompt(folderId), saved: role, view };
}

/** Grava o acesso aprovado (normalizado por effectiveAccess) e registra a mudança como run config no trace. */
export function approveAccess(folderId: string, access: Partial<Access>) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  return underAccessLock(() => {
    const before = effectiveAccess(parseAccess(props.getProperty(`ACCESS:${folderId}`)));
    const next = effectiveAccess(asAccess(access));
    const name = agentName(folderId);
    const t = runlog.begin('config', { question: `acesso de ${name}: ${describeAccess(before)} → ${describeAccess(next)}`, agent: name });
    t.step('approve_access', () => props.setProperty(`ACCESS:${folderId}`, JSON.stringify(next)), () => ({ folderId, before, after: next }));
    t.end({ answer: `aprovado: ${describeAccess(next)}` });
    return settingsState();
  });
}

/** Remove a aprovação: o agente volta a responder só ao dono, sem ferramentas. */
export function removeAccess(folderId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  return underAccessLock(() => {
    const before = effectiveAccess(parseAccess(props.getProperty(`ACCESS:${folderId}`)));
    const name = agentName(folderId);
    const t = runlog.begin('config', { question: `acesso de ${name}: ${describeAccess(before)} → só o dono, sem ferramentas`, agent: name }); // lang-ok: texto do TRACE
    t.step('remove_access', () => props.deleteProperty(`ACCESS:${folderId}`), () => ({ folderId, before }));
    t.end({ answer: 'acesso removido' }); // lang-ok: texto do TRACE, que e pt-BR por decisao
    return settingsState();
  });
}

export function makeDefault(folderId: string) {
  assertOwner();
  const agents = store.listAgents();
  store.saveAgents([...agents.filter((a) => a.folderId === folderId), ...agents.filter((a) => a.folderId !== folderId)]);
  return settingsState();
}

export function testAgent(folderId: string, text: string) {
  assertOwner();
  const key = store.getApiKey();
  if (!key) throw new Error('Save the OpenRouter key first.');
  const t = runlog.begin('test', { question: text });
  try {
    const spec = t.step('resolve_agent', () => loadAgentForTurn(folderId), agentInfo(folderId));
    // ADR-025: o teste da tela e o burst da POC P11 passam pelo mesmo caminho do Chat, rodízio incluído
    const model = spec.config.model;
    const call = (id: string, m: Message[]) => complete(key, id, m, CHAT_MAX_TOKENS);
    const out = reply(spec, [], text, (m) =>
      t.step('llm_call', () => (isFree(model) ? runFree((id) => call(id, m), { tools: false }) : call(model, m)), llmInfo(model, m), true),
    );
    t.mark('reply');
    const run = t.end({ answer: out.text });
    return { text: out.text, model: run.model ?? spec.config.model, ms: run.ms ?? 0, runId: run.id };
  } catch (err) {
    t.end({ error: (err as Error).message });
    throw err;
  }
}

export function setRuntimeEnabled(on: boolean) {
  assertOwner();
  store.setEnabled(on);
  return settingsState();
}

// ---------- Trace do agente: aba Ao vivo e detalhe do run ----------
export function liveRuns() {
  assertOwner();
  return runlog.liveRuns();
}

export function runDetail(id: string) {
  assertOwner();
  return runlog.runDetail(id);
}

// ---------- Observabilidade: lote, modelos e custo, limites ----------

/** Alvo do gatilho de 1 min (sem assertOwner: o gatilho roda como o dono). */
export function drainRuns() {
  if (runP3WorkerProbe()) return { n: 0, ms: 0, oldest: null };
  if (runP3IdleProbe()) return { n: 0, ms: 0, oldest: null };
  if (runP22TickProbe()) return { n: 0, ms: 0, oldest: null };
  if (runP22WakeProbe()) return { n: 0, ms: 0, oldest: null };
  // Três trabalhos INDEPENDENTES no mesmo tique, e o gatilho é a única coisa que faz o agente responder.
  // Em sequência crua, uma exceção no primeiro cancelava os outros dois — todo minuto, sem sinal na tela,
  // porque o run continua 'running'. Isolar é o conserto; o `warn` é o que transforma o silêncio em rastro.
  const isolado = (nome: string, f: () => void) => {
    try {
      f();
    } catch (err) {
      console.warn(`drainRuns ${nome}: ${redactMsg(err)}`);
    }
  };
  isolado('reconcile', () => runlog.reconcileStaleRuns());
  let drained: ReturnType<typeof observe.drain> | null = null;
  isolado('drain', () => void (drained = observe.drain()));
  isolado('runs', () => workRuns()); // gravar o trace em lote e avançar o run durável (ADR-027)
  // O sonho é o ÚLTIMO e toma no máximo 5 passos: o trabalho que o dono pediu vem primeiro, sempre.
  isolado('dream', () => {
    const d = dreamDeps();
    for (const a of store.listAgents()) tickDream(a.folderId, d);
  });
  return drained ?? { n: 0, ms: 0, oldest: null };
}

// ---------- Sucessão: o bastão, o mandato e a linhagem (item 17) ----------

const genStamp = (folderId: string) => `LASTGEN:${folderId}`;
const lineageProp = 'LINEAGE';
const mandateProp = (folderId: string) => `MANDATE:${folderId}`;

type Mandate = { folderId: string; left: number; minDelta: number; until: number };

const readMandate = (folderId: string): Mandate | null => {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(mandateProp(folderId));
    const m = raw ? (JSON.parse(raw) as Mandate) : null;
    return m && Number.isFinite(m.until) && Number.isFinite(m.left) ? m : null;
  } catch {
    return null; // mandato ilegível = sem mandato. Autorização não se presume.
  }
};

/**
 * O mandato: um ORÇAMENTO DE EVOLUÇÃO com escopo e validade, não um interruptor permanente.
 *
 * É a mesma forma do `once`/`granted` que o motor já usa para ferramentas. Dentro dele a sucessão
 * acontece sozinha e notifica; fora, volta a exigir clique. E ele EXPIRA — foi isso que separou
 * "ele vai evoluindo" de "você aprovou uma vez e delegou para sempre".
 */
export function signMandate(folderId: string, successions: number, minDelta: number, days: number) {
  assertOwner();
  const n = Math.max(1, Math.min(10, Math.trunc(Number(successions) || 0)));
  const d = Math.max(1, Math.min(30, Math.trunc(Number(days) || 0)));
  const m: Mandate = { folderId, left: n, minDelta: Math.max(1, Math.trunc(Number(minDelta) || 1)), until: Date.now() + d * 24 * 3600_000 };
  PropertiesService.getScriptProperties().setProperty(mandateProp(folderId), JSON.stringify(m));
  return m;
}

/** Fora do mandato a sucessão exige clique. Dentro, ela anda — e o mandato encolhe a cada uso. */
export function mandateFor(folderId: string) {
  assertOwner();
  const m = readMandate(folderId);
  const vivo = !!m && m.until > Date.now() && m.left > 0;
  return { folderId, mandate: m, active: vivo, reason: !m ? 'no mandate signed' : m.until <= Date.now() ? 'the mandate expired' : m.left <= 0 ? 'the mandate is used up' : '' };
}

/** A linhagem inteira: geração, pai, filho, tipo do ato, delta e custo. É o que torna "evoluiu" verificável. */
export function lineage() {
  assertOwner();
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(lineageProp);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return { entries: Array.isArray(arr) ? (arr as LineageEntry[]) : [] };
  } catch {
    return { entries: [] as LineageEntry[] };
  }
}

/**
 * Passa o bastão para o sucessor. DOIS ATOS SEPARADOS: criar e coroar são decisões diferentes, e
 * separá-las é o que permite avaliar o sucessor antes de ele assumir — e reverter depois.
 *
 * Reverter devolve a AUTORIDADE, não desfaz os EFEITOS: agentes já criados continuam criados e
 * mensagens já enviadas continuam enviadas. Isso está escrito na ADR-038 e é repetido aqui porque é
 * o tipo de coisa que se descobre tarde demais.
 */
export function passBaton(fromFolderId: string, toFolderId: string, delta: number | null) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const caps = parseCapabilities(props.getProperty(`CAP:${fromFolderId}`));
  const v = canSucceed(caps, parseStatus(props.getProperty(`STATUS:${fromFolderId}`)));
  if (!v.ok) throw new Error(v.reason);

  const m = mandateFor(fromFolderId);
  const dentro = m.active && delta !== null && delta >= (m.mandate?.minDelta ?? 1);
  // Fora do mandato o clique do dono JÁ ACONTECEU (esta função só roda por assertOwner), então o que
  // muda é o registro: dentro do mandato ele encolhe; fora, fica como decisão avulsa.
  if (dentro && m.mandate) props.setProperty(mandateProp(fromFolderId), JSON.stringify({ ...m.mandate, left: m.mandate.left - 1 }));

  const anterior = lineage().entries;
  const geracao = nextGeneration('succession', anterior.filter((e) => e.child === fromFolderId).map((e) => e.generation)[0] ?? 1);
  // `summary` não é enfeite: sem ele a linhagem vira uma lista de nomes sem parentesco, e "evoluiu"
  // deixa de ser verificável. O delta entra no texto porque é o número que sustenta a frase.
  const entrada: LineageEntry = {
    at: Date.now(),
    kind: 'succession',
    parent: fromFolderId,
    child: toFolderId,
    generation: geracao,
    delta,
    costUsd: 0,
    summary: delta === null ? 'succession with no measured delta' : `succession with delta ${delta} on the judge set`,
  };
  props.setProperty(lineageProp, JSON.stringify([...anterior, entrada].slice(-100)));

  // O sucessor NUNCA nasce com mais do que o antecessor: interseção, nunca união.
  props.setProperty(`CAP:${toFolderId}`, JSON.stringify(capsAfterSuccession(caps, parseCapabilities(props.getProperty(`CAP:${toFolderId}`)))));
  props.setProperty(`STATUS:${fromFolderId}`, 'archived'); // o antecessor sai; a conta não cresce
  props.setProperty(genStamp(fromFolderId), String(Date.now()));
  return { from: fromFolderId, to: toFolderId, generation: geracao, withinMandate: dentro, entry: entrada };
}

// ---------- O sucessor é CÓDIGO NOVO, escrito pelo Opus (item 5) ----------

const codegenDayProp = (now: number) => `CODEGEN:${new Date(now).toISOString().slice(0, 10)}`;

/**
 * O gasto do gerador no dia, AGREGADO sobre todos os agentes.
 *
 * Por agente não seria teto: `succeed` pode estar ligada em vários, e N agentes custariam N vezes o
 * orçamento sem ninguém ter decidido isso. A chave é por DIA (UTC) e some sozinha — nada a podar.
 */
function codegenSpentToday(now: number): number {
  const raw = PropertiesService.getScriptProperties().getProperty(codegenDayProp(now));
  const n = raw === null ? 0 : Number(raw);
  // Valor ilegível conta como TETO ATINGIDO, não como zero: na dúvida sobre quanto já se gastou, a
  // recusa custa uma geração adiada; o zero otimista custa dinheiro real.
  return Number.isFinite(n) && n >= 0 ? n : CODEGEN_DAILY_CAP_USD;
}

/** Os escopos do MOTOR, lidos do próprio manifesto pela API: é o teto do que um filho pode herdar. */
function engineScopes(token: string, own: string): string[] {
  const res = UrlFetchApp.fetch(`https://script.googleapis.com/v1/projects/${own}/content`, { headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`could not read this project's own scopes: HTTP ${res.getResponseCode()}`);
  const files = (JSON.parse(res.getContentText()) as { files?: { name: string; source: string }[] }).files ?? [];
  const man = files.find((f) => f.name === 'appsscript');
  if (!man) throw new Error("could not read this project's own manifest");
  return (JSON.parse(man.source) as { oauthScopes?: string[] }).oauthScopes ?? [];
}

/**
 * Escreve o sucessor: o CÓDIGO dele, gerado pelo Opus, como projeto Apps Script próprio.
 *
 * Isto NÃO é o ciclo de sonho. O sonho reescreve o TEXTO do papel e mede o candidato contra o
 * titular; aqui se escreve um PROGRAMA. Confundir os dois fazia a tela prometer uma coisa e o código
 * fazer outra — foi a correção do usuário em 2026-09-20 que separou os dois.
 *
 * O que esta função NÃO faz, e está dito aqui para ninguém procurar: ela não coroa ninguém. Criar e
 * coroar são atos separados (`passBaton`), e é essa separação que permite avaliar o sucessor antes
 * de ele assumir. Ela também não consegue autorizar o filho: a P24 mediu que ele não executa até o
 * dono consentir, e não existe API para consentir por ele — o painel só mostra onde clicar.
 */
/**
 * O que a tela precisa saber ANTES de mandar escrever um sucessor: quais escopos ele pode herdar,
 * quanto já se gastou hoje, e se há material.
 *
 * Os escopos vêm do manifesto do MOTOR, lido pela API — não de uma lista repetida no código. Uma
 * lista repetida envelheceria calada no dia em que um escopo entrasse no manifesto, e a tela
 * ofereceria menos (ou mais) do que o motor de fato tem.
 */
export function successorOptions(folderId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const id = String(folderId ?? '').trim();
  const cap = canSucceed(parseCapabilities(props.getProperty(`CAP:${id}`)), parseStatus(props.getProperty(`STATUS:${id}`)));
  const gasto = codegenSpentToday(Date.now());
  let escopos: string[] = [];
  let erro = '';
  try {
    escopos = engineScopes(ScriptApp.getOAuthToken(), ScriptApp.getScriptId()).filter((sc) => !(CHILD_FORBIDDEN_SCOPES as readonly string[]).includes(sc));
  } catch (e) {
    erro = (e as Error).message; // a tela mostra o motivo em vez de uma lista vazia sem explicação
  }
  return {
    folderId: id,
    can: cap.ok,
    reason: cap.reason,
    interval: mayGenerateNow(id),
    scopes: escopos,
    scopesError: erro,
    material: agentMaterial(id),
    generator: OPUS_MODEL,
    budget: { spentToday: gasto, cap: CODEGEN_DAILY_CAP_USD, perRun: CODEGEN_BUDGET_USD },
    note: `The successor is new CODE, written by ${OPUS_MODEL}, deployed as its own Apps Script project. It inherits fewer scopes than this engine has — never the same set, and never the ones that let a project write other projects. Google will not run it until you authorize it.`,
  };
}

export function writeSuccessor(folderId: string, requestedScopes: string[], goal?: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const id = String(folderId ?? '').trim();
  if (!id) throw new Error('unknown agent');

  // A capacidade e o estado vêm primeiro: um agente arquivado ou sem `succeed` não gera nada.
  const v = canSucceed(parseCapabilities(props.getProperty(`CAP:${id}`)), parseStatus(props.getProperty(`STATUS:${id}`)));
  if (!v.ok) return { ok: false as const, reason: v.reason, costUsd: 0 };
  const intervalo = mayGenerateNow(id);
  if (!intervalo.ok) return { ok: false as const, reason: intervalo.reason, costUsd: 0 };

  // D5 aplicada ao código: ou existe falha real contada, ou o DONO diz o que quer consertado. O que
  // a regra proíbe é o MODELO inventar o problema — o dono declarando um objetivo não é isso, e
  // exigir aglomerado aqui travaria a capacidade inteira até haver falha acumulada.
  const aglomerado = agentMaterial(id);
  const pedido = String(goal ?? '').trim().slice(0, 500);
  const material = aglomerado || pedido;
  if (!material) return { ok: false as const, reason: 'nothing to improve: no failure cluster yet, and no goal was stated', costUsd: 0 };

  const key = store.getApiKey();
  if (!key) return { ok: false as const, reason: 'save the OpenRouter key first', costUsd: 0 };
  const token = ScriptApp.getOAuthToken();
  const own = ScriptApp.getScriptId();
  const agente = loadAgent(id);

  const deps: SuccessorDeps = {
    complete: (messages, model) => {
      const r = complete(key, model, messages, 8000);
      return { text: r.text, costUsd: Number(r.usage?.cost ?? 0) };
    },
    parentScopes: () => engineScopes(token, own),
    own: () => own,
    api: (url, method, payload) => {
      const res = UrlFetchApp.fetch(url, {
        method,
        contentType: 'application/json',
        headers: { Authorization: `Bearer ${token}` },
        ...(payload ? { payload: JSON.stringify(payload) } : {}),
        muteHttpExceptions: true,
      });
      return { code: res.getResponseCode(), full: res.getContentText() };
    },
    spentToday: () => codegenSpentToday(Date.now()),
    addSpent: (usd) => props.setProperty(codegenDayProp(Date.now()), String(codegenSpentToday(Date.now()) + usd)),
    now: () => Date.now(),
  };

  const r = generateSuccessor(
    {
      folderId: id,
      // O "código vigente" do titular é o PROMPT dele na primeira geração: não existe fonte anterior
      // até o primeiro sucessor nascer. Dizer isso ao gerador é melhor que mandar um campo vazio e
      // deixá-lo inventar o que estava lá.
      incumbentSource: agente.system,
      material,
      requestedScopes: Array.isArray(requestedScopes) ? requestedScopes.map(String) : [],
      title: `${agente.name} — successor ${new Date().toISOString().slice(0, 10)}`,
      timeZone: Session.getScriptTimeZone(),
    },
    deps,
  );
  if (!r.ok) return { ok: false as const, reason: r.reason, costUsd: r.costUsd };

  props.setProperty('CHILDREN', serializeChildren(withChild(parseChildren(props.getProperty('CHILDREN')), r.child)));
  props.setProperty(genStamp(id), String(Date.now())); // o intervalo mínimo conta a partir de AGORA
  // Sub-agente conversa, logo precisa da chave: a janela nasce ARMADA e é consumida na primeira vez.
  props.setProperty(deliveryProp(r.child.scriptId), JSON.stringify(armDelivery(r.child.scriptId)));
  // A linhagem registra a GERAÇÃO DE CÓDIGO com o custo. Sem esta entrada, "ele se reescreveu" seria
  // uma frase na tela sem nada por trás; com ela, é um registro com data, pai, filho e dólar.
  const anterior = lineage().entries;
  const entrada: LineageEntry = {
    at: Date.now(),
    kind: 'codegen',
    parent: id,
    child: r.child.scriptId,
    generation: nextGeneration('codegen', anterior.filter((e) => e.parent === id).map((e) => e.generation)[0] ?? 1),
    delta: null, // nada foi medido ainda: o sucessor não rodou, e inventar um delta seria mentir
    costUsd: r.costUsd,
    summary: `successor code written by ${OPUS_MODEL} with ${r.child.scopes.length} scope(s)`,
  };
  props.setProperty(lineageProp, JSON.stringify([...anterior, entrada].slice(-100)));

  return { ok: true as const, child: r.child, costUsd: r.costUsd, needsConsent: true, budget: { spentToday: codegenSpentToday(Date.now()), cap: CODEGEN_DAILY_CAP_USD, perRun: CODEGEN_BUDGET_USD } };
}

/** Pode gerar agora? O intervalo mínimo é trava de custo E de descontrole, não conforto. */
export function mayGenerateNow(folderId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const carimbo = props.getProperty(genStamp(folderId));
  const v = mayGenerate(carimbo ? Number(carimbo) : null, intervalOf(undefined), Date.now());
  return { folderId, ok: v.ok, reason: v.reason };
}

// ---------- Teto familiar e entrega da chave (itens 21 e 19) ----------

const deliveryProp = (child: string) => `KEYDEL:${child}`;

const readDelivery = (child: string): KeyDelivery | null => {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(deliveryProp(child));
    return raw ? (JSON.parse(raw) as KeyDelivery) : null;
  } catch {
    return null; // estado ilegível = não pode entregar. Fail-closed é a resposta certa para credencial.
  }
};

/**
 * O gasto da FAMÍLIA, e o que fazer quando ele sobe.
 *
 * A conta usa o offset que já conhecíamos e nos custou uma investigação: o OpenRouter reporta uso POR
 * CHAVE, e a família inteira usa a mesma. Então `família − pai = filhos`. É LIMITE SUPERIOR, não medida —
 * qualquer outra coisa usando a chave entra na conta, e o número tem 10 min de defasagem.
 */
export function familySpend() {
  assertOwner();
  // Reusa a conferência que já existe (`usageView`) em vez de recalcular: `measured` é o que o gasclaw
  // gravou (o pai), `informed` é o que o OpenRouter reporta para a CHAVE (a família).
  const c = observe.usageView(store.getApiKey()).check;
  const filhos = c.informed === null ? null : childrenSpendUpperBound(c.informed, c.measured);
  return { family: c.informed, parent: c.measured, children: filhos, cap: FAMILY_CAP_USD, action: capAction(filhos), note: FAMILY_NOTE };
}

/**
 * Entrega a chave a UM filho, uma vez, com rastro.
 *
 * Só vale para `subagent`: uma `automation` nunca fala com modelo, logo nunca precisa de credencial — e
 * foi essa distinção que tirou a entrega do caminho crítico. O segredo prova que o filho é aquele que
 * este ambiente criou; a unicidade é o que torna um segredo vazado inútil passada a janela.
 */
export function deliverKeyToChild(child: string, secret: string) {
  const d = readDelivery(String(child));
  // O segredo mora em Property PRÓPRIA e é comparado em TEMPO CONSTANTE: comparar com `===` vazaria o
  // prefixo certo pelo tempo de resposta, e este é o caminho por onde a credencial do dono trafega.
  const guardado = PropertiesService.getScriptProperties().getProperty(`KEYSEC:${String(child)}`);
  const v = mayDeliverKey(d, String(child), cliAuthorized(guardado, String(secret)));
  const t = runlog.begin('config', { question: deliverySpan(String(child)), agent: 'family' });
  if (!v.ok) {
    t.end({ answer: `refused: ${v.reason}` });
    throw new Error(v.reason);
  }
  PropertiesService.getScriptProperties().setProperty(deliveryProp(String(child)), JSON.stringify(afterDelivery(d as KeyDelivery, Date.now())));
  t.end({ answer: 'delivered once' });
  return { key: store.getApiKey() };
}

/** Rearma a entrega. ATO HUMANO: automático desfaria a proteção que a unicidade cria. */
export function rearmChildKey(child: string) {
  assertOwner();
  const d = readDelivery(String(child));
  if (!d) throw new Error('unknown child project');
  // A CONTAGEM NÃO ZERA: entrega repetida vira sinal, não rotina. Um filho que pede a chave cinco vezes
  // aparece — e é isso que separa "republiquei o projeto" de "algo está pedindo demais".
  PropertiesService.getScriptProperties().setProperty(deliveryProp(String(child)), JSON.stringify(rearmDelivery(d)));
  return { child, armed: true, deliveries: d.deliveries };
}

// ---------- Campos declarados pelo agente (item 20): a mutação aparece no painel ----------

const FIELDS_FILE = 'fields.json';
const cfgProp = (folderId: string) => `CFG:${folderId}`;

/** O esquema que ESTE agente declara. Arquivo ausente ou ilegível = nenhum campo, nunca campo inventado. */
function declaredFields(folderId: string): { fields: ConfigField[]; errors: string[] } {
  try {
    const dir = DriveApp.getFolderById(folderId).getFoldersByName('.gasclaw');
    if (!dir.hasNext()) return { fields: [], errors: [] };
    const it = dir.next().getFilesByName(FIELDS_FILE);
    if (!it.hasNext()) return { fields: [], errors: [] };
    return parseSchema(JSON.parse(it.next().getBlob().getDataAsString()));
  } catch (e) {
    return { fields: [], errors: [`could not read ${FIELDS_FILE}: ${redactMsg(e)}`] };
  }
}

const storedFields = (folderId: string): Record<string, string | number | boolean> => {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(cfgProp(folderId));
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string | number | boolean>) : {};
  } catch {
    return {};
  }
};

/**
 * Os campos deste agente para a tela: o que ele DECLAROU, o que o dono JÁ CONFIGUROU, e os órfãos.
 *
 * Órfão é valor que o dono configurou e a geração atual não declara mais. Ele é PRESERVADO e mostrado,
 * nunca apagado em silêncio: o valor é do DONO, não do agente, e uma mutação não pode apagar escolha
 * humana. Se o bastão voltar para a geração anterior, a configuração dela volta junto.
 */
export function agentFields(folderId: string) {
  assertOwner();
  const { fields, errors } = declaredFields(folderId);
  const { active, orphans } = mergeAcrossGenerations(fields, storedFields(folderId));
  return {
    folderId,
    // A procedência é do ARQUIVO, não do campo: este esquema veio da pasta COMPARTILHÁVEL, e dizer isso
    // é o que permite ao dono pesar o que está lendo (mesma regra do ADR-035 para os papéis).
    origin: originLabel('folder'),
    fields: fields.map((f) => ({ ...f, value: active[f.name] ?? f.default ?? null })),
    orphans,
    errors,
  };
}

/** Grava UM campo. A pasta declara; o painel decide; o servidor valida antes de gravar. */
export function setAgentField(folderId: string, name: string, value: unknown) {
  assertOwner();
  const { fields } = declaredFields(folderId);
  const v = validateValues(fields, { [String(name)]: value });
  if (!v.ok) throw new Error(v.errors.join('; '));
  const props = PropertiesService.getScriptProperties();
  props.setProperty(cfgProp(folderId), JSON.stringify({ ...storedFields(folderId), ...v.clean }));
  return agentFields(folderId);
}

/**
 * O que o sonho precisa do mundo. Tudo que é decisão mora no núcleo; aqui só se entrega o Drive, o
 * modelo e o relógio.
 *
 * O gerador roda em MODELO GRÁTIS por decisão (D4): o ciclo de sonho não gasta dinheiro para descobrir
 * se o laço funciona. A geração de CÓDIGO é a exceção declarada, e não passa por aqui.
 */
/**
 * O material do agente: o aglomerado de falhas REAIS, em texto, ou vazio.
 *
 * CONTAGEM sobre o trace, nunca impressão do modelo: "7 runs falharam tocando agenda" é um inteiro;
 * "percebi que você anda precisando de ajuda" não é evidência de nada. É o mesmo material para o
 * sonho (que reescreve o texto) e para o gerador de código (que reescreve o programa) — a D5 vale
 * para os dois, e uma função só garante que ela não seja aplicada com dois critérios.
 */
function agentMaterial(folderId: string): string {
  const cs = cluster(parseFailures(PropertiesService.getScriptProperties().getProperty(failProp(folderId))), 30 * 24 * 3600_000, Date.now());
  const m = hasMaterial(cs);
  return m.ok && m.top ? `${m.top.count} runs failed with ${m.top.kind}${m.top.tool ? ` on ${m.top.tool}` : ''} in the last 30 days` : '';
}

function dreamDeps(): DreamDeps {
  const key = store.getApiKey();
  const tz = Session.getScriptTimeZone();
  return {
    spec: (folderId) => withAccess(loadAgent(folderId), approvedOf(folderId)),
    env: (folderId) => ({
      owner: ownerEmail(),
      apiKey: key,
      agent: () => withAccess(loadAgent(folderId), approvedOf(folderId)),
      folderId,
      memory: memoryIO(folderId),
      now: () => Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX (EEEE)") + ` fuso ${tz}`,
      llm: (m, messages, defs) => complete(key ?? '', m, messages, 1000, undefined, defs),
      clock: Date.now,
      tickets: cacheTickets(),
      newToken,
      skill: (name) => skillsIO(folderId).body(name),
      bootstrap: bootstrapIO(folderId),
      google: gasGoogle,
      zone: zone(),
    }),
    generate: (messages, temperature) => {
      const r = runFree((id) => complete(key ?? '', id, messages, 2000, undefined, undefined, temperature), { tools: false });
      return typeof r.text === 'string' ? r.text : '';
    },
    // CONTAGEM sobre o trace, nunca impressão do modelo: "7 runs falharam tocando agenda" é um inteiro;
    // "percebi que você anda precisando de ajuda" não é evidência de nada. Sem material o ciclo não roda.
    material: agentMaterial,
    now: Date.now,
    cycleId: () => `d${Date.now().toString(36)}`,
  };
}

/**
 * Registra UMA falha real deste agente. Chamado quando um run termina mal — é o combustível do
 * aglomerado, e sem ele o organismo não tem o que contar.
 *
 * A P25 mediu o trace e achou ZERO falhas agrupáveis: 86 requisições, 100% evals. Não era agrupamento
 * mal desenhado — é que não havia o que agrupar. Instrumentar primeiro e deixar acumular foi a decisão
 * do dono, e é o que esta função implementa: o contador nasce agora, o criador nasce quando houver dado.
 */
/**
 * Conta o que deu errado num turno. Chamada pelo passo do run durável — é ESTA a fiação do item 24.
 *
 * Nunca lança: um defeito na contagem não pode derrubar a resposta ao dono. Falhar em contar uma falha
 * é ruim; falhar em responder por causa disso seria pior, e trocaria um problema de dado por um de
 * produto. O `warn` deixa rastro para não virar silêncio.
 */
function countTurnFailures(folderId: string, turn: { events: readonly { name: string; status: string }[]; text: string; stopped?: 'steps' | 'deadline' }): void {
  try {
    for (const f of failuresFrom(turn, Date.now())) recordFailure(folderId, f.kind, f.tool);
  } catch (err) {
    console.warn(`countTurnFailures: ${redactMsg(err)}`);
  }
}

export function recordFailure(folderId: string, kind: Failure['kind'], tool?: string) {
  const props = PropertiesService.getScriptProperties();
  const chave = failProp(folderId);
  const atuais = parseFailures(props.getProperty(chave));
  props.setProperty(chave, serializeFailures(withFailure(atuais, { at: Date.now(), kind, ...(tool ? { tool } : {}) }, Date.now())));
}

/** O que já foi contado, e se há material para um ciclo. Leitura para a tela — não decide nada sozinha. */
export function agentFailures(folderId: string) {
  assertOwner();
  const falhas = parseFailures(PropertiesService.getScriptProperties().getProperty(failProp(folderId)));
  const cs = cluster(falhas, 30 * 24 * 3600_000, Date.now());
  const m = hasMaterial(cs);
  return { folderId, total: falhas.length, clusters: cs.slice(0, 5), hasMaterial: m.ok, reason: m.reason };
}

/** Começa um ciclo de sonho neste agente. Só o dono, e só com a capacidade `dream` aprovada. */
export function startAgentDream(folderId: string) {
  assertOwner();
  const caps = parseCapabilities(PropertiesService.getScriptProperties().getProperty(`CAP:${folderId}`));
  if (!can(caps, 'dream')) throw new Error('this agent does not have the dream capability turned on');
  const nome = agentName(folderId);
  const t = runlog.begin('config', { question: `dream cycle for ${nome}`, agent: nome });
  const r = t.step('start_dream', () => startDream(folderId, dreamDeps()), () => ({ folderId }));
  t.end({ answer: r.started ? `cycle ${r.cycleId} started` : `did not start: ${r.reason}` });
  return r;
}

/** O estado do ciclo deste agente, para a tela. */
export function agentDream(folderId: string) {
  assertOwner();
  const io = dreamIO();
  const cycleId = io.active(folderId);
  return { folderId, cycleId, state: cycleId ? io.load(folderId, cycleId) : null };
}

export function observability() {
  assertOwner();
  const trigger = observe.ensureTrigger();
  const drained = observe.maybeDrain();
  return { trigger, drained, oldestQueued: observe.oldestQueued(), drains: observe.drainHistory().slice(0, 10) };
}

export function drainNow() {
  assertOwner();
  return { ...observe.drain(), trigger: observe.triggerStatus(true) };
}

export function agentModel(folderId: string) {
  assertOwner();
  const approved = approvedOf(folderId);
  const spec = withAccess(loadAgent(folderId), approved);
  return {
    folderId,
    name: spec.name,
    fromFolder: spec.config.model,
    // ADR-035: de onde veio CADA papel (editor, Doc, .md ou ausente). Renomear a pasta desliga os papéis do
    // editor em silêncio e a precedência desce para os `.md`, que são editáveis por quem tem a pasta. O dado
    // já existia e parava no trace; sem ele na tela, a queda de confiança das instruções é invisível.
    origem: spec.origem,
    ...(spec.editorError ? { editorError: spec.editorError } : {}),
    override: getOverride(folderId),
    tools: spec.access.tools,
    models: openRouterModels(),
    suggested: spec.config.suggested,
    approved: spec.access,
    pending: pendingSuggestions(spec.config.suggested, approved),
    // ADR-025: com o rodízio, saber qual gratuito respondeu por último importa mais que o id configurado
    lastModel: runlog.liveRuns().recent.find((r) => r.agent === spec.name && r.model)?.model ?? null,
  };
}

export function setAgentModel(folderId: string, model: string | null) {
  assertOwner();
  const spec = withAccess(loadAgent(folderId), approvedOf(folderId));
  const before = getOverride(folderId);
  if (model) {
    const err = validateChoice(openRouterModels(), model.trim(), spec.access.tools);
    if (err) throw new Error(err);
  }
  const t = runlog.begin('config', { question: `modelo de ${spec.name}: ${before ?? spec.config.model} → ${model ?? `${spec.config.model} (do AGENTS)`}`, agent: spec.name }); // lang-ok: texto do TRACE, que e pt-BR por decisao
  t.step('set_model', () => setOverride(folderId, model ? model.trim() : null), () => ({ folderId, from: before, to: model, fromFolder: spec.config.model }));
  t.end({ answer: `modelo: ${model ?? spec.config.model}` });
  return agentModel(folderId);
}

export function usageChart(day?: string, range?: string) {
  assertOwner();
  return observe.usageView(store.getApiKey(), day || undefined, range || undefined);
}

export function limitsPanel(fresh?: boolean) {
  assertOwner();
  return observe.limitsNow(store.getApiKey(), fresh === true);
}

// ---------- POC P1: UrlFetch com resposta longa ----------
export function pocUrlFetchTimeout() {
  assertOwner();
  const key = store.getApiKey();
  if (!key) throw new Error('Save the OpenRouter key first.');
  const first = store.listAgents()[0];
  const model = first ? loadAgent(first.folderId).config.model : 'openrouter/auto';
  const prompt = 'Escreva um ensaio de 6000 palavras, muito detalhado, sobre a história da computação, capítulo por capítulo.'; // lang-ok: PROMPT da POC enviado ao modelo; traduzir mudaria a medicao
  const t0 = Date.now();
  try {
    const r = complete(key, model, [{ role: 'user', content: prompt }], 12_000);
    const seconds = (Date.now() - t0) / 1000;
    console.log(JSON.stringify({ poc: 'P1', seconds, chars: r.text.length, model }));
    return { pass: seconds > 60, seconds, chars: r.text.length, model, usage: r.usage };
  } catch (err) {
    return { pass: false, seconds: (Date.now() - t0) / 1000, model, error: (err as Error).message };
  }
}

// ---------- POCs automáticas: ./gasclaw poc <id> [etapa] → doGet?action=poc ----------

/**
 * Sonda da POC P24 (só no build dev): o token DO SCRIPT consegue criar, escrever e implantar um
 * projeto Apps Script filho? Mede o que só o dev responde; não cria nada em produção.
 *
 * A guarda `mayWriteProject` é chamada ANTES de qualquer escrita: depois que `script.projects`
 * entrou no manifesto, ela é a única coisa separando o filho do motor.
 */
function pocP24(step?: string): unknown {
  const token = ScriptApp.getOAuthToken();
  const own = ScriptApp.getScriptId();
  const api = 'https://script.googleapis.com/v1/projects';
  const call = (url: string, method: GoogleAppsScript.URL_Fetch.HttpMethod, payload?: unknown) => {
    const t0 = Date.now();
    const res = UrlFetchApp.fetch(url, {
      method,
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${token}` },
      ...(payload ? { payload: JSON.stringify(payload) } : {}),
      muteHttpExceptions: true,
    });
    // `body` é para LER na tela e por isso vem cortado; `full` é o texto inteiro, para PARSEAR.
    // Medido na P24: o GET de /content devolve manifesto + código e passa de 900 caracteres, então
    // parsear o corte fazia o JSON.parse quebrar — e o `catch` devolvia lista vazia, indistinguível de
    // "o filho não tem escopo". A medição quase reprovou um desenho que funciona.
    const full = res.getContentText();
    return { code: res.getResponseCode(), ms: Date.now() - t0, body: full.slice(0, 900), full };
  };

  if (step === 'guard') {
    // C5: a recusa do próprio projeto, exercitada no ambiente real (não só em teste de unidade).
    const mine = mayWriteProject(own, own);
    const other = mayWriteProject('algum-outro-projeto', own);
    return { pass: mine.ok === false && other.ok === true, own: own.slice(0, 8) + '…', refusedSelf: mine, allowedOther: other.ok };
  }

  if (step === 'create') {
    const r = call(api, 'post', { title: `gasclaw poc p24 ${new Date().toISOString().slice(0, 19)}` });
    let scriptId: string | null = null;
    try {
      scriptId = (JSON.parse(r.body) as { scriptId?: string }).scriptId ?? null;
    } catch {
      scriptId = null;
    }
    if (scriptId) PropertiesService.getScriptProperties().setProperty('P24_CHILD', scriptId);
    return { pass: r.code === 200 && !!scriptId, code: r.code, ms: r.ms, scriptId, body: scriptId ? undefined : r.body };
  }

  if (step === 'write') {
    const child = PropertiesService.getScriptProperties().getProperty('P24_CHILD');
    if (!child) return { pass: false, error: 'run `poc p24 create` first' };
    const guard = mayWriteProject(child, own);
    if (!guard.ok) return { pass: false, error: guard.reason };
    // Manifesto MÍNIMO: só Calendar. Se o filho nascer com os escopos do pai, o desenho inteiro cai.
    const files = [
      { name: 'appsscript', type: 'JSON', source: JSON.stringify({ timeZone: 'America/Sao_Paulo', runtimeVersion: 'V8', oauthScopes: ['https://www.googleapis.com/auth/calendar.events'] }) },
      { name: 'Code', type: 'SERVER_JS', source: 'function ping() { return "p24-ok"; }\n' },
    ];
    const r = call(`${api}/${child}/content`, 'put', { files });
    const back = call(`${api}/${child}/content`, 'get');
    // `null` = não consegui LER; `[]` = li e não há escopo. Confundir os dois foi o defeito que esta
    // sonda teve na primeira medição, e é o tipo de engano que reprova um desenho correto.
    let scopes: string[] | null = null;
    let readError: string | undefined;
    try {
      const got = (JSON.parse(back.full) as { files?: { name: string; source: string }[] }).files ?? [];
      const man = got.find((f) => f.name === 'appsscript');
      if (!man) readError = 'manifest not found in the read-back';
      else scopes = (JSON.parse(man.source) as { oauthScopes?: string[] }).oauthScopes ?? [];
    } catch (e) {
      readError = `read-back did not parse: ${(e as Error).message}`;
    }
    // C4 do desenho: o filho tem os escopos que foram PEDIDOS, e não os do pai.
    const ok = r.code === 200 && back.code === 200 && scopes !== null && scopes.length === 1 && scopes[0].endsWith('calendar.events');
    return { pass: ok, code: r.code, readBackCode: back.code, ms: r.ms, readBackScopes: scopes, parentScopes: 17, ...(readError ? { readError } : {}) };
  }

  if (step === 'deploy') {
    const child = PropertiesService.getScriptProperties().getProperty('P24_CHILD');
    if (!child) return { pass: false, error: 'run `poc p24 create` first' };
    const ver = call(`${api}/${child}/versions`, 'post', { description: 'p24' });
    const dep = call(`${api}/${child}/deployments`, 'post', { versionNumber: 1, manifestFileName: 'appsscript', description: 'p24' });
    // O corpo do sucesso era descartado — e é nele que vem o deploymentId. Medir e jogar fora a
    // evidência foi o mesmo erro do corte em 900 caracteres, por outro caminho.
    let deploymentId: string | null = null;
    try {
      deploymentId = (JSON.parse(dep.full) as { deploymentId?: string }).deploymentId ?? null;
    } catch {
      deploymentId = null;
    }
    if (deploymentId) PropertiesService.getScriptProperties().setProperty('P24_DEPLOY', deploymentId);
    // ATENÇÃO ao que este `pass` afirma: que a IMPLANTAÇÃO foi criada. NÃO afirma que o filho executa —
    // isso é o passo `run`, e confundir os dois daria um placar verde sem a propriedade que importa.
    return { pass: ver.code === 200 && dep.code === 200, created: true, executes: 'not proven here — see step `run`', deploymentId, version: { code: ver.code, ms: ver.ms }, deployment: { code: dep.code, ms: dep.ms, body: dep.code === 200 ? undefined : dep.body } };
  }

  if (step === 'run') {
    // A pergunta que decide o desenho: o filho EXECUTA sem o dono clicar em consentimento?
    // Reescreve o filho como web app (doGet) e o chama pela URL. O que voltar é a resposta:
    // o ping = executa; uma tela de autorização = precisa de clique, e aí o custo é por especialista.
    const child = PropertiesService.getScriptProperties().getProperty('P24_CHILD');
    if (!child) return { pass: false, error: 'run `poc p24 create` first' };
    const guard = mayWriteProject(child, own);
    if (!guard.ok) return { pass: false, error: guard.reason };
    const files = [
      {
        name: 'appsscript',
        type: 'JSON',
        source: JSON.stringify({
          timeZone: 'America/Sao_Paulo',
          runtimeVersion: 'V8',
          oauthScopes: ['https://www.googleapis.com/auth/calendar.events'],
          webapp: { executeAs: 'USER_DEPLOYING', access: 'MYSELF' },
        }),
      },
      { name: 'Code', type: 'SERVER_JS', source: 'function doGet() { return ContentService.createTextOutput("p24-ok"); }\n' },
    ];
    const w = call(`${api}/${child}/content`, 'put', { files });
    const ver = call(`${api}/${child}/versions`, 'post', { description: 'p24-run' });
    const dep = call(`${api}/${child}/deployments`, 'post', { versionNumber: 2, manifestFileName: 'appsscript', description: 'p24-run' });
    let url: string | null = null;
    try {
      const entries = (JSON.parse(dep.full) as { entryPoints?: { webApp?: { url?: string } }[] }).entryPoints ?? [];
      url = entries.map((e) => e.webApp?.url).find((u) => !!u) ?? null;
    } catch {
      url = null;
    }
    if (!url) return { pass: false, write: w.code, version: ver.code, deployment: dep.code, error: 'no web app URL in the deployment', body: dep.body };
    // Guardar a URL é o que permite o PAINEL conferir o estado de autorização depois. Sem ela, o filho
    // apareceria como "não implantado" — errado, e justamente o dado que o dono precisa para autorizar.
    PropertiesService.getScriptProperties().setProperty('P24_URL', url);
    const hit = call(url, 'get');
    const executed = hit.code === 200 && hit.full.indexOf('p24-ok') >= 0;
    return {
      pass: executed,
      url,
      hit: { code: hit.code, ms: hit.ms, body: hit.body.slice(0, 200) },
      // Se NÃO executou, o corpo diz o que o Google pediu: é aqui que se lê quantos cliques custam.
      reading: executed ? 'the child ran with no consent click' : 'the child did NOT run — read `hit.body` for what Google asked for',
    };
  }

  if (step === 'key') {
    // C-e: o filho recebe a chave do OpenRouter sem o pai entregar credencial?
    // Não existe API para gravar Script Properties de OUTRO projeto: `PropertiesService` é do
    // projeto que executa. O único caminho seria o pai ESCREVER a chave no CÓDIGO do filho —
    // e isso é entregar credencial, com a consequência de o filho gastar fora do teto do pai.
    return { pass: false, finding: 'no API writes another project\u2019s Script Properties; the only path is embedding the key in the child source, which IS handing over the credential' };
  }

  return { pass: false, error: 'steps: guard, create, write, deploy, key' };
}

/**
 * Sonda da P26 (só no build dev): a parte do gerador de sucessor que NÃO custa nada.
 *
 * Mede o passo mais provável de estar quebrado sem ninguém notar: ler os escopos do PRÓPRIO
 * manifesto pela API. Se essa leitura falhar, `narrowScopes` compararia contra uma lista vazia e
 * recusaria tudo — uma capacidade morta que a tela descreveria como viva. O Opus não é chamado aqui:
 * gastar o modelo mais caro do projeto para conferir uma leitura seria pagar pela pergunta errada.
 */
function pocP26(step?: string): unknown {
  if (step === 'scopes') {
    const proprios = engineScopes(ScriptApp.getOAuthToken(), ScriptApp.getScriptId());
    const herdaveis = proprios.filter((sc) => !(CHILD_FORBIDDEN_SCOPES as readonly string[]).includes(sc));
    const proibidos = proprios.filter((sc) => (CHILD_FORBIDDEN_SCOPES as readonly string[]).includes(sc));
    // Um escopo só é o caso REAL do sucessor: estreito de verdade, e estritamente menor que o do pai.
    const um = narrowScopes([herdaveis[0]], proprios);
    const tudo = narrowScopes(herdaveis, proprios);
    const chave = narrowScopes([proibidos[0] ?? 'https://www.googleapis.com/auth/script.projects'], proprios);
    return {
      pass: proprios.length > 0 && um.ok === true && tudo.ok === false && chave.ok === false,
      ownScopes: proprios.length,
      inheritable: herdaveis.length,
      oneScope: um,
      allOfThem: { ok: tudo.ok, reason: tudo.reason },
      theKeyToTheHouse: { ok: chave.ok, reason: chave.reason },
    };
  }
  if (step === 'budget') {
    const hoje = codegenSpentToday(Date.now());
    return { pass: Number.isFinite(hoje) && hoje >= 0, spentTodayUsd: hoje, capUsd: CODEGEN_DAILY_CAP_USD, perRunUsd: CODEGEN_BUDGET_USD, generator: OPUS_MODEL };
  }
  return { pass: false, error: 'steps: scopes, budget' };
}

const POCS: Record<string, (step?: string, params?: Record<string, string>) => unknown> = {
  p1: () => pocUrlFetchTimeout(),
  p2: (step, params = {}) => pocP2(step, params, runIO()),
  p3: (step) => pocP3(step),
  p4: (step) => pocP4(step),
  p19: (step) => pocP19(step),
  p20: (step) => pocP20(step),
  p22: (step, params = {}) => pocP22(step, params),
  p24: (step) => pocP24(step),
  p26: (step) => pocP26(step),
  p6: (step) => pocP6(step, ownerEmail()),
  p18: (step, params) => pocP18(step, params),
  p10: (step, params) => pocP10(step, params),
  p11: (step, params = {}) =>
    pocP11(step, params, {
      apiKey: store.getApiKey,
      agent: () => {
        const first = store.listAgents()[0];
        return first ? { folderId: first.folderId, tools: withAccess(loadAgent(first.folderId), approvedOf(first.folderId)).access.tools } : null;
      },
      testAgent: (folderId, q) => {
        const r = testAgent(folderId, q);
        return { runId: r.runId, model: r.model };
      },
      llm: (model, prompt) => ({ model: complete(store.getApiKey() ?? '', model, [{ role: 'user', content: prompt }], 100).model ?? model }),
    }),
  p15: (step, params = {}) => pocP15(step, params, { apiKey: store.getApiKey, owner: ownerEmail }),
  p16: (step, params = {}) =>
    pocP16(step, params, {
      apiKey: store.getApiKey,
      agent: () => {
        const first = store.listAgents()[0];
        return first ? { folderId: first.folderId, tools: withAccess(loadAgent(first.folderId), approvedOf(first.folderId)).access.tools } : null;
      },
      testAgent: (folderId, q) => {
        const r = testAgent(folderId, q);
        return { runId: r.runId, model: r.model };
      },
    }),
  p14: (step, params = {}) => {
    if (step !== 'real') return pocP14(step, params);
    const first = store.listAgents()[0];
    if (!first) throw new Error('P14 for real: add an agent in the panel first');
    const r = testAgent(first.folderId, params.q || 'Responda em uma frase curta: o que você faz?'); // lang-ok: PROMPT enviado ao modelo, nao texto de tela
    const run = runlog.runDetail(r.runId).run;
    return { poc: 'P14', step, pass: true, runId: r.runId, spans: run?.spans.map((s) => s.name) ?? [], coverage: run ? coverage(run) : 0, ms: run?.ms, model: run?.model, tokens: run?.tokens, cost: run?.cost };
  },
};

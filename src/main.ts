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
import { CHAT_BUDGET_MS, DEFAULT_STEPS, MAX_HISTORY, reply } from './agent';
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
import * as store from './store';
import { memoryIO } from './tools/memoryStore';
import { allowedTools, toolCatalog } from './tools/registry';
import { coverage, redact } from './trace';
import { agentInfo, llmInfo, traceDeps } from './traced';
import { webClick, webSend, webSpace } from './webchat';
import { agentFolderPath, canUse, effectiveAccess, enabledTools, ensureFolderPath, extractFolderId, loadAgent, parseAccess, parseSteps, pendingSuggestions, seedAgent, validAgentName, withAccess, withTool, withUser, type Access, type LoadedAgent } from './workspace';

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
  if (!me || me !== ownerEmail()) throw new Error('Apenas o dono do gasclaw pode fazer isso.');
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
    if (!isDev()) return { ok: false, pass: false, status: 404, error: 'POCs só existem no build do dev' };
    const run = POCS[p.id ?? ''];
    if (!run) return { ok: false, pass: false, error: `POC desconhecida: ${p.id}` };
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
  return { ok: false, status: 400, error: `ação desconhecida: ${action}` };
}

// ---------- Job da CLI (ADR-020): a resposta do web app às vezes se perde no Google (echo 404), sem relação com a duração ----------
const JOB_ID = /^[0-9a-f]{16,32}$/;
const JOB_TTL = 21_600; // 6 h
const jobKey = (id: string) => `job:${id}`;

/** Executa uma vez por id e guarda o resultado; o mesmo id de novo devolve o guardado (ou "em execução") sem reexecutar. */
function runJob(id: string, fn: () => unknown): unknown {
  if (!JOB_ID.test(id)) return { ok: false, status: 400, error: 'job inválido' };
  const cache = CacheService.getScriptCache();
  const prev = cache.get(jobKey(id));
  if (prev) {
    const j = JSON.parse(prev) as { status: string; result?: unknown };
    return j.status === 'done' ? j.result : { ok: false, status: 409, error: 'job ainda em execução', job: id };
  }
  cache.put(jobKey(id), JSON.stringify({ status: 'running', at: Date.now() }), JOB_TTL);
  let result: unknown;
  try {
    result = fn();
  } catch (err) {
    result = { ok: false, error: (err as Error).message };
  }
  const raw = JSON.stringify({ status: 'done', result });
  cache.put(jobKey(id), raw.length < 95_000 ? raw : JSON.stringify({ status: 'done', result: { ok: false, error: 'resultado maior que o cache (100 KB)' } }), JOB_TTL);
  return result;
}

/** GET de leitura: estado do job (unknown · running · done com o resultado). */
function readJob(id: string) {
  if (!JOB_ID.test(id)) return { ok: false, status: 400, error: 'job inválido' };
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
      if (!validSecret(p.secret ?? '')) return json({ ok: false, status: 400, error: 'segredo inválido: use 64 caracteres hexadecimais (openssl rand -hex 32)' });
      if (stored && !cliAuthorized(stored, p.secret)) return json({ ok: false, status: 403, error: 'segredo da CLI errado' });
      if (!stored) {
        props.setProperty('CLI_SECRET', p.secret);
        props.setProperty('CLI_SECRET_AT', new Date().toISOString()); // a data aparece no painel (ADR-022)
      }
      return json({ ok: true });
    }
    if (!cliAuthorized(stored, p.secret)) return json({ ok: false, status: 403, error: 'segredo da CLI ausente ou errado (rode ./gasclaw up)' });
    if (!MUTATING.has(action)) return json({ ok: false, status: 400, error: `ação desconhecida: ${action}` });
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
      return HtmlService.createHtmlOutputFromFile('hub').setTitle(title('gasclaw · painéis')).addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
    if (MUTATING.has(action)) return json({ ok: false, status: 405, error: 'ação com efeito: use POST com o segredo da CLI (./gasclaw)' });
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
    return json({ ok: false, error: `ação desconhecida: ${action}` });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message });
  }
}

// ---------- Google Chat (app clássico) ----------
const nowText = () => {
  const tz = Session.getScriptTimeZone();
  return `${Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX (EEEE)")} fuso ${tz}`;
};

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
      ctx: { now: nowText, ownerDm, memory: memoryIO(spec.folderId, zone().timeZone), skill: (name: string) => skillsIO(spec.folderId).body(name), google: gasGoogle, ...zone() },
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
  if (out.kind === 'rejected') return { text: `Não dá para responder: ${out.error}.` }; // mantém o card de outra pessoa intacto
  if (out.kind === 'refreshed') return updateCard(approvalCard({ token: replacement, pending: out.run.pending!, folderId: out.run.folderId, runId: out.run.runId }, out.run.answer ?? 'Esta ação ainda precisa da sua aprovação.'));
  const done = pumpById(stepDeps(CHAT_BUDGET_MS), out.run.runId) ?? out.run;
  if (done.status === 'waiting' && done.pending?.kind === 'approval') {
    const token = newToken();
    const waiting = { ...done, approval: issueGrant(done.pending, done.user, hashToken(token), Date.now()) };
    io.save(waiting);
    return updateCard(approvalCard({ token, pending: waiting.pending!, folderId: waiting.folderId, runId: waiting.runId }, waiting.answer ?? 'Esta ação precisa da sua aprovação.'));
  }
  if (done.status === 'waiting' && done.pending?.kind === 'ask' && done.snapshot) {
    const token = newToken();
    const t = issue({ user: done.user, session: done.session, text: done.text, history: [], state: done.snapshot, pending: done.pending, granted: done.granted, done: done.done, runId: done.runId }, token, Date.now());
    cacheTickets().put(t);
    return updateCard(approvalCard(t, done.answer ?? 'Preciso de uma resposta.'));
  }
  return updateCard({ text: done.answer ?? (done.status === 'failed' ? `Não consegui terminar: ${done.error ?? 'erro desconhecido'}` : 'Aprovação registrada; continuarei a tarefa.'), cardsV2: [] });
}

export function onMessage(e: ChatEvent) {
  const typed = (e.message?.argumentText ?? e.message?.text ?? '').trim().toLowerCase();
  if (isDev() && e.type === 'MESSAGE' && typed === '/poc p2') {
    if (e.user.email.toLowerCase() !== ownerEmail()) return { text: 'A POC P2 so pode ser iniciada pelo dono do gasclaw.' };
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
      ts.mark('entrada_sincrona', { motivo: 'identidade do app no Chat indisponivel' });
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
  const what = p.decision ? `aprovação: ${String(p.decision)}` : p.answer ? `resposta: ${String(p.answer).slice(0, 200)}` : 'clique';
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
      if (!canUse(spec.access, r.user, me)) throw new Error(`${r.user} não tem acesso ao agente ${spec.name}`); // acesso aprovado no painel (ADR-021)
      const apiKey = store.getApiKey();
      if (!apiKey) throw new Error('Falta a chave do OpenRouter. Cole-a na tela gasclaw.');
      const d = chatDeps();
      const isOwner = r.user === me.toLowerCase();
      const ownerDm = r.ownerDm;
      const base = d.toolkit!(spec, ownerDm);
      // O acesso ao Google só entra no contexto de quem é o dono, igual à conversa (ADR-023).
      const kit = { ...base, ctx: { ...base.ctx, isOwner, google: isOwner ? base.ctx.google : undefined } };
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
  if (!entry) return { ok: false, error: 'Nenhum agente configurado. Cole a URL de uma pasta do Drive na tela gasclaw.' };
  const t = String(text ?? '').slice(0, 4000).trim();
  if (!t) return { ok: false, error: 'Mande um texto para eu responder.' };
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
  if (!entry) return { ok: false, error: 'Nenhum agente configurado.' };
  const r = runIO().load(entry.folderId, String(runId ?? ''));
  if (!r) return { ok: false, error: 'Não encontrei essa tarefa.' };
  if (r.user !== me.toLowerCase()) return { ok: false, error: 'Essa tarefa não é sua.' };
  return runResponse(runIO(), r, Date.now(), String(approvalToken ?? ''));
}

/**
 * A resposta do usuário a um run parado: aprovar/negar uma ferramenta, responder uma pergunta, ou mandar continuar
 * depois do teto de custo. Devolve o run à fila e já tenta terminar na hora.
 */
export function runDecide(runId: string, params: Record<string, string>) {
  const me = assertOwner();
  const entry = store.listAgents()[0];
  if (!entry) return { ok: false, error: 'Nenhum agente configurado.' };
  const io = runIO();
  const r = io.load(entry.folderId, String(runId ?? ''));
  if (!r) return { ok: false, error: 'Não encontrei essa tarefa.' };
  if (r.user !== me.toLowerCase()) return { ok: false, error: 'Essa tarefa não é sua.' };
  const p = params ?? {};
  const now = Date.now();
  if (r.status === 'paused') {
    if (p.decision !== 'continue') return { ok: false, error: 'Essa tarefa está parada no teto de custo: responda se quer continuar.' };
    const next = extendBudget(r, RUN_BUDGET_USD, now);
    io.enqueue(next, now, true);
    return runResponse(io, pumpById(stepDeps(CHAT_BUDGET_MS), next.runId) ?? next, Date.now());
  }
  if (r.status !== 'waiting' || !r.pending) return { ok: false, error: 'Essa tarefa não está esperando resposta.' };
  const decision = decisionFrom(r.pending, p);
  if (!decision) return { ok: false, error: 'Resposta inválida para este pedido.' };
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
    cache.put(P3_IDLE_RESULT, JSON.stringify({ ok: pointers.length === 0, ms: Date.now() - t0, reconcileMs, drainMs, queueMs, drained, queued: pointers.length }), 21_600);
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
    if (!agent) throw new Error('nenhum agente cadastrado: cadastre um na tela antes de rodar a P22');
    const due = evaluateAgenda(dueAgenda(), {}, Date.now(), offsetMinutes(zone().offset));
    if (!due.dueList.length) throw new Error('a agenda sintética de despertar não venceu: medição inválida');
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
    console.warn(`pump do gatilho falhou: ${redactMsg(err)}`);
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
    console.warn(`entrega do Chat falhou: ${redactMsg(err)}`);
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
  const cliSecretAt = PropertiesService.getScriptProperties().getProperty('CLI_SECRET_AT');
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
  PropertiesService.getScriptProperties().deleteProperty(`ACCESS:${folderId}`); // ADR-021: sem sobra de acesso aprovado
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
  const t = runlog.begin('config', { question: `passos de ${name}: ${before ?? 'da pasta'} → ${next ?? 'da pasta'}`, agent: name });
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
    const t = runlog.begin('config', { question: `ferramenta ${tool} de ${name}: ${on ? 'ligar' : 'desligar'}`, agent: name });
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
function setTools(folder: string, set: string) {
  const folderId = folder || store.listAgents()[0]?.folderId || '';
  if (!folderId) return { ok: false, status: 400, error: 'no agent registered' };
  const pedido = set.trim();
  if (!pedido) return { ok: false, status: 400, error: 'use set=all, set=none or set=<comma-separated names>' };
  const names = pedido === 'all' ? toolCatalog().map((t) => t.name) : pedido === 'none' ? [] : pedido.split(',').map((x) => x.trim()).filter(Boolean);
  const props = PropertiesService.getScriptProperties();
  return underAccessLock(() => {
    const before = effectiveAccess(parseAccess(props.getProperty(`ACCESS:${folderId}`)));
    // reduce sobre o withTool do painel: valida nome a nome e sai na ordem canônica do registry
    const next = names.reduce<Access>((acc, n) => withTool(acc, n, true), { users: before.users, tools: [] });
    const name = agentName(folderId);
    const t = runlog.begin('config', { question: `ferramentas de ${name} pela CLI: ${before.tools.length} → ${next.tools.length}`, agent: name });
    t.step('set_tools', () => props.setProperty(`ACCESS:${folderId}`, JSON.stringify(next)), () => ({ folderId, before, after: next }));
    t.end({ answer: `ferramentas: ${next.tools.length}` });
    return { ok: true, folderId, agent: name, enabled: enabledTools(next), users: next.users };
  });
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
    const t = runlog.begin('config', { question: `acesso de ${name}: ${describeAccess(before)} → só o dono, sem ferramentas`, agent: name });
    t.step('remove_access', () => props.deleteProperty(`ACCESS:${folderId}`), () => ({ folderId, before }));
    t.end({ answer: 'acesso removido' });
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
  if (!key) throw new Error('Salve a chave do OpenRouter primeiro.');
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
  return drained ?? { n: 0, ms: 0, oldest: null };
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
  const t = runlog.begin('config', { question: `modelo de ${spec.name}: ${before ?? spec.config.model} → ${model ?? `${spec.config.model} (do AGENTS)`}`, agent: spec.name });
  t.step('set_model', () => setOverride(folderId, model ? model.trim() : null), () => ({ folderId, from: before, to: model, fromFolder: spec.config.model }));
  t.end({ answer: `modelo: ${model ?? spec.config.model}` });
  return agentModel(folderId);
}

export function usageChart(day?: string) {
  assertOwner();
  return observe.usageView(store.getApiKey(), day || undefined);
}

export function limitsPanel(fresh?: boolean) {
  assertOwner();
  return observe.limitsNow(store.getApiKey(), fresh === true);
}

// ---------- POC P1: UrlFetch com resposta longa ----------
export function pocUrlFetchTimeout() {
  assertOwner();
  const key = store.getApiKey();
  if (!key) throw new Error('Salve a chave do OpenRouter primeiro.');
  const first = store.listAgents()[0];
  const model = first ? loadAgent(first.folderId).config.model : 'openrouter/auto';
  const prompt = 'Escreva um ensaio de 6000 palavras, muito detalhado, sobre a história da computação, capítulo por capítulo.';
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
const POCS: Record<string, (step?: string, params?: Record<string, string>) => unknown> = {
  p1: () => pocUrlFetchTimeout(),
  p2: (step, params = {}) => pocP2(step, params, runIO()),
  p3: (step) => pocP3(step),
  p4: (step) => pocP4(step),
  p19: (step) => pocP19(step),
  p20: (step) => pocP20(step),
  p22: (step, params = {}) => pocP22(step, params),
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
    if (!first) throw new Error('P14 real: cadastre um agente na tela');
    const r = testAgent(first.folderId, params.q || 'Responda em uma frase curta: o que você faz?');
    const run = runlog.runDetail(r.runId).run;
    return { poc: 'P14', step, pass: true, runId: r.runId, spans: run?.spans.map((s) => s.name) ?? [], coverage: run ? coverage(run) : 0, ms: run?.ms, model: run?.model, tokens: run?.tokens, cost: run?.cost };
  },
};

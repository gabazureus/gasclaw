import { judgeFor, namesOf, scenarioMd, SCENARIOS } from './judgeSet';
import { parseScenario } from './eval';
import { cluster, failProp, failuresFrom, hasMaterial, parseFailures, serializeFailures, withFailure, type Failure } from './failureLog';
import { mergeAcrossGenerations, originLabel, parseSchema, validateValues, type ConfigField } from './agentConfig';
import { AUTO_NOTE, cleanAutoList, mayAutoApprove, NEVER_AUTO, noReplySpan, onProactiveBlock } from './autoApprove';
import { dueJobs, JOB_MAX, jobText, parseSchedule, serializeSchedule } from './schedule';
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
import { chatAppAvailable, createAsChatApp, ownerDmAsChatApp, spacesAsChatApp } from './chatApiGas';
import { acceptChatMessage } from './chatAsync';
import { authorizedDelivery, deliveryDue, deliveryGivenUp, newChatDelivery, sendChatDelivery, stableRequestId } from './chatDelivery';
import { pocP6 } from '../poc/p6-docs-nativos/harness';
import { CHAT_BUDGET_MS, DEFAULT_STEPS, MAX_HISTORY, reply, runTurn } from './agent';
import { foreignMessage, parseSubagent, personaTools, subagentGrants, subagentSpan, subagentTools } from './subagent';
import type { AgentSpec } from './workspace';
import { personaIO } from './tools/personaStore';
import { approvalCard, decisionFrom, escapeCard, issue, issueGrant } from './approval';
import { cacheTickets, decideChatApproval, decideScreenApproval, durableTickets, hashToken, newToken } from './approvalStore';
import { chatTurn, handleChat, type ChatDeps, type ChatEvent, type ChatReply } from './chat';
import { withChatFormatRules } from './chatFormat';
import { afterStep, budgetNotice, charge, extendBudget, isFinished, markInflight, newRun, resumeOf, RUN_BUDGET_USD, view, WAIT_TTL_MS, waitKey, waitLabel, withDecision, type DurableRun, type OrphanWait } from './run';
import { asEnv, engineLinks, panelList } from './panels';
import { pump, pumpById, type StepDeps } from './runner';
import { runIO, type RunIO } from './runStore';
import { flushMemory } from './tools/memoryFlush';
import { cliAuthorized, MUTATING, validSecret } from './cli';
import { evalAction, judgeRun, parseRunSpec, runSpec, toRunSpec, type EvalEnv, type RunTrace } from './evalEntry';
import { pocP11 } from '../poc/p11-free/harness';
import { pocP18 } from '../poc/p18-sessoes/harness';
import { sessionMessages } from './session';
import { compactSession, toSession } from './sessionCompact';
import { sessionIO } from './sessionStore';
import { bootstrapIO } from './tools/bootstrapStore';
import { skillsIO } from './tools/skillsStore';
import { isFree } from './freeModels';
import { runFree } from './freeRun';
import { complete, type Completion, type EmptyCompletionError, type Message, type Reasoning, type ToolDef } from './llm';
import { gasGoogle, zone } from './tools/googleHttp';
import { offsetMinutes } from './agenda';
import { folderModel, getOverride, listModels as openRouterModels, type ModelInfo, setOverride, validateChoice } from './models';
import * as observe from './observe';
import * as runlog from './runlog';
import { CAPABILITIES, can, accessAfterArchive, capsEnabled, effectiveCapabilities, forgetAgentProps, isRunnable, parseCapabilities, parseStatus, type Capability } from './agentCaps';
import { engineIdentity } from './identity';
import * as store from './store';
import { memoryIO } from './tools/memoryStore';
import { allowedTools, findTool, toolCatalog } from './tools/registry';
import { coverage, llmCost, redact } from './trace';
import { agentInfo, llmInfo, traceDeps } from './traced';
import { webClick, webSend, webSpace } from './webchat';
import { agentRoles, saveRole, agentFolderPath, canUse, effectiveAccess, enabledTools, ensureFolderPath, extractFolderId, loadAgent, parseAccess, parseSteps, pendingSuggestions, seedAgent, validAgentName, withAccess, withTool, withUser, type Access, type LoadedAgent } from './workspace';

const CHAT_MAX_TOKENS = 1000; // resposta síncrona precisa caber em 30 s
/**
 * A RESERVA DA RESPOSTA num turno de agente (F8 · G). Num modelo que raciocina, o pensamento sai do MESMO
 * `max_tokens`: sem teto para ele, o `e1-memoria` voltava vazio nos dois motores (`finish_reason: length,
 * content: null`). 600 para pensar deixa 400 para a resposta ou a chamada de ferramenta. Modelo que não
 * raciocina ignora o parâmetro.
 */
const TURN_REASONING: Reasoning = { max_tokens: 600 };

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
          t.step('llm_call', () => complete(store.getApiKey() ?? '', m, messages, 1000, undefined, tools, undefined, TURN_REASONING), llmInfo(m, messages), true),
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
  // F10: o MODELO do agente pela CLI, mesma autoridade do painel (o dono, provado pelo segredo; ADR-021/022).
  // Sem isto, "um modelo só" dependia de clique — e depois do setup nada deve depender de operação manual.
  if (action === 'model') return setAgentModel(p.folder || (defaultAgent()?.folderId ?? ''), p.model ?? null);
  // A CORRIDA DO ENXAME PELA CLI (F6). Mesma autoridade do painel — o dono, provado pelo segredo —
  // por outra porta, como já vale para `tools` (ADR-021/022). Sem isto, conduzir uma corrida de 24 h
  // exigiria o dono clicando em cada geração, e o pedido era acompanhar, não operar.
  // `capability` entra aqui pelo MESMO argumento que `tools` (ADR-021/022): o segredo prova o dono, e
  // é o dono que decide. A guarda continua inteira — `setAgentCapability` mantém `assertOwner`, o
  // nome válido, o `missing`, o lock e o trace. O que muda é a porta, não quem pode abrir.
  // SEM PASTA DECLARADA, O AGENTE PADRÃO. A CLI lia `SWARM_FOLDER` e os comandos do README não a
  // mencionavam: quem copiou o comando recebeu "unknown agent". Eu testei a CLI só do jeito que eu a
  // uso — com a variável exportada. Com um agente só, que é o caso comum, pedir o id era pedir o óbvio.
  const pasta = p.folder || defaultAgent()?.folderId || '';
  if (action === 'capability') return setAgentCapability(pasta, p.cap ?? '', p.on === '1');
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
    // A ROTA `childkey` FOI REMOVIDA (2026-09-20, ADR-040 opção 4). Ela era o único ponto do projeto
    // que devolvia a chave do OpenRouter por HTTP. A P27 mediu que o filho não consegue alcançá-la —
    // o Google recusa o token de outro projeto antes de chegar aqui —, então ela não servia a ninguém
    // além de quem já é o dono, e continuava sendo a porta que se abriria sozinha no dia em que o
    // `access` do manifesto mudasse. Filhos agora são só `automation`, que nunca precisam de chave.
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
    // E o MOTOR entra no título também: o id curto distingue dev de prod para o mesmo agente.
    const quem = engineIdentity(ScriptApp.getScriptId(), defaultAgent()?.name);
    const title = (s: string) => `${s} · ${panelEnv()} · ${quem.agent} · ${quem.engine}`;
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
  const tools = personaTools(allowedTools(nomes));
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
      llm: (m: Message[], defs: ToolDef[]) => complete(key, spec.config.model, m, 1000, undefined, defs, undefined, TURN_REASONING),
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

/**
 * Manda uma mensagem a OUTRO agente do mesmo dono (itens 16 e 32, ADR-040 §A).
 *
 * Esta função não podia existir antes do item 31: a ADR-040 §A diz que os quatro controles são
 * **pré-requisito de qualquer linha de `message`**, e o quarto deles (`tools(A) ∩ tools(B)`) morava
 * num módulo órfão até a auditoria de 2026-09-20. A ordem importa — a defesa antes do mecanismo.
 *
 * O que ela NÃO faz: devolver a resposta de B. O run de B é próprio, durável e assíncrono; fingir uma
 * resposta síncrona significaria segurar o turno de A esperando, e é assim que um agente trava o outro.
 */
/**
 * As ferramentas aprovadas do agente que ORIGINOU o repasse, pelo nome.
 *
 * Devolve lista VAZIA quando o agente não existe mais — e vazia é o lado seguro: o run repassado fica
 * sem nenhuma ferramenta em vez de ficar com todas as do destinatário. Um agente apagado não deve
 * poder ampliar poder justamente por ter sumido.
 */
function toolsOfAgent(name: string): string[] {
  const a = store.listAgents().find((x) => x.name.toLowerCase() === String(name ?? '').toLowerCase());
  if (!a) return [];
  try {
    return withAccess(loadAgent(a.folderId), approvedOf(a.folderId)).access.tools;
  } catch {
    return []; // pasta ilegível: sem ferramenta, nunca com todas
  }
}

/**
 * Nasce um AGENTE novo: pasta própria no Drive, papel escrito, e NADA MAIS.
 *
 * Sem ferramenta, sem acesso, sem capacidade — `effectiveAccess(null)` já fecha tudo por padrão, e é
 * o dono quem abre no painel, uma a uma. A squad é feita de EXECUTORES, não de criadores: um agente
 * criado com a capacidade `create` faria a multiplicação virar cadeia, e uma cadeia não tem fundo.
 *
 * O singleton do criador também protege isto por forma do dado: `CREATOR` é UMA Property com UM
 * folderId, então não existe estado com dois criadores.
 */
/** Porta de teste: `bornAgent` recebe um `AgentSpec` inteiro e o teste só precisa de nome e pasta. */
export const __test_relay = (nome: string, folderId: string, to: string, text: string): string =>
  relayToAgent({ name: nome, folderId } as AgentSpec, to, text);

function relayToAgent(from: AgentSpec, to: string, text: string): string {
  const me = ownerEmail();
  const alvo = store.listAgents().find((a) => a.name.toLowerCase() === to);
  if (!alvo) throw new Error(`there is no agent named "${to}"`);
  if (alvo.folderId === from.folderId) throw new Error('an agent cannot message itself');
  // Arquivado não recebe: um run para quem saiu de cena gastaria e nunca seria lido (ADR-038 §F).
  if (parseStatus(PropertiesService.getScriptProperties().getProperty(`STATUS:${alvo.folderId}`)) !== 'active') {
    throw new Error(`the agent "${to}" is archived`);
  }

  const now = Date.now();
  const r = newRun({
    runId: `relay-${now}-${Utilities.getUuid().slice(0, 8)}`,
    session: `${alvo.folderId}:relay/${from.name}`,
    folderId: alvo.folderId,
    user: me,
    // A mensagem entra como DADO com procedência declarada. O motor não censura o conteúdo: a defesa
    // real é a aprovação da tool no lado de B, provada pelo eval `e6-injecao` — mesmo com o modelo
    // enganado, `gmail.send` para no card e não sai.
    text: foreignMessage(from.name, text),
    now,
    // `ownerDm: false` fecha a memória: um agente não escreve na memória do dono em nome de outro.
    ownerDm: false,
    originAgent: from.name,
  });
  runIO().enqueue(r, now);
  return `sent to ${to}. It answers in its own run (${r.runId}); you will not see the answer in this turn.`;
}

/**
 * Porta de teste para o `chatDeps` de PRODUÇÃO.
 *
 * Existe porque todos os testes do caminho de conversa injetam o próprio `ChatDeps` — então nenhum
 * deles enxergava o objeto real, que era justamente onde o defeito estava (o `defaultAgent` pegando o
 * primeiro da lista, arquivado ou não). Um mock que substitui a coisa testada não a testa.
 */
export const __test_chatDeps = (): ChatDeps => chatDeps();

function chatDeps(): ChatDeps {
  return {
    enabled: store.isEnabled,
    owner: ownerEmail,
    apiKey: store.getApiKey,
    // `chatDeps` alimenta os TRÊS caminhos de conversa — Chat síncrono, assíncrono e a tela. Enquanto
    // esta linha pegava o primeiro da lista, o antecessor ARQUIVADO continuava sendo com quem o dono
    // falava. Duas mensagens de commit minhas já disseram que isso estava consertado antes de estar.
    defaultAgent,
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
      const call = (id: string) => complete(key, id, messages, CHAT_MAX_TOKENS, undefined, tools, undefined, TURN_REASONING);
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
        relay: (to: string, text: string) => relayToAgent(spec, to, text),
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

/** Recusa de `io.resume` que significa "esta espera já passou" (o cartão só perde os botões). Um run que já
 * acabou também cai aqui: `apply` o recusa antes da assinatura, que ele não tem mais. */
const GONE = 'gone';

/**
 * O TRABALHO É DO GATILHO quando o run tem entrega do Chat (incidente de 2026-09-22, ao vivo).
 *
 * Retomar o turno aqui gastava a janela de 30 s que o Chat dá a um clique: o turno (modelo + ferramenta)
 * não cabe, a execução morria, e o Chat mostrava "gasclaw não processou sua solicitação" em vermelho —
 * com o gatilho pegando o MESMO run em paralelo e os dois sendo interrompidos, um no meio de uma chamada
 * paga. A decisão já deixou o run `queued` com ponteiro na fila: o worker de 1 minuto continua dali.
 *
 * O run SEM entrega (tela, caminho síncrono) segue retomando na hora: ali quem espera é uma página aberta.
 */
const triggerDoesTheWork = (r: DurableRun): DurableRun => (r.delivery ? r : pumpById(stepDeps(CHAT_BUDGET_MS), r.runId) ?? r);

/** Clique de aprovação do Chat: ator vem do evento autenticado, nunca dos parâmetros do card. */
function durableChatClick(e: ChatEvent): ChatReply {
  const p = e.common?.parameters ?? {};
  const io = runIO();
  let done: DurableRun;
  let ack: string;
  if (p.decision === 'continue' || p.answer !== undefined) {
    // Teto de custo e pergunta do `ask`: só quem pediu o run, só na espera que criou o botão, e sob a trava
    // com o arquivo conferido (`io.resume`) — a mesma regra da tela.
    const carryOn = p.decision === 'continue';
    const out = io.resume(String(p.folderId ?? ''), String(p.runId ?? ''), (r) => {
      const inThatWait = carryOn ? r.status === 'paused' : r.status === 'waiting' && r.pending?.kind === 'ask';
      // `wait` prende o botão à espera que o criou: o botão de uma pergunta antiga não responde a pergunta nova.
      if (!inThatWait || p.wait !== waitKey(r)) return GONE;
      if (r.user !== e.user.email.toLowerCase()) return 'that task is not yours';
      if (carryOn) return extendBudget(r, RUN_BUDGET_USD, Date.now());
      const decision = decisionFrom(r.pending!, { answer: String(p.answer) });
      return decision ? withDecision(r, decision, Date.now()) : 'that is not a valid answer';
    }, Date.now());
    if ('error' in out) {
      if (out.error === GONE || out.error === 'I could not find that task') return updateCard({ text: carryOn ? 'This task is no longer paused.' : 'This question was already answered.', cardsV2: [] });
      return { text: `Cannot answer this: ${out.error}.` }; // mantém o card de outra pessoa intacto
    }
    if (!carryOn) setOpenAsks(out.session, openAsks(out.session).filter((id) => id !== out.runId)); // pergunta respondida
    done = triggerDoesTheWork(out);
    ack = carryOn ? 'Cost limit raised. I am carrying on with the task.' : `Answer recorded: ${String(p.answer).replace(/[<>]/g, '').slice(0, 200)}. I am carrying on with the task.`;
  } else {
    const replacement = newToken();
    const out = decideChatApproval(io, p, e.user.email, replacement, Date.now());
    if (out.kind === 'rejected') return { text: `Cannot answer this: ${out.error}.` }; // mantém o card de outra pessoa intacto
    if (out.kind === 'refreshed') return updateCard(approvalCard({ token: replacement, pending: out.run.pending!, folderId: out.run.folderId, runId: out.run.runId }, out.run.answer ?? 'This action still needs your approval.'));
    done = triggerDoesTheWork(out.run);
    ack = p.decision === 'approve' ? 'Approved. I am carrying on with the task.' : 'Denied. I am carrying on without it.';
  }
  if (done.delivery) {
    // Run do caminho assíncrono: o clique SÓ registrou a decisão; quem retoma é o gatilho, e o que vier
    // depois (a resposta final OU o cartão da próxima espera) sai como mensagem nova no espaço, com recibo.
    return updateCard({ text: ack, cardsV2: [] });
  }
  // Aprovação legada (caminho síncrono, sem entrega): o próprio cartão mostra o que vem depois.
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
  return updateCard({ text: done.answer ?? (done.status === 'failed' ? `I could not finish: ${done.error ?? 'unknown error'}` : 'Approval recorded; I will carry on with the task.'), cardsV2: [] });
}

export function onMessage(e: ChatEvent) {
  const typed = (e.message?.argumentText ?? e.message?.text ?? '').trim().toLowerCase();
  if (isDev() && e.type === 'MESSAGE' && typed === '/poc p2') {
    if (e.user.email.toLowerCase() !== ownerEmail()) return { text: 'POC P2 can only be started by the gasclaw owner.' };
    startP2Event(e.space.name, undefined, runIO()); // sem thread: tudo no fluxo do espaco
    return {}; // `pensando...` ja foi criado como o app e confirmado por message.name na POC
  }
  // P35 (só no dev, só LÊ): com que identidade este onMessage roda, e se ela alcança o sucessor coroado.
  // É a pergunta que decide se o Chat pode seguir o motor coroado sem passo manual no console.
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
      answerOpenAsk,
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
      // ADR-040 §A, CONTROLE (d): um run repassado recebe no máximo `tools(A) ∩ tools(B)`. Sem isto,
      // texto na pasta COMPARTILHÁVEL de A faria B usar as ferramentas de B — a união das ferramentas
      // de todos os agentes, com a autoridade do dono. A interseção é o que torna a composição segura.
      const tools = r.originAgent ? allowedTools(subagentTools(toolsOfAgent(r.originAgent), spec.access.tools)) : base.tools;
      const kit = { ...base, tools, ctx: { ...base.ctx, isOwner, originAgent: r.originAgent, google: isOwner ? base.ctx.google : undefined } };
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
        // ITEM 25/28 — AUTO-APROVAÇÃO E FALHA HONESTA, o que faltava fiar do `autoApprove.ts`.
        //
        // Um run PROATIVO que esbarra num card não tem direito de perguntar: ninguém pediu este run, e
        // ficar `waiting` o deixaria pendurado esperando um clique que nunca vem, segurando lease e
        // sumindo do radar — para quem olha o painel, um run esperando é indistinguível de um run
        // trabalhando. Ou a ferramenta está na LISTA que o dono aprovou, e segue; ou ele FALHA e registra.
        // `ask` TAMBÉM pendura, e a falha honesta não o cobria. `ask` tem `approval: 'never'` e produz
        // `pending.kind === 'ask'`, então nunca entrava no bloco abaixo: o run proativo ficava
        // `waiting` esperando uma resposta que ninguém vai dar, segurando lease e sumindo do radar —
        // exatamente o cenário que `onProactiveBlock` foi escrito para impedir, e que o docstring dele
        // descreve palavra por palavra. Perguntar é o que um run que ninguém pediu não pode fazer.
        if (r.proactive && turn.pending?.kind === 'ask') {
          throw new Error(`stopped: this run wanted to ask you something, and nobody asked for this run`);
        }
        if (r.proactive && turn.pending?.kind === 'approval') {
          const lista = autoListOf(r.folderId);
          // O NÍVEL da tool vai junto: `always` não se auto-aprova, esteja o que estiver na lista.
          const nivel = findTool(kit.tools, turn.pending.name)?.approval;
          const v = mayAutoApprove(turn.pending.name, lista, true, nivel);
          const bloqueio = onProactiveBlock(turn.pending.name, true);
          if (!v.auto && bloqueio.status === 'failed') throw new Error(`${bloqueio.reason} (${v.reason})`);
          // Na lista: segue o passo com a decisão já tomada, pelo MESMO caminho de retomada que o
          // clique do dono usaria. Um atalho aqui seria um segundo caminho de aprovação para manter.
          const segue = chatTurn({
            spec, kit, text: r.text, history: d.history(r.session), ownerDm, runId: r.runId, budgetMs, llm,
            resume: { ...turn.state!, decision: { approved: true } },
            done: turn.done, granted: turn.granted,
            beforeEffect: (name) => io.save(markInflight(r, name, Date.now())),
          }).turn;
          // REAVALIA o que veio depois da auto-aprovação. Sem isto, a falha honesta valia só para a
          // PRIMEIRA pendência do passo: se o turno seguinte pedisse outra aprovação, o run proativo
          // voltava a ficar pendurado para sempre — o mesmo defeito, uma volta adiante.
          if (segue.pending) throw new Error(onProactiveBlock(segue.pending.name, true).status === 'failed' ? `stopped: ${segue.pending.name} still needs approval after the auto-approved step, and nobody asked for this run` : 'stopped');
          countTurnFailures(r.folderId, segue);
          t.mark('reply');
          return { turn: segue, usd: t.end({ answer: segue.text }).cost ?? 0 };
        }
        if (!turn.pending) countTurnFailures(r.folderId, turn);
        t.mark('reply');
        // O trace diz a verdade (incidente de 2026-09-21): um passo que parou esperando o dono NÃO é "ok".
        // Quem decide se parou é o mesmo `afterStep` que o runner vai aplicar, com o custo deste passo.
        const depois = afterStep(charge(r, llmCost(t.run)), turn, Date.now());
        return { turn, usd: t.end({ answer: turn.text, waiting: waitLabel(depois) }).cost ?? 0 };
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
  // CONFERE ANTES DE RE-ASSINAR (revisão de 2026-09-20, o buraco mais grave dos três ciclos).
  //
  // `io.save` recalcula a assinatura a partir do objeto que recebe. Emitir credencial aqui sem
  // conferir fazia do motor um ORÁCULO DE ASSINATURA: quem tem escrita na pasta compartilhável
  // editava o arquivo do run — trocava o destinatário do `gmail.send`, ou apagava `originAgent` para
  // `isOwner` virar verdadeiro —, o dono apenas ABRIA O PAINEL (nem precisava clicar), e o estado
  // forjado saía assinado. Depois disso `decide` conferia a integridade e PASSAVA, porque a
  // assinatura já era a do atacante. A defesa anti-adulteração virava teatro: conferia um selo que o
  // próprio motor tinha acabado de carimbar sobre o que o atacante escreveu.
  if (!io.untampered(r)) return { run: r };
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
  const entry = defaultAgent();
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
  const entry = defaultAgent();
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
  const entry = defaultAgent();
  if (!entry) return { ok: false, error: 'No agent set up yet.' };
  const io = runIO();
  const r = io.load(entry.folderId, String(runId ?? ''));
  if (!r) return { ok: false, error: 'I could not find that task.' };
  if (r.user !== me.toLowerCase()) return { ok: false, error: 'That task is not yours.' };
  const p = params ?? {};
  const now = Date.now();
  if (r.status === 'paused') {
    if (p.decision !== 'continue') return { ok: false, error: 'That task is paused at the cost limit: tell me whether to carry on.' };
    // Sob a trava e com o arquivo conferido: `enqueue` re-assina, e gravar sem conferir adotava um arquivo
    // editado na pasta (o oráculo de assinatura que o `screenApproval` documenta; auditoria de 2026-09-22).
    const next = io.resume(r.folderId, r.runId, (x) => (x.status === 'paused' ? extendBudget(x, RUN_BUDGET_USD, now) : 'That task is no longer paused.'), now);
    if ('error' in next) return { ok: false, error: next.error };
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
  const next = io.resume(r.folderId, r.runId, (x) => (x.status === 'waiting' && x.pending?.key === r.pending!.key ? withDecision(x, decision, now) : 'That task is not waiting for this answer.'), now);
  if ('error' in next) return { ok: false, error: next.error };
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
  const io = runIO();
  // A mesma entrega do gatilho: sem ela, um `step` manual girava uma espera do Chat até esgotar sem cartão.
  const touched = pump(stepDeps(STEP_BUDGET_MS, io), PUMP_MAX_STEPS, Date.now() + PUMP_BUDGET_MS, (run) => deliverIfDue(run, io));
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
    const scan = runIO().scan(Date.now()); // a mesma leitura do tique real: fila + esperas
    const pointers = scan.pointers;
    if (!pointers.length) workRuns(scan);
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
    const scan = runIO().scan(Date.now());
    if (!scan.pointers.length) workRuns(scan);
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
function workRuns(scan?: ReturnType<RunIO['scan']>): void {
  try {
    const io = runIO();
    const { pointers, orphans, expired } = scan ?? io.scan(Date.now());
    if (expired.length) expireWaits(expired, io);
    if (orphans.length) recoverWaits(orphans, io);
    if (!pointers.length && !orphans.length && !expired.length) return;
    // A entrega acontece assim que CADA run fica pronto, dentro do laco do pump. Antes ela esperava o pump
    // inteiro terminar (ate 20 runs / 240 s), entao uma resposta pronta em 36 s so saia minutos depois,
    // refem do trabalho dos outros runs — o usuario lia isso como "travado no pensando...".
    pump(stepDeps(STEP_BUDGET_MS, io), PUMP_MAX_STEPS, Date.now() + PUMP_BUDGET_MS, (run) => deliverIfDue(run, io));
  } catch (err) {
    console.warn(`trigger pump failed: ${redactMsg(err)}`);
  }
}

/**
 * O run do Chat PAROU esperando o dono (incidente de 2026-09-21): manda ao espaço o cartão que o destrava —
 * aprovação, pergunta do `ask` ou o aviso do teto de custo. Sem isto a entrega só via `done`/`failed` e o Chat
 * ficava no "thinking…" para sempre; o clique (`durableChatClick`) já existia, ninguém postava o cartão.
 *
 * Uma vez por espera, e a marca mora FORA da pasta (`prompted` na autoridade). O POST é IDEMPOTENTE: o
 * `requestId` é derivado da espera (e, na aprovação, da credencial), então repetir depois de uma falha —
 * inclusive uma falha DEPOIS do POST, ao gravar a marca — devolve a mesma mensagem em vez de criar outra.
 * O destino é o da autoridade, nunca o do arquivo. Nada é gravado sem conferir a assinatura antes.
 */
function promptInChat(run: DurableRun, io: RunIO): void {
  const wait = waitKey(run);
  const authority = io.authority(run.runId);
  if (!wait || authority?.prompted === wait) return;
  const target = authorizedDelivery(run.delivery, authority);
  if (!target.ok) {
    // Destino divergente ou sem registro não é falha passageira: desiste já, com o motivo, como a entrega final.
    if (io.untampered(run)) io.save(deliveryGivenUp(run, `Chat card refused: ${target.reason}`, Date.now()));
    io.dequeue(run.runId);
    return;
  }
  // SEGUNDA porta. A primeira é o claim (`runner.ts`, `c.tampered`), que chega antes e é mais forte: recusa o
  // run inteiro. Esta fica porque `promptInChat` não é obrigada a ser chamada só de lá — e porque o passo
  // seguinte GRAVA o run (`approvalToken` → `io.save`), e gravar RE-ASSINA: um arquivo adulterado viraria
  // legítimo. Apagá-la não quebra teste nenhum (a primeira porta mata os mutantes); é decisão, não descuido.
  if (!io.untampered(run)) throw new Error('Chat card refused: the task file was changed outside gasclaw');
  const lease = io.leaseOf(run.runId); // o ponteiro do claim que trouxe o run até aqui
  const now = Date.now();
  let message: { text: string; cardsV2: unknown[] };
  let seed = `${run.runId}|${wait}`;
  if (run.status === 'waiting' && run.pending?.kind === 'approval') {
    const card = approvalToken(io, run, now);
    seed += `|${card.issuedAt}`; // credencial nova = mensagem nova; a mesma credencial = a mesma mensagem
    message = approvalCard({ token: card.token, pending: run.pending, folderId: run.folderId, runId: run.runId }, run.answer ?? 'This action needs your approval.');
  } else if (run.status === 'waiting' && run.pending?.kind === 'ask') {
    const earlier = openAsks(run.session).filter((id) => id !== run.runId);
    const note = earlier.length ? '\n\nAnother question of mine is still open in this chat: your next typed message answers that one first.' : '';
    message = approvalCard({ token: '', pending: run.pending, folderId: run.folderId, runId: run.runId }, (run.answer ?? 'I need an answer.') + note, wait);
  } else {
    message = continueCard(run);
  }
  // Se o POST (ou qualquer passo aqui) falhar, o ponteiro segue arrendado pelo claim (`settle`): nenhuma outra
  // execução posta junto, e a próxima tentativa vem quando o arrendamento vencer.
  const receipt = createAsChatApp({ space: target.space, ...(target.thread ? { thread: target.thread } : {}), requestId: stableRequestId(hashToken(seed)), message });
  io.markPrompted(run.runId, wait, now, receipt.name);
  io.release(run.runId, lease); // só apaga o ponteiro se ainda for o do claim: um clique no meio já o regravou
  // A pergunta entra na FILA de perguntas digitáveis desta conversa (a mais antiga responde primeiro).
  if (run.pending?.kind === 'ask' && run.status === 'waiting') {
    const list = openAsks(run.session);
    if (!list.includes(run.runId)) setOpenAsks(run.session, [...list, run.runId]);
  }
}

/**
 * O token do cartão de aprovação. Reaproveita o da última tentativa quando a credencial gravada ainda é a
 * dele (o cache é atalho: o hash no run decide), para o POST repetido ser o MESMO cartão. Senão emite uma
 * credencial nova — gravada antes do POST, para o clique achá-la.
 */
function approvalToken(io: RunIO, run: DurableRun, now: number): { token: string; issuedAt: number } {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(`cardtok:${run.runId}`);
  const g = run.approval;
  if (cached && g && g.pendingKey === run.pending!.key && now >= g.issuedAt && now < g.expiresAt && hashToken(cached) === g.tokenHash) return { token: cached, issuedAt: g.issuedAt };
  const token = newToken();
  const grant = issueGrant(run.pending!, run.user, hashToken(token), now);
  io.save({ ...run, approval: grant, updatedAt: now });
  cache.put(`cardtok:${run.runId}`, token, 21_600);
  return { token, issuedAt: grant.issuedAt };
}

/**
 * A mensagem DIGITADA responde a pergunta aberta desta conversa (a mesma regra do caminho síncrono, agora no
 * run durável). Com mais de uma aberta, responde a MAIS ANTIGA — e o cartão das seguintes avisa isso. Só vale
 * para quem pediu o run, só enquanto ele espera aquele `ask`, e sob `io.resume` (trava + assinatura).
 */
function answerOpenAsk(session: string, user: string, text: string, messageName?: string): boolean {
  const cache = CacheService.getScriptCache();
  if (messageName && cache.get(`askans:${messageName}`)) return true; // o Chat reentregou a mesma resposta
  const list = openAsks(session);
  const keep = [...list];
  let answered = false;
  for (const runId of list) {
    const out = runIO().resume(session.slice(0, session.indexOf(':')), runId, (r) => {
      if (r.session !== session || r.status !== 'waiting' || r.pending?.kind !== 'ask') return GONE;
      if (r.user !== user.toLowerCase()) return 'not yours'; // outra pessoa no espaço: não é dela
      const decision = decisionFrom(r.pending, { answer: text });
      return decision ? withDecision(r, decision, Date.now()) : 'invalid';
    }, Date.now());
    if (!('error' in out)) {
      keep.splice(keep.indexOf(runId), 1);
      answered = true;
      break;
    }
    if (out.error === GONE || out.error === 'I could not find that task') keep.splice(keep.indexOf(runId), 1); // já respondida
    else if (out.error !== 'not yours') break; // resposta inválida ou trava ocupada: vira mensagem comum
  }
  if (keep.length !== list.length) setOpenAsks(session, keep);
  if (answered && messageName) cache.put(`askans:${messageName}`, '1', 600);
  return answered;
}

/** As perguntas digitáveis abertas numa conversa do Chat, da mais antiga à mais nova. */
const openAskKey = (session: string) => `ASKRUN:${session}`;
function openAsks(session: string): string[] {
  const raw = PropertiesService.getScriptProperties().getProperty(openAskKey(session));
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [String(v)];
  } catch {
    return [raw]; // formato da primeira versão: um runId só
  }
}
function setOpenAsks(session: string, list: string[]): void {
  const props = PropertiesService.getScriptProperties();
  if (list.length) props.setProperty(openAskKey(session), JSON.stringify(list));
  else props.deleteProperty(openAskKey(session));
}

/** O aviso do teto com o botão Continue. O clique chega a `durableChatClick`, que confere quem clicou. */
function continueCard(run: DurableRun): { text: string; cardsV2: unknown[] } {
  const text = escapeCard(run.answer ?? budgetNotice(run));
  const parameters = [{ key: 'folderId', value: run.folderId }, { key: 'runId', value: run.runId }, { key: 'wait', value: waitKey(run) ?? '' }, { key: 'decision', value: 'continue' }];
  return { text: 'The task reached its cost limit.', cardsV2: [{ cardId: 'budget', card: { header: { title: 'Cost limit reached' }, sections: [{ widgets: [{ textParagraph: { text } }, { buttonList: { buttons: [{ text: 'Continue', onClick: { action: { function: 'onCardClick', parameters } } }] } }] }] } }] };
}

/**
 * Acha o run de uma autoridade sem ponteiro. Pasta por pasta (nas antigas, sem `folderId`, entre os agentes
 * cadastrados), parando na primeira que o tem: uma pasta apagada de outro agente não esconde o run. Pasta
 * que falha tem três tiques de chance; depois `gone` — senão o tique abriria o Drive para sempre por ela.
 */
function findWaitRun(o: OrphanWait, io: RunIO): DurableRun | 'retry' | 'gone' {
  let failed = false;
  for (const f of o.folderId ? [o.folderId] : store.listAgents().map((a) => a.folderId)) {
    try {
      const run = io.load(f, o.runId);
      if (run?.runId === o.runId) return run;
    } catch {
      failed = true;
    }
  }
  if (!failed) return 'gone';
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(`waitscan:${o.runId}`) ?? 0) + 1;
  if (n >= 3) return 'gone';
  cache.put(`waitscan:${o.runId}`, String(n), 21_600);
  return 'retry';
}

/**
 * Esperas do Chat que ficaram sem cartão e FORA da fila — os runs parados antes do ADR-047 (o de 2026-09-21 é
 * um deles). A lista vem da mesma leitura de Properties que o tique já fazia; o Drive só abre para as poucas
 * que aparecerem, e cada uma é tratada UMA vez: volta à fila (e o pump posta o cartão) ou fica marcada.
 * No máximo 3 por tique, para um lote antigo não comer o tique do dono.
 */
function recoverWaits(orphans: OrphanWait[], io: RunIO): void {
  for (const o of orphans.slice(0, 3)) {
    try {
      const run = findWaitRun(o, io);
      if (run === 'retry') continue;
      if (run !== 'gone' && isFinished(run) && io.untampered(run)) io.forget(o.runId); // entrega desistida que deixou a autoridade para trás
      else if (run !== 'gone' && waitKey(run) && run.delivery?.status === 'pending' && io.untampered(run)) io.enqueue(run, Date.now()); // conferido antes: `enqueue` re-assina
      else io.markPrompted(o.runId, 'handled', Date.now()); // não há cartão a mandar (ou o arquivo não confere): não olha de novo
    } catch (err) {
      console.warn(`wait recovery failed: ${redactMsg(err)}`); // Properties cheias ou fora: tenta no próximo tique
    }
  }
}

/** O que o dono lê quando uma espera expira. */
const WAIT_EXPIRED = `I waited ${WAIT_TTL_MS / 86_400_000} days for your answer and stopped this task. Ask me again if you still need it.`;

/**
 * Esperas paradas há mais que `WAIT_TTL_MS` (ADR-047): o run vira `failed` com o motivo e a autoridade sai das
 * Script Properties. Veio do Chat: o motivo é ENTREGUE lá (o run volta à fila só para isso, e a entrega
 * esquece a autoridade). Da tela: grava e esquece. Arquivo adulterado ou sumido: só esquece — sem a
 * autoridade, nada mais nele pode ser aprovado. No máximo 3 por tique, pelo mesmo motivo da varredura.
 */
function expireWaits(expired: OrphanWait[], io: RunIO): void {
  for (const o of expired.slice(0, 3)) {
    try {
      const run = findWaitRun(o, io);
      if (run === 'retry') continue;
      if (run === 'gone' || !waitKey(run) || !io.untampered(run)) {
        io.forget(o.runId);
        continue;
      }
      const now = Date.now();
      const failed: DurableRun = { ...run, status: 'failed', answer: WAIT_EXPIRED, error: 'expired waiting for the owner', approval: undefined, updatedAt: now };
      if (failed.delivery?.status === 'pending' && io.authority(o.runId)?.space) io.enqueue(failed, now);
      else {
        io.save(failed);
        io.forget(o.runId);
      }
    } catch (err) {
      console.warn(`wait expiry failed: ${redactMsg(err)}`);
    }
  }
}

/** Entrega um run terminal cuja hora chegou. Falha de entrega nunca derruba o pump: o run volta para a fila. */
function deliverIfDue(run: DurableRun, io: RunIO): void {
  if (!run.delivery || run.delivery.status !== 'pending') return;
  if (run.status === 'waiting' || run.status === 'paused') {
    try {
      promptInChat(run, io);
    } catch (err) {
      console.warn(`Chat prompt failed: ${redactMsg(err)}`); // o run ficou na fila: o próximo claim tenta de novo
    }
    return;
  }
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
  // QUAL MOTOR É ESTE (pedido do dono, 2026-09-21): dev e prod servem o MESMO agente, e os dois
  // painéis eram idênticos. O nome do agente é igual nos dois; o que diferencia é o motor.
  return { me, enabled: store.isEnabled(), hasKey: !!store.getApiKey(), agents: store.listAgents(), appUrl: appUrl(), scriptUrl: scriptUrl(), env: panelEnv(), cliSecretAt, auth: authStatus(), identity: engineIdentity(ScriptApp.getScriptId(), defaultAgent()?.name) };
}

/** P21: ambiente já normalizado (desconhecido conta como prod), para o rótulo do cabeçalho. */
const panelEnv = () => asEnv(envName());

/**
 * Tela do hub (`?page=hub`): só os painéis conhecidos. De propósito NÃO passa por settingsState(),
 * que drena o lote e lê todos os agentes — o hub é uma página de navegação, não um painel.
 */
export function panelsState() {
  assertOwner();
  // O MOTOR que serve este agente, com o caminho para o painel dele.
  const engines = engineLinks({ agent: defaultAgent()?.name ?? 'no agent', self: ScriptApp.getScriptId(), selfUrl: appUrl() });
  return { env: panelEnv(), panels: panelList(envName(), appUrl(), siblingUrl()), engines };
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
const describeAccess = (a: Access) => `${a.users.length ? a.users.join(', ') : 'só o dono'} · ${a.tools.length ? a.tools.join(', ') : 'sem ferramentas'}`; // lang-ok: rotulo do TRACE, lido pelo dono no historico em pt-BR

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
  t.end({ answer: `passos: ${next ?? 'da pasta'}` }); // lang-ok: rotulo do TRACE (origem da mudanca)
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
    t.end({ answer: `pessoas: ${next.users.length ? next.users.join(', ') : 'só o dono'}` }); // lang-ok: rotulo do TRACE
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
  initiative: {
    label: 'Reach out',
    // O texto ANTIGO dizia que o desenho tinha sido reprovado e não tinha medição. Era verdade em
    // 17/09 e deixou de ser: a P22 passou 4 de 4, e a F3a foi construída com o buraco real tapado —
    // a agenda saiu da pasta compartilhável e veio para cá.
    what: 'Wakes up on the schedule YOU set below and acts without being asked, then sends you the answer in your direct conversation with this app in Google Chat (once this engine has its Chat app identity and you have talked to the app; otherwise the answer stays in the trace). It only uses tools you put on the auto-approve list; anything else makes the run fail and say so there, instead of waiting for a click nobody is there to give.',
    missing: null,
  },
};

const capsProp = (folderId: string) => `CAP:${folderId}`;

/** As capacidades de um agente, com o texto que explica cada uma e quem é o criador designado hoje. */
export function agentCapabilities(folderId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const aprovadas = parseCapabilities(props.getProperty(capsProp(folderId)));
  // ITEM 4, QUE A AUDITORIA DERRUBOU JUNTO COM OS OUTROS: `effectiveCapabilities` tinha teste verde,
  // ZERO importadores, e `CAPS_ENABLED` só aparecia num COMENTÁRIO. A chave de emergência não existia.
  // Uma chave que ninguém vê se está ligada é pior que não ter: produz confiança falsa nos dois sentidos.
  const congelado = !capsEnabled(props.getProperty('CAPS_ENABLED'));
  const caps = effectiveCapabilities(aprovadas, props.getProperty('CAPS_ENABLED'));
  return {
    folderId,
    // `on` é o EFETIVO (o que vale agora); `approved` é o que o dono marcou. Mostrar só um dos dois
    // esconderia metade do estado: congelado, a tela mostraria tudo desligado sem dizer por quê.
    capabilities: CAPABILITIES.map((c) => ({ name: c, on: can(caps, c), approved: can(aprovadas, c), label: CAP_TEXT[c].label, what: CAP_TEXT[c].what, missing: CAP_TEXT[c].missing, available: CAP_TEXT[c].missing === null })),
    frozen: congelado,
    frozenNote: congelado ? 'Every capability is frozen by the emergency switch. The agents keep answering; nothing acts on its own until it is turned back on.' : '',
  };
}

/**
 * Liga ou desliga UMA capacidade. Só o dono, só nome da lista fechada.
 *
 * A lista fechada é a guarda: um nome fora de `CAPABILITIES` é recusado antes de qualquer escrita.
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
    const call = (id: string, m: Message[]) => complete(key, id, m, CHAT_MAX_TOKENS, undefined, [], undefined, TURN_REASONING);
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
  // Proatividade: o MESMO worker, nenhum gatilho novo (item 28). Isolado como os outros — um defeito
  // no despertar não pode cancelar o trabalho que o dono pediu.
  isolado('wake', () => tickProactive());
  return drained ?? { n: 0, ms: 0, oldest: null };
}

/**
 * **O ponto ÚNICO onde se pergunta "este agente pode agir?"** (revisão de 2026-09-20).
 *
 * A guarda estava escrita à mão em oito lugares, em duas grafias, e quatro delas PULAVAM o
 * congelamento de emergência. A deriva já era concreta e visível ao dono: com a chave desligada,
 * `successorOptions` (o read-model) dizia `can: true` e `writeSuccessor` (a ação) recusava — a tela
 * prometendo o que o motor não honra, que é o defeito desta rodada inteira em terceira forma.
 *
 * A DECISÃO continua pura e continua em `agentCaps.ts`/`family.ts`. O que faltava era um lugar só
 * de LEITURA — sem ele, endurecer um sítio deixa os irmãos para trás, e o próximo revisor
 * redescobre o mesmo buraco.
 */
function mayAct(folderId: string, cap: Capability): { ok: boolean; reason: string } {
  const props = PropertiesService.getScriptProperties();
  const id = String(folderId ?? '').trim();
  if (!id) return { ok: false, reason: 'unknown agent' };
  // D6 — A CHAVE DE PARADA DO DONO, que NÃO ERA LIDA AQUI. Achado rodando: com o motor pausado,
  // `swarm run` foi até o OpenRouter, e quem recusou foi a fatura. `store.isEnabled()` era lido pela
  // conversa e pelo ciclo de sonho, e por mais nada — então `./gasclaw down` parava o que FALA e
  // deixava correr o que PAGA e implanta.
  //
  // Vem ANTES de status e de capacidade porque parado é parado: um agente pausado que recusasse por
  // "succeed is off" mandaria o dono ligar uma capacidade que não é o problema.
  if (!store.isEnabled()) return { ok: false, reason: 'everything is paused: run `./gasclaw up` (or turn the runtime back on in the panel) before acting' };
  const status = parseStatus(props.getProperty(`STATUS:${id}`));
  if (status !== 'active') return { ok: false, reason: `this agent is ${status}` };
  // EFETIVAS e não aprovadas: o congelamento vence qualquer aprovação individual, e precisa vencer
  // aqui — senão a chave que existe para parar tudo não para o que o dono aciona pelo painel.
  const caps = effectiveCapabilities(parseCapabilities(props.getProperty(`CAP:${id}`)), props.getProperty('CAPS_ENABLED'));
  if (!can(caps, cap)) {
    const aprovada = can(parseCapabilities(props.getProperty(`CAP:${id}`)), cap);
    return { ok: false, reason: aprovada ? 'every capability is frozen by the emergency switch' : `${cap} is off for this agent` };
  }
  return { ok: true, reason: '' };
}

/**
 * O agente PADRÃO — o que a tela e o Chat usam quando ninguém escolhe.
 *
 * Pula os ARQUIVADOS. Arquivar tem de significar a mesma coisa no painel e no motor: um agente
 * arquivado que continuasse sendo `listAgents()[0]` seguiria atendendo o Chat com as ferramentas
 * dele, e o painel viraria uma promessa que o motor não cumpre.
 *
 * Se TODOS estiverem arquivados, devolve `null`: o certo é dizer que não há agente ativo, não
 * ressuscitar um por conveniência.
 */
function defaultAgent(): { name: string; folderId: string } | null {
  const props = PropertiesService.getScriptProperties();
  return store.listAgents().find((a) => isRunnable(parseStatus(props.getProperty(`STATUS:${a.folderId}`)))) ?? null;
}

// ---------- Proatividade: a agenda mora no PAINEL (itens 25 e 28) ----------

const schedProp = (folderId: string) => `SCHED:${folderId}`;
const seenProp = (folderId: string) => `SCHEDSEEN:${folderId}`;
const autoProp = (folderId: string) => `AUTOOK:${folderId}`;

/** A lista de auto-aprovação já limpa. Ilegível vira VAZIA: nenhuma ferramenta, nunca todas. */
function autoListOf(folderId: string): string[] {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(autoProp(folderId));
    return cleanAutoList(JSON.parse(raw ?? '[]'), toolCatalog().map((t) => t.name)).list;
  } catch {
    return [];
  }
}

/** A agenda e a lista de auto-aprovação deste agente, para a tela. */
export function agentSchedule(folderId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const id = String(folderId ?? '').trim();
  const { jobs, errors } = parseSchedule(props.getProperty(schedProp(id)));
  const auto = cleanAutoList(JSON.parse(props.getProperty(autoProp(id)) ?? '[]'), toolCatalog().map((t) => t.name));
  return {
    folderId: id,
    jobs: jobs.map((j) => ({ ...j, when: jobText(j) })),
    errors,
    max: JOB_MAX,
    autoApprove: auto.list,
    dropped: auto.dropped,
    neverAuto: NEVER_AUTO,
    note: AUTO_NOTE,
    // A frase que explica por que isto não está na pasta. Ela precisa estar na TELA, não só na ADR:
    // é o dono que decide, e ele decide melhor sabendo o que a escolha evita.
    why: 'The schedule lives here, not in the agent folder. The folder can be shared — and whoever could edit it would be writing the prompt and the delivery target of a run nobody is watching.',
  };
}

/** Grava a agenda. Só o dono, e o servidor VALIDA: a tela é conveniência, não autoridade (ADR-021). */
export function setAgentSchedule(folderId: string, jobs: unknown) {
  assertOwner();
  const id = String(folderId ?? '').trim();
  const { jobs: limpos, errors } = parseSchedule(JSON.stringify(jobs ?? []));
  if (errors.length) throw new Error(errors.join('; ')); // recusa inteira: meia agenda é pior que nenhuma
  PropertiesService.getScriptProperties().setProperty(schedProp(id), serializeSchedule(limpos));
  return agentSchedule(id);
}

/** Grava a lista de auto-aprovação, recusando o que nunca pode entrar. */
export function setAgentAutoApprove(folderId: string, list: unknown) {
  assertOwner();
  const id = String(folderId ?? '').trim();
  const r = cleanAutoList(list, toolCatalog().map((t) => t.name));
  // O que foi descartado VOLTA na resposta: aceitar calado daria ao dono a impressão de ter aprovado
  // o que ele não aprovou — a mesma razão pela qual `parseCapabilities` invalida a lista inteira.
  PropertiesService.getScriptProperties().setProperty(autoProp(id), JSON.stringify(r.list));
  return { ...agentSchedule(id), dropped: r.dropped };
}

/**
 * O despertar: roda DENTRO do worker de 1 min que já existe. **Nenhum gatilho novo** — a P22 mediu
 * que perguntar "tem algo vencido?" custa 13,87% da cota diária e que cabem 6 agentes.
 *
 * Silêncio é resposta VÁLIDA e precisa aparecer: sem o span, "acordou, olhou e não tinha nada" fica
 * indistinguível de "o gatilho não rodou". A primeira é o comportamento certo; a segunda é defeito.
 */
function tickProactive(): void {
  const props = PropertiesService.getScriptProperties();
  const agora = new Date();
  const tz = Session.getScriptTimeZone();
  const minutos = Number(Utilities.formatDate(agora, tz, 'HH')) * 60 + Number(Utilities.formatDate(agora, tz, 'mm'));
  const semana = Number(Utilities.formatDate(agora, tz, 'u')) % 7; // 'u': 1=segunda … 7=domingo
  // SE O RELÓGIO NÃO PUDER SER LIDO, NÃO SE GRAVA NADA. Sem esta guarda, `minutos` viraria `NaN`, o
  // carimbo seria gravado como a string "NaN", e `dueJobs` passaria a recusar TUDO para sempre —
  // porque toda comparação com NaN é falsa. O agente nunca mais despertaria, sem erro e sem sinal.
  // Um relógio ilegível é falha transitória; um carimbo envenenado é permanente.
  if (!Number.isInteger(minutos) || !Number.isInteger(semana)) {
    console.warn('tickProactive: could not read the clock; skipping this tick without touching the stamps');
    return;
  }
  const congelamento = props.getProperty('CAPS_ENABLED');
  for (const a of store.listAgents()) {
    const { jobs } = parseSchedule(props.getProperty(schedProp(a.folderId)));

    // O CARIMBO ANDA ANTES DO PORTÃO, e esta ordem é o conserto de um defeito que a revisão pegou.
    //
    // Eu tinha posto a checagem de capacidade ANTES desta linha. O efeito: com `initiative` desligada
    // (ou o agente arquivado, ou tudo congelado), o carimbo parava — e a janela do `dueJobs` crescia
    // sozinha. Religar depois de dez horas dispararia os jobs dessas dez horas DE UMA VEZ, e o
    // comentário logo abaixo, escrito por mim, já dizia exatamente por que isso não pode acontecer.
    //
    // A regra certa: o relógio é do MUNDO e anda sempre; a autorização é do DONO e decide se o
    // despertar acontece. Confundir os dois transforma "estava desligado" em "tem dez horas de fila".
    // LÊ ANTES DE GRAVAR. Na primeira versão deste conserto eu gravava o carimbo e lia em seguida —
    // então `lastSeen` já era `minutos`, a janela nascia vazia e NADA vencia nunca. O controle
    // positivo do teste foi quem pegou: os seis testes de portão continuavam verdes, porque um motor
    // que não desperta nunca também não desperta quando não deve.
    // E NÃO SOBREVIVE À AGENDA VAZIA (auditoria 2026-09-21): pular o agente sem jobs congelava o carimbo, e o
    // primeiro job posto depois herdava a janela velha — disparava na hora.
    const visto = props.getProperty(seenProp(a.folderId));
    // Agenda vazia: o carimbo velho SAI (revisão F9) — gravar o minuto aqui eram 1.440 escritas por agente por
    // dia. Sem carimbo, `dueJobs` não dispara nada, e o primeiro tique com job carimba de novo.
    if (jobs.length === 0) {
      if (visto !== null) props.deleteProperty(seenProp(a.folderId));
      continue;
    }
    props.setProperty(seenProp(a.folderId), String(minutos));

    const v = mayAct(a.folderId, 'initiative');
    if (!v.ok) continue;
    const devidos = dueJobs(jobs, visto === null ? null : Number(visto), minutos, semana);
    if (devidos.length === 0) {
      const span = noReplySpan('nothing was due');
      runlog.begin('config', { question: span.name, agent: a.name }).end({ answer: span.why });
      continue;
    }
    const io = runIO();
    // F9: a resposta vai para a conversa direta DO DONO — sem isto ela morria no trace, e "Reach out" não
    // alcançava ninguém. Sem conversa (ou sem a identidade do app), o run acontece do mesmo jeito.
    const dm = ownerDm();
    for (const j of devidos) {
      const now = Date.now();
      const r = newRun({
        ...(dm ? { delivery: newChatDelivery(dm, undefined, Utilities.getUuid(), now, 0) } : {}),
        runId: `wake-${now}-${Utilities.getUuid().slice(0, 8)}`,
        session: `${a.folderId}:schedule`,
        folderId: a.folderId,
        user: ownerEmail(),
        text: j.prompt,
        now,
        ownerDm: false, // um run que ninguém pediu não escreve na memória do dono
        proactive: true,
      });
      io.enqueue(r, now);
      props.setProperty(`LASTWAKE:${a.folderId}`, r.runId); // o último despertar, para ler o que ele fez
    }
  }
}

/** A conversa direta do dono com o app, ou `null`. Nunca lança: achar o destino não pode impedir o run. */
function ownerDm(): string | null {
  if (!chatAppAvailable()) return null;
  try {
    return ownerDmAsChatApp();
  } catch (err) {
    console.warn(`ownerDm: ${redactMsg(err)}`);
    return null;
  }
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
function pocP28(step?: string): unknown {
  const props = PropertiesService.getScriptProperties();
  const agentes = store.listAgents();
  if (step === 'wired') {
    // C1: o instrumento EXISTE no bundle e está no caminho do passo. Isto não mede falha nenhuma —
    // mede se seríamos capazes de contar uma, que é a pergunta que a P25 não fez.
    const amostra = failuresFrom({ events: [{ name: 'gmail.send', status: 'refused' }], text: 'x' }, Date.now());
    return { pass: amostra.length === 1 && amostra[0].kind === 'refused_tool', sample: amostra, reading: 'the counter can turn a failed turn into a row; whether any row EXISTS is step `count`' };
  }
  if (step === 'count') {
    // C2: quanto já acumulou de USO REAL. Zero aqui é resultado válido e honesto — significa que
    // nenhum run falhou desde que o instrumento foi ligado (v113), não que o instrumento falte.
    const linhas = agentes.map((a) => {
      const fs = parseFailures(props.getProperty(failProp(a.folderId)));
      const cs = cluster(fs, 30 * 24 * 3600_000, Date.now());
      const m = hasMaterial(cs);
      return { agent: a.name, rows: fs.length, clusters: cs.length, top: m.top ?? null, material: m.ok };
    });
    const total = linhas.reduce((t, l) => t + l.rows, 0);
    return {
      // O `pass` afirma que a LEITURA funcionou, não que há dado. Confundir os dois faria zero parecer
      // defeito — e zero, aqui, é a medida honesta de um agente que não falhou ainda.
      pass: true,
      totalRows: total,
      agents: linhas,
      reading: total === 0 ? 'zero rows since the counter was wired (v113): no run has failed yet. This is data, not a defect — items 26/27/29/30 stay open, and the threshold of 3 stays a guess' : `${total} row(s) accumulated: the cluster can start being read`,
    };
  }
  return { pass: false, error: 'steps: wired, count' };
}

/** Estado da sonda P29. Vive numa Property porque a execução morre em 6 min e a cota não cabe nela. */
/**
 * A conversa com ESTE agente no Google Chat, para o painel. O app do dev e o de prod respondem com o mesmo
 * nome ("gasclaw"), e o dono não conseguia saber em qual conversa escrever. A conversa certa sai da
 * identidade do próprio app deste projeto: o espaço de mensagem direta em que ele está.
 */
export function chatLink() {
  assertOwner();
  if (!chatAppAvailable()) return { ok: false as const, reason: 'this engine has no Google Chat app identity' };
  // A conversa do DONO, não a primeira conversa direta da lista: o app tem uma com cada pessoa que falou com ele.
  const dm = ownerDmAsChatApp();
  if (!dm) return { ok: false as const, reason: 'no direct conversation with this app yet: in Google Chat, start one with the gasclaw app of this project' };
  const id = dm.replace('spaces/', '');
  return { ok: true as const, url: `https://chat.google.com/dm/${id}`, space: dm };
}

/**
 * P36 (F9) — as quatro capacidades medidas NO MOTOR QUE RESPONDE (o coroado), pelo caminho real de cada
 * uma. Só o dono (a CLI com o segredo). Cada passo que muda algo tem o seu passo de desfazer.
 */
function pocP36(step?: string, params: Record<string, string> = {}): unknown {
  const ag = defaultAgent();
  if (!ag) return { pass: false, error: 'there is no agent' };
  const props = PropertiesService.getScriptProperties();
  const id = ag.folderId;
  const tz = Session.getScriptTimeZone();
  const agora = new Date();
  const minutos = Number(Utilities.formatDate(agora, tz, 'HH')) * 60 + Number(Utilities.formatDate(agora, tz, 'mm'));
  if (step === 'status') {
    return { pass: true, enabled: store.isEnabled(), agent: ag.name, capsApproved: parseCapabilities(props.getProperty(`CAP:${id}`)), capsEffective: effectiveCapabilities(parseCapabilities(props.getProperty(`CAP:${id}`)), props.getProperty('CAPS_ENABLED')), tools: approvedOf(id)?.tools ?? [], autoApprove: agentSchedule(id).autoApprove, schedule: parseSchedule(props.getProperty(schedProp(id))).jobs, seen: props.getProperty(seenProp(id)), nowMinute: minutos, mayAct: { initiative: mayAct(id, 'initiative') } };
  }
  // R1 — um job daqui a 2 min na agenda REAL; o worker dispara pelo caminho de sempre. A agenda anterior fica guardada.
  if (step === 'wake') {
    const antes = props.getProperty(schedProp(id));
    if (props.getProperty('P36_SCHED_BACKUP') === null) props.setProperty('P36_SCHED_BACKUP', antes ?? '');
    const at = (minutos + 2) % 1440;
    // `--variant deny`: pede uma ferramenta FORA da auto-aprovação — o run tem de falhar dizendo por quê, sem agir.
    const prompt = params.variant === 'deny' ? 'F9 probe (Reach out, deny): create a Google Doc titled f9-probe with the text hello.' : 'F9 probe (Reach out): reply with exactly the word pong. Do not use any tool.';
    const jobs = [...parseSchedule(antes).jobs, { at, prompt, days: [] }];
    setAgentSchedule(id, jobs);
    return { pass: true, armedAtMinute: minutos, fireAtMinute: at, reading: 'wait ~3 min, then read the most recent run with ./gasclaw trace' };
  }
  // A conversa direta do dono, com o erro real se não achar (o despertar engole o erro para não travar o run).
  if (step === 'dm') {
    if (!chatAppAvailable()) return { pass: false, reading: 'this build has no Chat app identity' };
    try {
      const dm = ownerDmAsChatApp();
      return { pass: !!dm, owner: ownerEmail(), dm };
    } catch (e) {
      return { pass: false, owner: ownerEmail(), error: String((e as Error)?.message ?? e).slice(0, 300) };
    }
  }
  if (step === 'wakeread') {
    const runId = props.getProperty(`LASTWAKE:${id}`);
    const r = runId ? runIO().load(id, runId) : null;
    if (!r) return { pass: false, reading: 'no wake run yet' };
    return { pass: r.status === 'done' || r.status === 'failed', runId, status: r.status, answer: (r.answer ?? '').slice(0, 300), error: r.error ?? null, delivery: r.delivery ? { status: r.delivery.status, space: r.delivery.space, sentAt: r.delivery.sentAt ?? null, messageName: r.delivery.messageName ?? null } : null };
  }
  // ADR-047 — as esperas vistas pela autoridade (Script Properties): cartão postado (recibo), hora, fila, e o
  // estado do run quando a pasta é conhecida. Só lê.
  if (step === 'waits') {
    const io = runIO();
    const all = props.getProperties();
    const queued = new Set(io.pointers().map((p) => p.runId));
    const waits = Object.keys(all).filter((k) => k.startsWith('A:')).slice(0, 20).map((k) => {
      const runId = k.slice(2);
      const a = io.authority(runId);
      let run: DurableRun | null = null;
      try {
        run = a?.folderId ? io.load(a.folderId, runId) : io.load(id, runId);
      } catch {
        // pasta inacessível: mostra só a autoridade
      }
      return { runId, chat: !!a?.space, prompted: a?.prompted ?? null, card: a?.card ?? null, at: a?.at ? new Date(a.at).toISOString() : null, queued: queued.has(runId), status: run?.status ?? null, pending: run?.pending ? `${run.pending.kind}:${run.pending.name}` : null, delivery: run?.delivery?.status ?? null };
    });
    return { pass: true, waits, openAsks: Object.keys(all).filter((k) => k.startsWith('ASKRUN:')).length };
  }
  if (step === 'wakeclear') {
    const b = props.getProperty('P36_SCHED_BACKUP');
    if (b === null) return { pass: true, reading: 'nothing to restore' };
    if (b === '') props.deleteProperty(schedProp(id));
    else props.setProperty(schedProp(id), b);
    props.deleteProperty('P36_SCHED_BACKUP');
    return { pass: true, schedule: parseSchedule(props.getProperty(schedProp(id))).jobs };
  }
  return { pass: false, error: 'steps: status, wake [--variant deny], wakeread, wakeclear, waits, dm' };
}

const POCS: Record<string, (step?: string, params?: Record<string, string>) => unknown> = {
  p1: () => pocUrlFetchTimeout(),
  p2: (step, params = {}) => pocP2(step, params, runIO()),
  p3: (step) => pocP3(step),
  p4: (step) => pocP4(step),
  p19: (step) => pocP19(step),
  p20: (step) => pocP20(step),
  p22: (step, params = {}) => pocP22(step, params),
  p28: (step) => pocP28(step),
  p36: (step, params = {}) => pocP36(step, params),
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

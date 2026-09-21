import { namesOf, scenarioMd, SCENARIOS } from './judgeSet';
import { parseScenario } from './eval';
import { startDream, tickDream, type DreamDeps } from './dreamTick';
import { dreamIO } from './dreamStore';
import { failProp, failuresFrom, parseFailures, serializeFailures, withFailure } from './failureLog';
import { mergeAcrossGenerations, originLabel, parseSchema, validateValues, type ConfigField } from './agentConfig';
import { capAction, childrenSpendUpperBound, FAMILY_NOTE } from './family';
import { BUDGET_CEILING_USD, effectiveBudget, parseBudgetOverride } from './budget';
import { burstReading, consentReading, P29_MAX_CREATES, parseP29State, quotaReading, withCreated, withRefusal, type BurstRow, type ConsentRow, type P29State } from './swarm';
import { cluster, hasMaterial, type Failure } from './dreamCycle';
import { AUTO_NOTE, cleanAutoList, mayAutoApprove, NEVER_AUTO, noReplySpan, onProactiveBlock } from './autoApprove';
import { dueJobs, JOB_MAX, jobText, parseSchedule, serializeSchedule } from './schedule';
import { board } from './dreamBoard';
import { AUTH_LABEL, authState, childrenWrites, KIND_LABEL, KIND_WHAT, readChildrenFrom, redirectTarget, withChild, withoutChild, type Child } from './children';
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
import { foreignMessage, parseSubagent, personaTools, subagentGrants, subagentSpan, subagentTools } from './subagent';
import type { AgentSpec } from './workspace';
import { personaIO } from './tools/personaStore';
import { approvalCard, decisionFrom, issue, issueGrant } from './approval';
import { cacheTickets, decideChatApproval, decideScreenApproval, durableTickets, hashToken, newToken } from './approvalStore';
import { chatTurn, handleChat, type ChatDeps, type ChatEvent, type ChatReply } from './chat';
import { withChatFormatRules } from './chatFormat';
import { extendBudget, markInflight, newRun, resumeOf, RUN_BUDGET_USD, view, withDecision, type DurableRun } from './run';
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
import { complete, type Completion, type EmptyCompletionError, type Message, type ToolDef } from './llm';
import { gasGoogle, zone } from './tools/googleHttp';
import { offsetMinutes } from './agenda';
import { folderModel, getOverride, listModels as openRouterModels, type ModelInfo, setOverride, validateChoice } from './models';
import * as observe from './observe';
import * as runlog from './runlog';
import {
  CAPABILITIES, can, canSucceed, capsAfterSuccession, creatorOf, DEFAULT_INTERVAL_MS, bestHeirOf, forgetAgentProps, intervalOf, mayGenerate,
  accessAfterArchive, capsAfterCreatorMoved, capsEnabled, clearCreator, effectiveCapabilities, isRunnable, nextGeneration, parseCapabilities, parseStatus, setCreator, type Capability, type LineageEntry,
} from './agentCaps';
import { beatsIncumbent, CODEGEN_BUDGET_USD, mayWriteProject, withinDailyCap } from './dream';
import { generateSuccessor, sourceOfChild, type SuccessorDeps } from './successor';
import { codeMatches, crownLanded, crownReadiness, crownVerdict, halfCrowned, inheritable, patchMessages, prepareSuccessor, readSuccessorsFrom, slotFor, successorWrites, type EvalRow, type Evaluation, type ReadinessCheck, type SuccessorRecord, type SuccessorSelf } from './succession';
import { codeDelta, judgeCase, parseBattery, previousScore, scoreRun, withMeasurement } from './fitness';
import { applyPatch, parsePatch, type Change, type PatchFile } from './patch';
import { seedSource } from './seed';
import { engineIdentity } from './identity';
import { CHILD_FORBIDDEN_SCOPES, codeTokens, narrowScopes, OPUS_MODEL } from './codegen';
import * as store from './store';
import { memoryIO } from './tools/memoryStore';
import { allowedTools, findTool, toolCatalog } from './tools/registry';
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
    // O PAI COROADO NÃO É RELIGADO PELA CLI. O up chama enable a cada publicação, e religaria o motor
    // que entregou o agente ao sucessor: dois motores de novo. Retomar o agente é decisão do dono, no painel.
    const coroado = action === 'enable' ? readSuccessors(PropertiesService.getScriptProperties()).find((r) => r.crownedAt !== null) : undefined;
    if (coroado) return { ok: false, status: 409, enabled: store.isEnabled(), error: `this engine handed the agent to its crowned successor ${coroado.scriptId.slice(0, 10)}: it stays paused. To take the agent back, turn this engine on in its panel and pause the successor.` };
    store.setEnabled(action === 'enable');
    return { ok: true, enabled: store.isEnabled() };
  }
  if (action === 'drain') return { ok: true, trigger: observe.ensureTrigger(), ...observe.drain() };
  if (action === 'tools') return setTools(p.folder || '', p.set ?? '');
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
  if (action === 'battery') return setAgentBattery(pasta, p.set ?? '');
  if (action === 'interval') return setAgentInterval(pasta, Number(p.ms));
  if (action === 'budget') return p.end === '1' ? endRunBudget() : setRunBudget(Number(p.codegen), Number(p.family), Number(p.hours));
  // F7 (ADR-043): `succeed` escreve o AGENTE sucessor por patch; o que ela fazia antes — um projeto
  // pequeno de código novo — é uma AUTOMAÇÃO, e responde por `automate`. A corrida do enxame usa `automate`.
  if (action === 'succeed') return writeSuccessor(pasta, p.goal ?? '');
  if (action === 'automate') return writeAutomation(pasta, (p.scopes ?? '').split(',').filter(Boolean), p.goal ?? '', p.tokens ? Number(p.tokens) : undefined);
  if (action === 'evaluate') return evaluateSuccessor(p.child || '');
  if (action === 'rebase') return rebaseSuccessor(p.child || '');
  if (action === 'inherit') return inheritSuccessor(p.child || '');
  if (action === 'sync') return syncSuccessor(p.child || '');
  if (action === 'succession') return successionState();
  if (action === 'measure') return measureChild(p.child || '');
  if (action === 'lineage') return lineage();
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
    // P34 — A PORTA DO SUCESSOR PARA SER AVALIADO DE FORA. Vem ANTES do segredo da CLI porque o pai
    // não tem esse segredo, e não deve ter. O que a torna segura sem ele são as três guardas de
    // `evalRunForParent` (só sucessor, só parado, só caixa de areia).
    if (action === 'evalrun') return json(evalRunForParent(p.spec ?? ''));
    // F7 — A COROA. Mesma razão de vir antes do segredo: o pai não o tem. O que a torna segura são as
    // guardas de `crownFromParent` (só sucessor, só o PAI da semente) — e o token do dono, sem o qual
    // `assertOwner` acima já recusou. Coroar é o clique do dono no painel do pai (`crownSuccessor`).
    if (action === 'crown') return json(crownFromParent(p.parent ?? ''));
    // O HEALTH PROFUNDO do sucessor, para o pai decidir se a coroa é possível. Só leitura, e pelo POST
    // porque a resposta inteira importa (a leitura por GET do pai corta em 1.200 caracteres).
    if (action === 'readiness') return json(readinessSelf());
    // F8 — a HERANÇA chega do pai: as chaves do agente (nunca segredo). Filtrada de novo aqui.
    // Nome DIFERENTE da ação `inherit` da CLI: com o mesmo nome esta porta interceptava, no próprio pai,
    // o pedido da CLI — antes do segredo — e o recusava (achado ao vivo, dev v161).
    if (action === 'handover') return json(inheritFromParent(e?.postData?.contents ?? ''));
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
    // E o MOTOR entra no título também: titular e sucessor servem o mesmo agente, e as duas abas se
    // chamariam igual. A aba é onde as duas janelas se confundem primeiro.
    const quem = engineIdentity(ScriptApp.getScriptId(), defaultAgent()?.name, store.successorOf());
    const title = (s: string) => `${s} · ${panelEnv()} · ${quem.agent} · ${quem.role === 'successor' ? 'successor ' : ''}${quem.engine}`;
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
    if (action === 'successorhealth') return json(successorHealth(e.parameter.child ?? ''));
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
export const __test_born = (parentFolder: string, nome: string, papel: string): string =>
  bornAgent({ name: 'pai', folderId: parentFolder } as AgentSpec, nome, papel);

function bornAgent(parent: AgentSpec, name: string, role: string): string {
  const props = PropertiesService.getScriptProperties();
  const nome = String(name ?? '').trim().toLowerCase(); // normaliza AQUI: quem chama não precisa saber a regra
  if (!validAgentName(nome)) throw new Error('invalid agent name: use lowercase letters, numbers and hyphens');
  if (store.listAgents().some((a) => a.name.toLowerCase() === nome)) throw new Error(`there is already an agent named "${nome}"`);
  // O teto familiar vale aqui também, e é onde ele morde primeiro: `stop-creating` existe exatamente
  // para parar de criar ANTES de congelar.
  const acao = capAction(familySpendQuiet(), budgetNow().familyUsd);
  if (acao !== 'ok') throw new Error(`the family spend cap says ${acao}: not creating another agent`);

  // PASTA EXISTENTE NÃO É REUSADA, e este era o pior defeito desta rodada — perda silenciosa de texto
  // ESCRITO PELO DONO. `ensureFolderPath` reusa a primeira pasta homônima, e o `saveRole` abaixo
  // sobrescreve o AGENTS.md sem perguntar. O caminho concreto: o dono remove "vendas" do painel (o
  // diálogo PROMETE que a pasta não é apagada), o agente criador cria "vendas" de novo, e o papel que
  // o dono escreveu é substituído por um que o modelo escreveu. A tela prometia e o código desfazia.
  const raiz = ensureFolderPath(agentFolderPath(nome).slice(0, -1));
  if (raiz.getFoldersByName(nome).hasNext()) {
    throw new Error(`a Drive folder named "${nome}" already exists: rename it or pick another name — I will not write over what is in it`);
  }

  const pasta = ensureFolderPath(agentFolderPath(nome));
  const folderId = pasta.getId();
  seedAgent(folderId, ownerEmail()); // cria os papéis padrão na pasta
  // O PAPEL que o criador escreveu entra como sugestão em AGENTS.md, e é só isso que ele decide: as
  // ferramentas e o acesso continuam fechados até o clique do dono (ADR-021).
  saveRole(folderId, 'AGENTS', `# ${nome}\n\n${role}\n`);
  // `addAgent` chama `assertOwner()`, e ISSO QUEBRA AQUI: `agent.create` é `approval: 'always'`, então
  // o efeito roda na RETOMADA depois do card — por gatilho, sem usuário ativo, onde o Apps Script
  // devolve string vazia. A ação já foi autorizada pelo dono no card; recusá-la por falta de dono
  // ativo seria negar autoridade a quem acabou de concedê-la. O precedente é o `relayToAgent`, que
  // usa `ownerEmail()` pelo mesmo motivo.
  store.saveAgents([...store.listAgents(), { name: nome, folderId }]);
  // Capacidades: NENHUMA, explicitamente. Gravar a lista vazia é diferente de não gravar — quem lê
  // depois vê uma decisão tomada, não uma ausência que alguém possa interpretar como padrão.
  props.setProperty(`CAP:${folderId}`, JSON.stringify([]));
  // NÃO se regrava `CREATOR` aqui. Era escrita de identidade (`setCreator` é `x => x`) com um risco
  // real: se o dono tivesse acabado de passar o bastão para B enquanto um turno de A estava em voo,
  // esta linha devolveria `CREATOR=A` — com `CAP:A` já sem `create` e `CAP:B` com. Resultado:
  // NINGUÉM mais poderia criar, e sem sinal nenhum. `setAgentCapability` roda sob lock; isto não.

  const anterior = lineage().entries;
  const entrada: LineageEntry = {
    at: Date.now(), kind: 'creation', parent: parent.folderId, child: folderId,
    generation: nextGeneration('creation', 1), delta: null, costUsd: 0,
    summary: `created agent "${nome}" with no tools, no access and no capabilities`,
  };
  props.setProperty(lineageProp, JSON.stringify([...anterior, entrada].slice(-100)));
  return `created agent "${nome}". It has no tools, no access and no capabilities until the owner approves them in the panel.`;
}

/**
 * Porta de teste para o repasse real. `relayToAgent` recebe um `AgentSpec` inteiro, que o teste não
 * precisa montar — só o nome e a pasta importam para as invariantes do run criado.
 */
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
        relay: (to: string, text: string) => relayToAgent(spec, to, text),
        // SÓ o agente que tem a capacidade `create` recebe este ponto de entrada. Quem não tem não o
        // encontra no contexto, e a tool recusa antes de qualquer card — a capacidade é o portão, e o
        // portão fica no motor, não numa checagem dentro da ferramenta.
        // O portão lê `CREATOR`, a Property ÚNICA — não a lista de capacidades. A lista consegue
        // representar dois criadores; a Property não. Para a capacidade que MULTIPLICA, a autoridade
        // tem de morar no dado que não consegue estar errado. A lista ainda precisa concordar (o
        // congelamento vence por ela), mas ela não abre nada sozinha.
        ...(PropertiesService.getScriptProperties().getProperty('CREATOR') === spec.folderId &&
        can(effectiveCapabilities(parseCapabilities(PropertiesService.getScriptProperties().getProperty(`CAP:${spec.folderId}`)), PropertiesService.getScriptProperties().getProperty('CAPS_ENABLED')), 'create')
          ? { createAgent: (nome: string, papel: string) => bornAgent(spec, nome, papel) }
          : {}),
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
  if (isDev() && e.type === 'MESSAGE') p35Record(e);
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
  // QUAL MOTOR É ESTE (pedido do dono, 2026-09-21): com titular e sucessor servindo o MESMO agente, os
  // dois painéis eram idênticos. O nome do agente é igual nos dois; o que diferencia é o motor.
  return { me, enabled: store.isEnabled(), hasKey: !!store.getApiKey(), agents: store.listAgents(), appUrl: appUrl(), scriptUrl: scriptUrl(), env: panelEnv(), cliSecretAt, auth: authStatus(), identity: engineIdentity(ScriptApp.getScriptId(), defaultAgent()?.name, store.successorOf()) };
}

/** P21: ambiente já normalizado (desconhecido conta como prod), para o rótulo do cabeçalho. */
const panelEnv = () => asEnv(envName());

/**
 * Tela do hub (`?page=hub`): só os painéis conhecidos. De propósito NÃO passa por settingsState(),
 * que drena o lote e lê todos os agentes — o hub é uma página de navegação, não um painel.
 */
/**
 * Os sucessores que este motor conhece. `// minimal:` hoje é só o da P33 — a Fase 2 da F7 troca esta
 * fonte pelo registro de sucessores de verdade, e o hub não precisa mudar.
 */
function knownSuccessors(): { scriptId: string; url: string }[] {
  const props = PropertiesService.getScriptProperties();
  const lista = readSuccessors(props).map((r) => ({ scriptId: r.scriptId, url: r.url }));
  // O da P33 veio antes do registro; entra enquanto não foi registrado por uma geração.
  const s = JSON.parse(props.getProperty('P33_SUCCESSOR') ?? 'null') as { scriptId?: string; url?: string } | null;
  if (s?.scriptId && s.url && !lista.some((x) => x.scriptId === s.scriptId)) lista.unshift({ scriptId: s.scriptId, url: s.url });
  return lista;
}

export function panelsState() {
  assertOwner();
  // OS MOTORES que servem este agente (pedido do dono, 2026-09-21): o titular e os sucessores, com o
  // caminho de um para o outro. No titular a lista vem do registro dele; no sucessor, o pai vem da semente.
  const engines = engineLinks({ agent: defaultAgent()?.name ?? 'no agent', self: ScriptApp.getScriptId(), selfUrl: appUrl(), parent: store.successorOf(), parentUrl: store.parentUrl(), successors: store.isSuccessor() ? [] : knownSuccessors() });
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
    // O texto ANTIGO dizia que o desenho tinha sido reprovado e não tinha medição. Era verdade em
    // 17/09 e deixou de ser: a P22 passou 4 de 4, e a F3a foi construída com o buraco real tapado —
    // a agenda saiu da pasta compartilhável e veio para cá.
    what: 'Wakes up on the schedule YOU set below and acts without being asked. It only uses tools you put on the auto-approve list; anything else makes the run fail and say so, instead of waiting for a click nobody is there to give.',
    missing: null,
  },
  succeed: {
    label: 'Succeed',
    // A capacidade é ESCREVER o sucessor, e isso funciona. Coroar é outro ato, humano, e continua
    // sendo — a ressalva foi para o `what`, onde ela informa, em vez de ficar no `missing`, onde
    // bloqueava a capacidade inteira por causa de uma decisão que nunca foi da máquina.
    what: 'Writes a successor — its CODE, generated with Opus 5, as its own Apps Script project with narrower permissions than this engine has. Writing is not crowning: the successor does not run until you authorize it, and passing the baton stays your click.',
    missing: null,
  },
  create: {
    label: 'Create agents',
    what: 'Creates NEW agents that are not successors, each with its own Drive folder. Every one is born with no tools, no access and no capabilities until you approve them. This one multiplies, so only ONE agent in the environment can have it.',
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
  const creator = creatorOf(props.getProperty('CREATOR'), store.listAgents());
  return {
    folderId,
    // `on` é o EFETIVO (o que vale agora); `approved` é o que o dono marcou. Mostrar só um dos dois
    // esconderia metade do estado: congelado, a tela mostraria tudo desligado sem dizer por quê.
    capabilities: CAPABILITIES.map((c) => ({ name: c, on: can(caps, c), approved: can(aprovadas, c), label: CAP_TEXT[c].label, what: CAP_TEXT[c].what, missing: CAP_TEXT[c].missing, available: CAP_TEXT[c].missing === null })),
    frozen: congelado,
    frozenNote: congelado ? 'Every capability is frozen by the emergency switch. The agents keep answering; nothing evolves, creates or succeeds until it is turned back on.' : '',
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
          if (on) {
            // O ANTECESSOR perde a capacidade junto com o bastão. Sem isto, `CREATOR` apontava para B
            // e a lista de A continuava dizendo `create` — e o portão do motor, que lia a lista,
            // deixava os dois passarem. O singleton só existia de um dos lados.
            const anterior = props.getProperty('CREATOR');
            if (anterior && anterior !== folderId) {
              props.setProperty(capsProp(anterior), JSON.stringify(capsAfterCreatorMoved(parseCapabilities(props.getProperty(capsProp(anterior))))));
            }
            props.setProperty('CREATOR', setCreator(folderId));
          } else if (props.getProperty('CREATOR') === folderId) props.deleteProperty('CREATOR');
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
  const list = readChildren(props);
  // O filho da POC P24 é real e está na conta do dono: mostrá-lo é o que permite conferir a tela de ponta
  // a ponta hoje, em vez de uma seção vazia que ninguém sabe se funciona.
  const poc = props.getProperty('P24_CHILD');
  const todos: Child[] = poc && !list.some((c) => c.scriptId === poc) ? [...list, { scriptId: poc, kind: 'automation' as const, folderId: null, title: 'POC P24', url: props.getProperty('P24_URL'), scopes: ['https://www.googleapis.com/auth/calendar.events'], parent: null, reason: 'returns a string — it is code, not an agent', at: 0 }] : list;
  // A lista é PLANA: agente e filho aparecem um embaixo do outro, e o vínculo é marcador, não
  // hierarquia. Um filho pode SUCEDER e virar o principal — aninhar exigiria redesenhar a árvore a cada
  // sucessão, e descreveria como permanente uma relação que é temporária.
  const meus = folderId ? todos.filter((c) => c.parent === folderId) : todos;
  // Os ARQUIVADOS entram na mesma resposta. Eles somem da lista de agentes ao serem arquivados, e some
  // da tela é diferente de deixou de existir: os chats continuam legíveis, a pasta continua no Drive, e
  // um antecessor arquivado é justamente a prova de que a sucessão aconteceu. Esconder isso faria a
  // linhagem parecer ter buracos.
  const arquivados = store.listAgents()
    .filter((a) => parseStatus(props.getProperty(`STATUS:${a.folderId}`)) === 'archived')
    .map((a) => ({ name: a.name, folderId: a.folderId, driveUrl: `https://drive.google.com/drive/folders/${a.folderId}` }));
  return {
    folderId: folderId ?? null,
    archived: arquivados,
    // Os AGENTES sucessores entram na mesma tela de projetos: é onde o dono os autoriza e os coroa.
    successors: readSuccessors(props).filter((r) => !folderId || r.folderId === folderId).map((r) => ({ ...r, editorUrl: `https://script.google.com/d/${r.scriptId}/edit` })),
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
  // O TOKEN SÓ VAI PARA O GOOGLE, e sem seguir redirecionamento.
  //
  // Este token carrega os 16 escopos do manifesto — Drive inteiro, `gmail.compose`,
  // `script.projects`. A URL vem de `parseChild`, que aceita QUALQUER `https://`. Hoje só o motor
  // escreve `CHILDREN`, então não há caminho explorável — mas a combinação (destino não fixado +
  // `followRedirects` + credencial de altíssimo privilégio no header) é uma exfiltração esperando um
  // segundo escritor. Fixar o host custa uma linha; descobrir isso depois custaria a conta do dono.
  if (!/^https:\/\/script\.google\.com\//i.test(url)) return { code: 0, body: 'refused: a child URL must be on script.google.com' };
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: false, // um redirect levaria o token para onde o destino mandar
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
  });
  // P31: A SEGUNDA PERNA. O Apps Script entrega a saída do filho com um 30x para
  // script.googleusercontent.com. Sem segui-la, o motor julgaria o 302 — e todo filho correto
  // pareceria quebrado. `redirectTarget` só aceita esse host exato, por https.
  //
  // SEM O TOKEN aqui, de propósito: a primeira perna já provou quem pergunta, e a credencial de 16
  // escopos não precisa atravessar um segundo salto. Se a previsão estiver errada e o salto pedir
  // login, a resposta vira ausência de medição — nunca falha do filho.
  const alvo = redirectTarget(res.getResponseCode(), (res.getHeaders() as Record<string, string>)['Location'] ?? (res.getHeaders() as Record<string, string>)['location'] ?? null);
  if (alvo) {
    const segunda = UrlFetchApp.fetch(alvo, { muteHttpExceptions: true, followRedirects: false });
    return { code: segunda.getResponseCode(), body: segunda.getContentText().slice(0, 1200) };
  }
  return { code: res.getResponseCode(), body: res.getContentText().slice(0, 1200) };
}

/**
 * O registro de filhos, partido em pedaços (D3, medido na P29 no dev v132).
 *
 * Existia UMA Property `CHILDREN`, e o teto de 8 KB dela estourava em 11 filhos com `reason` cheio —
 * enquanto `MAX_CHILDREN` prometia 40 e a corrida da F6 pedia 15. Toda leitura e toda escrita do
 * registro passam por estas duas funções agora; um `props.getProperty('CHILDREN')` solto voltaria a
 * enxergar só o primeiro pedaço, e os filhos do pedaço 2 sumiriam da tela sem erro nenhum.
 */
// UMA chamada a `getProperties()`: ler oito Properties uma a uma seriam oito viagens. Quem decide
// o que ler e o que gravar é `children.ts` — aqui não há julgamento nenhum, só I/O.
const readChildren = (props: GoogleAppsScript.Properties.Properties): Child[] => readChildrenFrom(props.getProperties());

const writeChildren = (props: GoogleAppsScript.Properties.Properties, list: Child[]): void => {
  for (const { prop, value } of childrenWrites(list)) {
    if (value === null) props.deleteProperty(prop);
    else props.setProperty(prop, value);
  }
};

/** Tira o filho da lista do painel. NÃO apaga o projeto no Google — dizer isso na tela é parte do controle. */
export function forgetChild(scriptId: string, folderId?: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const id = String(scriptId ?? '').trim();
  if (!id) throw new Error('unknown child project');
  writeChildren(props, withoutChild(readChildren(props), id));
  // RESÍDUO DA ENTREGA DE CHAVE, que existiu até 2026-09-20 (ADR-040, opção 4). Nada mais LÊ estas
  // duas Properties — a prova está em `test/family.test.ts` —, então elas são dado inerte. Apagá-las
  // aqui é barato e fecha o par que sobrou: o segredo guardado deste lado e a cópia dele no fonte do
  // filho. Um par inerte volta a valer no dia em que alguém restaurar a rota; um par ausente, não.
  props.deleteProperty(`KEYSEC:${id}`);
  props.deleteProperty(`KEYDEL:${id}`);
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
  // Proatividade: o MESMO worker, nenhum gatilho novo (item 28). Isolado como os outros — um defeito
  // no despertar não pode cancelar o trabalho que o dono pediu.
  isolado('wake', () => tickProactive());
  isolado('dream', () => {
    const d = dreamDeps();
    const props = PropertiesService.getScriptProperties();
    const congelamento = props.getProperty('CAPS_ENABLED');
    for (const a of store.listAgents()) {
      // Este laço rodava para TODOS os agentes, sem conferir nada. Um agente ARQUIVADO continuaria
      // sonhando e gastando cota — o oposto do que arquivar significa — e a chave de emergência não
      // pararia justamente o que roda sozinho, que é o que ela existe para parar.
      if (!mayAct(a.folderId, 'dream').ok) continue;
      tickDream(a.folderId, d);
    }
  });
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
  // O teto familiar só barra o que MULTIPLICA. Congelar o sonho por gasto dos filhos puniria a
  // capacidade errada: sonhar não cria ninguém.
  if (cap === 'create' || cap === 'succeed') {
    const gasto = familySpendQuiet();
    const tetoFamilia = budgetNow().familyUsd;
    const acao = capAction(gasto, tetoFamilia);
    if (acao !== 'ok') return { ok: false, reason: `the family spend cap says ${acao}: children have used up to US$ ${(gasto ?? 0).toFixed(2)} of US$ ${tetoFamilia.toFixed(2)}` };
  }
  return { ok: true, reason: '' };
}

/**
 * O agente PADRÃO — o que a tela e o Chat usam quando ninguém escolhe.
 *
 * Pula os arquivados, e isso é conserto de um achado da revisão de segurança: `passBaton` gravava
 * `archived` e não reordenava a lista, então o antecessor continuava sendo `listAgents()[0]`. O dono
 * passava o bastão, lia "archived" no painel, e seguia conversando com quem achava ter aposentado —
 * com as ferramentas dele e `isOwner` verdadeiro. Arquivar tem de significar a mesma coisa nos dois
 * lugares, senão o painel vira uma promessa que o motor não cumpre.
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
    if (jobs.length === 0) continue;

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
    const visto = props.getProperty(seenProp(a.folderId));
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
    for (const j of devidos) {
      const now = Date.now();
      const r = newRun({
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
    }
  }
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
  // Sem estas duas guardas, `passBaton(x, x)` arquivava e esvaziava o MESMO agente — o dono perdia o
  // agente tentando promovê-lo. E um alvo inexistente deixava o ambiente sem ninguém ativo.
  if (String(fromFolderId ?? '').trim() === String(toFolderId ?? '').trim()) throw new Error('an agent cannot succeed itself');
  if (!store.listAgents().some((a) => a.folderId === toFolderId)) throw new Error('the successor is not a registered agent here');
  const props = PropertiesService.getScriptProperties();
  const caps = parseCapabilities(props.getProperty(`CAP:${fromFolderId}`));
  const v = canSucceed(caps, parseStatus(props.getProperty(`STATUS:${fromFolderId}`)));
  if (!v.ok) throw new Error(v.reason);

  // NOVE ESCRITAS SOB UM LOCK SÓ (revisão de 2026-09-20). `setAgentCapability` mexe nas MESMAS chaves
  // e roda sob `underAccessLock`; isto não rodava, e as duas podiam se intercalar — a concessão de
  // `create` que o dono acabou de dar podia ser sobrescrita pela sucessão, ou o contrário.
  //
  // Não há transação em Script Properties, então o lock não torna isto atômico. O que ele garante é
  // que ninguém escreve no meio. Contra a MORTE da execução (6 min do GAS), a defesa é a ORDEM: ver
  // o comentário logo abaixo.
  return underAccessLock(() => passBatonLocked(fromFolderId, toFolderId, delta));
}

function passBatonLocked(fromFolderId: string, toFolderId: string, delta: number | null) {
  const props = PropertiesService.getScriptProperties();
  const caps = parseCapabilities(props.getProperty(`CAP:${fromFolderId}`));
  const m = mandateFor(fromFolderId);
  const dentro = m.active && delta !== null && delta >= (m.mandate?.minDelta ?? 1);
  // ORDEM DELIBERADA: o RESTRITIVO primeiro (revisão de 2026-09-20).
  //
  // Não existe transação em Script Properties, e a execução pode morrer a qualquer momento (6 min do
  // GAS). Então a defesa contra o estado parcial é a ORDEM das escritas: todo prefixo desta sequência
  // precisa ser MAIS restritivo que o estado anterior, nunca menos.
  //
  // Antes, a linhagem e o mandato vinham primeiro e o arquivamento por último. Morrer no meio deixava
  // os DOIS agentes ativos, o antecessor ainda como padrão e com todas as ferramentas — o pior estado
  // possível, alcançado justamente pela falha. Agora: arquiva, tira as ferramentas, tira o bastão, e
  // só então registra. Morrer no meio deixa alguém a menos, nunca alguém a mais.

  // ARQUIVAR PRECISA DESLIGAR DE VERDADE (revisão de segurança de 2026-09-20). Gravar `archived` era
  // o começo e estava sendo tratado como o fim: o status só era conferido em três pontos, e o caminho
  // da CONVERSA não era um deles. O antecessor continuava sendo `listAgents()[0]` — ou seja, o agente
  // padrão da tela e do Chat — com todas as ferramentas aprovadas e `isOwner` verdadeiro. O dono
  // clicava em passar o bastão, lia "archived" no painel, e seguia falando com quem achava ter
  // aposentado. Achar que revogou e não ter revogado é o pior estado possível.
  props.setProperty(`STATUS:${fromFolderId}`, 'archived');
  // As FERRAMENTAS saem junto: um agente que não roda não precisa de ferramenta aprovada, e deixá-las
  // é deixar poder concedido para um alvo que ninguém mais está vigiando. `accessAfterArchive`
  // existia para isto e nunca tinha sido chamada.
  const acessoAntes = parseAccess(props.getProperty(`ACCESS:${fromFolderId}`)) ?? { users: [], tools: [] };
  props.setProperty(`ACCESS:${fromFolderId}`, JSON.stringify(accessAfterArchive(acessoAntes)));
  // E o BASTÃO DE CRIAR não desce pela sucessão. `capsAfterSuccession` é interseção, e `create` está
  // em `CAPABILITIES` — então ele passava, e o sucessor nascia com a caixinha ligada na tela e o
  // portão do motor recusando (porque `CREATOR` continuava no antecessor). Pior: o antecessor
  // arquivado seguia sendo o único do ambiente que podia multiplicar. Quem passa a criar é decisão
  // separada, no painel, como sempre foi.
  // O BASTÃO DE CRIAR SÓ SAI DE QUEM O TINHA — e este `if` é o conserto de um defeito que a revisão
  // MEDIU rodando. Antes, `capsAfterCreatorMoved` era aplicado a `CAP:to` INCONDICIONALMENTE. Se o
  // destinatário JÁ ERA o criador, ele perdia `create` da lista enquanto `CREATOR` seguia apontando
  // para ele — e o portão do motor exige as DUAS coisas. Resultado: ninguém no ambiente podia mais
  // criar, sem erro e sem sinal. Exatamente o estado que o comentário do `bornAgent` diz ter evitado,
  // alcançado por outra porta.
  const criador = props.getProperty('CREATOR');
  if (criador === fromFolderId) {
    // Quem sai leva o bastão junto: a capacidade some da lista dele E o ponteiro é apagado.
    if (clearCreator(criador, fromFolderId) === null) props.deleteProperty('CREATOR');
    props.setProperty(`CAP:${fromFolderId}`, JSON.stringify(capsAfterCreatorMoved(parseCapabilities(props.getProperty(`CAP:${fromFolderId}`)))));
    // E o sucessor NÃO herda: quem passa a criar é decisão separada, no painel.
    props.setProperty(`CAP:${toFolderId}`, JSON.stringify(capsAfterCreatorMoved(parseCapabilities(props.getProperty(`CAP:${toFolderId}`)))));
  } else if (criador !== toFolderId) {
    // O criador é um TERCEIRO: o sucessor também não ganha o bastão de brinde pela sucessão.
    props.setProperty(`CAP:${toFolderId}`, JSON.stringify(capsAfterCreatorMoved(parseCapabilities(props.getProperty(`CAP:${toFolderId}`)))));
  }
  // Se `criador === toFolderId`, NADA se mexe: ele já era o criador antes desta sucessão, e tirar a
  // capacidade dele aqui é justamente o defeito que este bloco existe para não cometer.

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
  // AQUI HAVIA UM USO ERRADO DE `capsAfterSuccession`, e o teste do singleton foi quem o expôs.
  //
  // Essa função foi escrita para o caso em que o sucessor DECLARA capacidades no markdown da pasta —
  // conteúdo de terceiro, que "no máximo pede MENOS do que o antecessor já tinha". O `passBaton`
  // estava passando para ela a Property `CAP:<sucessor>`, que não é declaração nenhuma: é a lista que
  // o DONO aprovou, uma a uma, no painel. Intersectar as duas REVOGAVA EM SILÊNCIO o que o dono tinha
  // concedido ao sucessor por decisão própria — e ele descobriria pela capacidade sumida, sem aviso.
  //
  // A propriedade que importa ("a sucessão não CONCEDE") não precisa de escrita nenhuma: não gravar
  // já não concede. O que precisa de tratamento explícito é só o bastão de criar, logo abaixo.

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
/** A corrida aprovada pelo dono (H1). Vive numa Property com instante de fim: o painel decide (ADR-021). */
const BUDGET_PROP = 'BUDGET_OVERRIDE';

/**
 * Os tetos que valem AGORA. Toda leitura de teto passa por aqui — uma constante lida direto
 * ignoraria a corrida aprovada, e a corrida de US$ 15 pararia na 3ª geração sem motivo visível.
 */
const budgetNow = () => effectiveBudget(parseBudgetOverride(PropertiesService.getScriptProperties().getProperty(BUDGET_PROP)), Date.now());

/**
 * O DONO aprova o orçamento de uma corrida (gate H1 da F6).
 *
 * **O teto expira sozinho** em `hours`: "devolva os tetos ao fim" não é um passo que alguém precisa
 * lembrar — é o relógio. Valores absurdos são RECUSADOS inteiros, nunca cortados em silêncio: o dono
 * que digitou 150 precisa saber que não foi 150, e não descobrir na fatura que foi 50.
 */
export function setRunBudget(codegenUsd: number, familyUsd: number, hours: number) {
  assertOwner();
  const h = Number(hours);
  if (!Number.isFinite(h) || h < 1 || h > 48) throw new Error('a run budget lasts between 1 and 48 hours');
  const pedido = { codegenUsd: Number(codegenUsd), familyUsd: Number(familyUsd), until: Date.now() + h * 3_600_000 };
  if (!parseBudgetOverride(JSON.stringify(pedido))) throw new Error(`both caps must be above zero and at most US$ ${BUDGET_CEILING_USD}`);
  PropertiesService.getScriptProperties().setProperty(BUDGET_PROP, JSON.stringify(pedido));
  return { ...budgetNow(), untilIso: new Date(pedido.until).toISOString() };
}

/** Encerra a corrida ANTES do fim. Sem isto, o único jeito de voltar ao teto de sempre seria esperar. */
export function endRunBudget() {
  assertOwner();
  PropertiesService.getScriptProperties().deleteProperty(BUDGET_PROP);
  return budgetNow();
}

function codegenSpentToday(now: number): number {
  const raw = PropertiesService.getScriptProperties().getProperty(codegenDayProp(now));
  const n = raw === null ? 0 : Number(raw);
  // Valor ilegível conta como TETO ATINGIDO, não como zero: na dúvida sobre quanto já se gastou, a
  // recusa custa uma geração adiada; o zero otimista custa dinheiro real.
  return Number.isFinite(n) && n >= 0 ? n : budgetNow().codegenUsd;
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
export function automationOptions(folderId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const id = String(folderId ?? '').trim();
  // O MESMO ponto de leitura que a ação usa. Antes, este read-model conferia só `canSucceed` enquanto
  // `writeSuccessor` conferia também congelamento e teto familiar — com a chave de emergência
  // desligada, a tela dizia `can: true` e a ação recusava. Prometer o que o motor não honra é o
  // defeito desta rodada inteira, e aqui ele estava em terceira forma.
  const cap = mayAct(id, 'succeed');
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
    budget: { spentToday: gasto, cap: budgetNow().codegenUsd, perRun: CODEGEN_BUDGET_USD },
    note: `An automation is new CODE, written by ${OPUS_MODEL}, deployed as its own Apps Script project. It is a tool, not a successor: it inherits fewer scopes than this engine has — never the same set, and never the ones that let a project write other projects. Google will not run it until you authorize it.`,
  };
}

export function writeAutomation(folderId: string, requestedScopes: string[], goal?: string, maxTokens?: number) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const id = String(folderId ?? '').trim();
  if (!id) throw new Error('unknown agent');

  // ITEM 34 — O TETO QUE AGE. `capAction` devolvia `stop-creating`/`freeze` e NINGUÉM lia: o painel
  // informava e o motor seguia criando. Aqui ele passa a barrar, e nas DUAS faixas: `stop-creating`
  // para de criar antes de congelar, e é essa ordem que evita a parada brusca.
  //
  // O que ele NÃO faz, e está na ADR-040: cortar a chave. Cortar pararia o PAI também, e derrubar o
  // agente do dono por causa de um filho gastão seria trocar um problema por outro maior.
  // A capacidade e o estado vêm primeiro: um agente arquivado ou sem `succeed` não gera nada.
  const v = mayAct(id, 'succeed');
  if (!v.ok) return { ok: false as const, reason: v.reason, costUsd: 0 };
  const intervalo = mayGenerateNow(id);
  if (!intervalo.ok) return { ok: false as const, reason: intervalo.reason, costUsd: 0 };

  // D5 aplicada ao código: ou existe falha real contada, ou o DONO diz o que quer consertado. O que
  // a regra proíbe é o MODELO inventar o problema — o dono declarando um objetivo não é isso, e
  // exigir aglomerado aqui travaria a capacidade inteira até haver falha acumulada.
  const aglomerado = agentMaterial(id);
  // D5: ISTO ERA `.slice(0, 500)`, E CORTAVA EM SILÊNCIO. O enunciado da primeira corrida da F6 tem
  // 1047 caracteres — mais da metade das regras sumiria, e o Opus seria julgado por casos que
  // dependem de regras que ele nunca recebeu, a US$ 1 por geração.
  //
  // Recusar em vez de cortar é a mesma decisão de `narrowScopes`: um corte calado deixa o dono
  // achando que pediu o que não pediu, e ele só descobre pelo resultado ruim.
  const pedido = String(goal ?? '').trim();
  if (pedido.length > GOAL_MAX) throw new Error(`the goal is too long to send whole: ${pedido.length} characters, limit is ${GOAL_MAX}. Shorten it — cutting it here would judge the generator by rules it never received`);
  const material = aglomerado || pedido;
  if (!material) return { ok: false as const, reason: 'nothing to improve: no failure cluster yet, and no goal was stated', costUsd: 0 };

  const key = store.getApiKey();
  if (!key) return { ok: false as const, reason: 'save the OpenRouter key first', costUsd: 0 };
  const token = ScriptApp.getOAuthToken();
  const own = ScriptApp.getScriptId();
  const agente = loadAgent(id);

  const deps: SuccessorDeps = {
    complete: (messages, model) => {
      // D8: era `8000` cravado — mais do que o crivo pode aceitar. Agora deriva do teto do crivo, e
      // o dono pode baixar (nunca subir) para caber no crédito ou no tamanho esperado do filho.
      try {
        const r = complete(key, model, messages, codeTokens(maxTokens));
        return { text: r.text, costUsd: Number(r.usage?.cost ?? 0), finishReason: r.finish_reason };
      } catch (e) {
        // D9: resposta VAZIA que pode ter custado. Deixar o erro subir pulava `addSpent` — o dinheiro
        // saía e sumia, o oposto da ADR-041 §4. Aqui ela vira texto vazio COM o custo e o motivo, e
        // `generateSuccessor` conta o gasto e recusa dizendo por quê. Qualquer outro erro sobe.
        const x = e as EmptyCompletionError;
        if (x && typeof x.contentShape === 'string') return { text: '', costUsd: Number(x.usage?.cost ?? 0), why: `finish_reason: ${x.finishReason ?? '?'}, content: ${x.contentShape}` };
        throw e;
      }
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
    dailyCap: () => budgetNow().codegenUsd,
    now: () => Date.now(),
  };

  // D1 — A LINHAGEM PASSA A ENCADEAR (P30). Esta linha era `incumbentSource: agente.system` SEMPRE,
  // com um comentário que dizia "na primeira geração" e uma segunda metade que nunca foi escrita: a
  // geração N+1 nunca recebia o código da N. Cada filho era um sorteio novo do mesmo ponto de
  // partida — replicação com variância, não evolução, enquanto a tela dizia evolução.
  //
  // Por RECÊNCIA, não por aptidão: herdar do MELHOR exigiria o filho ter rodado, e rodar exige o
  // clique do dono (portão da plataforma, medido na P24). Por recência a corrente anda sozinha.
  //
  // O fonte vem da API do Apps Script. NUNCA do Drive (ADR-002): a pasta é compartilhável.
  // `bestHeirOf`, não `heirOf`: com aptidão medida, a próxima geração parte do MELHOR filho, não do
  // último. Encadear sozinho é variação sem seleção — a linhagem anda e não sobe. Enquanto nenhum
  // filho tiver nota, ele cai no mais recente, que é a única escolha possível antes da primeira medição.
  const heranca = bestHeirOf(lineage().entries, id);
  const herdado = heranca ? sourceOfChild(deps.api(`https://script.googleapis.com/v1/projects/${heranca}/content`, 'get').full) : null;

  const r = generateSuccessor(
    {
      folderId: id,
      // Sem filho anterior — ou com um fonte que não deu para ler — o PROMPT do titular continua
      // sendo o código vigente. É o comportamento de antes, agora como fallback declarado e não
      // como regra única. Mandar um campo vazio faria o gerador inventar o que estava lá.
      incumbentSource: herdado ?? agente.system,
      material,
      requestedScopes: Array.isArray(requestedScopes) ? requestedScopes.map(String) : [],
      title: `${agente.name} — successor ${new Date().toISOString().slice(0, 10)}`,
      timeZone: Session.getScriptTimeZone(),
    },
    deps,
  );
  if (!r.ok) return { ok: false as const, reason: r.reason, costUsd: r.costUsd };

  writeChildren(props, withChild(readChildren(props), r.child));
  props.setProperty(genStamp(id), String(Date.now())); // o intervalo mínimo conta a partir de AGORA
  // NADA DE JANELA DE ENTREGA NEM DE `KEYSEC:` AQUI. Este bloco armava a entrega da credencial e
  // gravava o segredo por filho para TODO sucessor gerado — e este é o único produtor de filhos, então
  // a janela ficava armada para todos eles, indefinidamente. O filho é `automation`: só código.
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

  // NÃO VOLTA SEGREDO NENHUM. Voltava, para quem cria embutir no fonte do filho e o filho pedir a
  // chave — o caminho que a P27 reprovou e a opção 4 da ADR-040 encerrou. Um campo `secret` que
  // ninguém mais usa seria a promessa sobrevivendo ao mecanismo.
  return { ok: true as const, child: r.child, costUsd: r.costUsd, needsConsent: true, budget: { spentToday: codegenSpentToday(Date.now()), cap: budgetNow().codegenUsd, perRun: CODEGEN_BUDGET_USD } };
}

/** Teto do objetivo declarado pelo dono. Cabe um enunciado de verdade; acima disso, recusa. */
const GOAL_MAX = 2_000;

/** Intervalo declarado entre gerações, por agente. O piso de 1 h é de `intervalOf`, não daqui. */
const genIntervalProp = (folderId: string) => `GENINT:${folderId}`;

/**
 * O DONO declara o intervalo mínimo entre gerações deste agente (gate H2 da F6).
 *
 * Ele não escolhe o piso: `intervalOf` prende em 1 h, e um valor absurdo cai no padrão de 24 h.
 * Quem escreve a Property não decide o mínimo — essa regra é do núcleo, e continua sendo.
 */
export function setAgentInterval(folderId: string, ms: number) {
  assertOwner();
  const id = String(folderId ?? '').trim();
  if (!id) throw new Error('unknown agent');
  PropertiesService.getScriptProperties().setProperty(genIntervalProp(id), String(Number(ms)));
  return { folderId: id, intervalMs: intervalOf(Number(ms)) };
}

// ---------- Aptidão do filho de código (P31, D2) ----------

/** Onde mora a bateria de um agente. Script Property: o PAINEL decide (ADR-021), nunca a pasta. */
const batteryProp = (folderId: string) => `BATTERY:${folderId}`;

/** Teto da bateria. Uma Script Property guarda 9 KB; 50 casos com entrada e esperado curtos cabem. */
const BATTERY_MAX_CASES = 50;
const BATTERY_MAX_CHARS = 8_000;

/**
 * O DONO declara a bateria que define o que é "melhor" para os filhos deste agente.
 *
 * É o portão H5 da F6, e ele é do dono por três razões que se somam: a bateria não pode vir da
 * pasta (ADR-002 — quem editasse a pasta escreveria a prova), não pode vir do gerador (auto-
 * avaliação, arXiv:2310.01798), e define o objetivo — que é decisão de quem manda, não de quem faz.
 */
export function setAgentBattery(folderId: string, casesJson: string) {
  assertOwner();
  const id = String(folderId ?? '').trim();
  if (!id) throw new Error('unknown agent');
  const bruto = String(casesJson ?? '');
  if (bruto.length > BATTERY_MAX_CHARS) throw new Error(`the battery does not fit: ${bruto.length} characters, limit is ${BATTERY_MAX_CHARS}`);
  const casos = parseBattery(bruto);
  if (!casos) throw new Error('the battery must be a non-empty JSON list of { "input": "...", "expected": "..." }, every case complete');
  if (casos.length > BATTERY_MAX_CASES) throw new Error(`too many cases: ${casos.length}, limit is ${BATTERY_MAX_CASES}`);
  PropertiesService.getScriptProperties().setProperty(batteryProp(id), JSON.stringify(casos));
  return { folderId: id, cases: casos.length };
}

/**
 * Mede um filho autorizado contra a bateria do dono, e grava a nota na linhagem.
 *
 * O filho recebe só a ENTRADA de cada caso; o esperado fica aqui. Ele nunca dá a própria nota — é a
 * correção do contrato pedido, que deixaria o avaliado declarar `score: 100` e vencer sem fazer nada.
 *
 * Tudo que não é medição vira `delta: null` COM o motivo no trace: sem bateria, sem URL, sem
 * autorização, sem resposta. Nunca um zero inventado.
 */
export function measureChild(scriptId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const id = String(scriptId ?? '').trim();
  const filho = readChildren(props).find((c) => c.scriptId === id);
  if (!filho) throw new Error('unknown child project');
  const t = runlog.begin('config', { question: `measure ${id}`, agent: 'fitness' });

  const naoMedido = (reason: string) => {
    t.end({ answer: `not measured: ${reason}` });
    return { measured: false as const, delta: null, wins: false, reason };
  };
  if (!filho.url) return naoMedido('the child has no web app URL');
  if (!filho.parent) return naoMedido('the child has no parent agent, so there is no battery to measure it against');
  // H5 FAIL-CLOSED: sem bateria declarada pelo dono não existe "melhor". Inventar uma aqui seria o
  // motor decidindo o objetivo — exatamente o que o portão existe para impedir.
  const bateria = parseBattery(props.getProperty(batteryProp(filho.parent)));
  if (!bateria) return naoMedido('the owner has not declared a battery for this agent yet (gate H5)');

  const sep = filho.url.includes('?') ? '&' : '?';
  const vereditos = bateria.map((c) => {
    try {
      const r = fetchChild(`${filho.url}${sep}input=${encodeURIComponent(c.input)}`);
      return judgeCase(c, r.code, r.body);
    } catch (e) {
      return { verdict: null, reason: `the call failed: ${(e as Error).message.slice(0, 120)}` };
    }
  });
  const nota = scoreRun(vereditos);
  const anteriores = lineage().entries;
  const d = codeDelta(nota, previousScore(anteriores, filho.parent, id));
  props.setProperty(lineageProp, JSON.stringify(withMeasurement(anteriores, id, d, nota)));
  t.end({ answer: nota.measured ? `${nota.passes}/${nota.k} passed; delta ${d.delta === null ? 'null' : d.delta.toFixed(3)}${d.reason ? ` (${d.reason})` : ''}; wins ${d.wins}` : `not measured: ${nota.reason}` });
  return nota.measured ? { measured: true as const, passes: nota.passes, k: nota.k, delta: d.delta, wins: d.wins, reason: d.reason } : { measured: false as const, delta: null, wins: false, reason: nota.reason };
}

/** Pode gerar agora? O intervalo mínimo é trava de custo E de descontrole, não conforto. */
export function mayGenerateNow(folderId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const carimbo = props.getProperty(genStamp(folderId));
  // D4: ISTO ERA `intervalOf(undefined)`, e por isso o intervalo era SEMPRE 24 h. O piso de 1 h e o
  // parâmetro `declaredMs` existiam desde a ADR-038 — e nada declarava. O portão H2 do plano da F6
  // ("baixar o intervalo ao piso no painel") não tinha propriedade, painel, nem caminho nenhum: uma
  // corrida de 3 gerações numa sessão era impossível, porque a segunda esperaria um dia.
  //
  // O piso continua sendo do NÚCLEO: a casca entrega o valor bruto, e `intervalOf` decide. Assim um
  // `0` declarado vira o padrão de 24 h, nunca "sem intervalo".
  const declarado = Number(props.getProperty(genIntervalProp(folderId)));
  const v = mayGenerate(carimbo ? Number(carimbo) : null, intervalOf(Number.isFinite(declarado) ? declarado : undefined), Date.now());
  return { folderId, ok: v.ok, reason: v.reason };
}

// ---------- Teto familiar e entrega da chave (itens 21 e 19) ----------

/**
 * O gasto da FAMÍLIA, e o que fazer quando ele sobe.
 *
 * A conta usa o offset que já conhecíamos e nos custou uma investigação: o OpenRouter reporta uso POR
 * CHAVE, e a família inteira usa a mesma. Então `família − pai = filhos`. É LIMITE SUPERIOR, não medida —
 * qualquer outra coisa usando a chave entra na conta, e o número tem 10 min de defasagem.
 */
/**
 * O gasto dos filhos, sem derrubar nada quando a leitura falha.
 *
 * `null` significa "não sei", e `capAction(null)` é `ok` de propósito: o número é LIMITE SUPERIOR, e
 * punir sobre um limite superior indisponível congelaria o agente do dono por causa de um dado que
 * não existe. Não punir por suspeita é a mesma regra do `authState`.
 */
function familySpendQuiet(): number | null {
  try {
    const c = observe.usageView(store.getApiKey()).check;
    return c.informed === null ? null : childrenSpendUpperBound(c.informed, c.measured);
  } catch {
    return null;
  }
}

export function familySpend() {
  assertOwner();
  // Reusa a conferência que já existe (`usageView`) em vez de recalcular: `measured` é o que o gasclaw
  // gravou (o pai), `informed` é o que o OpenRouter reporta para a CHAVE (a família).
  const c = observe.usageView(store.getApiKey()).check;
  const filhos = c.informed === null ? null : childrenSpendUpperBound(c.informed, c.measured);
  const tetoFamilia = budgetNow().familyUsd;
  return { family: c.informed, parent: c.measured, children: filhos, cap: tetoFamilia, action: capAction(filhos, tetoFamilia), note: FAMILY_NOTE };
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

/**
 * Memória de mentira para o ciclo de sonho: vive em RAM e morre com a execução.
 *
 * Existe porque `runEval` honra `memory: reset` chamando `env.memory.write('')`, e dez cenários do
 * conjunto declaram isso. Apontada para a pasta viva, essa linha apagava a memória curada do dono.
 */
function sandboxMemory(): { read: () => string; write: (t: string) => void; day: (d: string) => string; saveDay: (d: string, t: string) => void; today: () => string; recall: () => string } {
  let curada = '';
  const dias: Record<string, string> = {};
  return {
    read: () => curada,
    write: (t) => void (curada = t),
    day: (d) => dias[d] ?? '',
    saveDay: (d, t) => void (dias[d] = t),
    today: () => new Date().toISOString().slice(0, 10),
    recall: () => curada,
  };
}

/**
 * O ambiente de eval em CAIXA DE AREIA — um só, para o sonho E para a avaliação do sucessor (P34).
 *
 * Duas cópias de um ambiente de segurança divergem em silêncio: uma ganha `google` num conserto, a
 * outra não, e ninguém percebe. Por isso ele mora aqui, e os dois usam o mesmo.
 *
 * Sem `google`: nenhuma ferramenta do Workspace alcança a conta do dono. Sem `bootstrap`:
 * `bootstrap.consume()` mandaria o `BOOTSTRAP.md` vivo para a lixeira. Memória DESCARTÁVEL: o cenário
 * escreve e apaga à vontade sem tocar no `MEMORY.md` curado.
 */
function sandboxEvalEnv(folderId: string, key: string | null, enabled: () => boolean): EvalEnv {
  const tz = Session.getScriptTimeZone();
  return {
    owner: ownerEmail(),
    apiKey: key,
    agent: () => withAccess(loadAgent(folderId), approvedOf(folderId)),
    folderId,
    memory: sandboxMemory(),
    now: () => Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX (EEEE)") + ` fuso ${tz}`,
    llm: (m, messages, defs) => complete(key ?? '', m, messages, 1000, undefined, defs),
    clock: Date.now,
    tickets: cacheTickets(),
    newToken,
    skill: (name) => skillsIO(folderId).body(name),
    enabled,
    sandboxed: true, // ninguém está olhando: o cenário não concede nada
    zone: zone(),
  };
}

/**
 * A porta do SUCESSOR para ser avaliado de fora (P34): roda um cenário e devolve os turnos CRUS, sem
 * veredito nenhum. Quem julga é o pai, com o juiz dele — o avaliado nunca julga a si mesmo.
 *
 * Três guardas, e cada uma fecha um caminho:
 * - **só num sucessor** (tem a semente): um motor comum nunca expõe esta porta;
 * - **só parado**: a avaliação é ANTES da coroa; coroado, ele serve tráfego real;
 * - **só em caixa de areia**: nenhuma ferramenta do Workspace, memória descartável.
 *
 * É o conjunto das três que a deixa dispensar o segredo da CLI, que o pai não tem. O pior que um
 * pedido forjado consegue é gastar o modelo do sucessor numa conversa de mentira — sem tocar a conta.
 *
 * A caixa de areia roda com `enabled: () => true` DE PROPÓSITO: o sucessor está parado, e a pausa
 * existe para barrar tráfego REAL. Sem isso a avaliação antes da coroa seria impossível.
 */
function evalRunForParent(specJson: string) {
  if (!store.isSuccessor()) return { ok: false, status: 403, error: 'only a successor agent answers evalrun' };
  if (store.isEnabled()) return { ok: false, status: 403, error: 'only a PAUSED successor answers evalrun: evaluation happens before the crown' };
  const spec = parseRunSpec(specJson);
  if (!spec) return { ok: false, status: 400, error: 'invalid run spec' };
  const ag = defaultAgent();
  if (!ag) return { ok: false, status: 400, error: 'the successor has no agent to run the scenario with' };
  return { ok: true, trace: runSpec(spec, sandboxEvalEnv(ag.folderId, store.getApiKey(), () => true)) };
}

/**
 * POST no web app de um filho/sucessor, seguindo o 302 do Apps Script — o irmão de `fetchChild`.
 *
 * Mesmas regras: só para `script.google.com`, e a segunda perna SEM o token de 16 escopos. Diferente
 * dele, devolve o corpo INTEIRO: o `RunTrace` é JSON, e cortá-lo em 1.200 caracteres quebraria o parse.
 */
function postChild(url: string, form: Record<string, string>): { code: number; body: string } {
  if (!/^https:\/\/script\.google\.com\//i.test(url)) return { code: 0, body: 'refused: a child URL must be on script.google.com' };
  const res = UrlFetchApp.fetch(url, { method: 'post', payload: form, muteHttpExceptions: true, followRedirects: false, headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` } });
  const h = res.getHeaders() as Record<string, string>;
  const alvo = redirectTarget(res.getResponseCode(), h['Location'] ?? h['location'] ?? null);
  if (alvo) {
    const segunda = UrlFetchApp.fetch(alvo, { muteHttpExceptions: true, followRedirects: false });
    return { code: segunda.getResponseCode(), body: segunda.getContentText() };
  }
  return { code: res.getResponseCode(), body: res.getContentText() };
}

/**
 * Como `postChild`, mas com CORPO JSON e a ação na URL. Para cargas grandes: como campo de formulário,
 * a herança chegava ao doPost do sucessor sem parâmetro nenhum (dev v160, 'got nothing').
 */
function postChildJson(url: string, action: string, body: string): { code: number; body: string } {
  if (!/^https:\/\/script\.google\.com\//i.test(url)) return { code: 0, body: 'refused: a child URL must be on script.google.com' };
  const res = UrlFetchApp.fetch(`${url}?action=${encodeURIComponent(action)}`, { method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true, followRedirects: false, headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` } });
  const h = res.getHeaders() as Record<string, string>;
  const alvo = redirectTarget(res.getResponseCode(), h['Location'] ?? h['location'] ?? null);
  if (alvo) {
    const segunda = UrlFetchApp.fetch(alvo, { muteHttpExceptions: true, followRedirects: false });
    return { code: segunda.getResponseCode(), body: segunda.getContentText() };
  }
  return { code: res.getResponseCode(), body: res.getContentText() };
}

function dreamDeps(): DreamDeps {
  const key = store.getApiKey();
  const tz = Session.getScriptTimeZone();
  return {
    spec: (folderId) => withAccess(loadAgent(folderId), approvedOf(folderId)),
    // O SONHO RODA EM CAIXA DE AREIA. Esta é a correção mais grave dos três ciclos, e o defeito era
    // destruição de dado do dono por gatilho automático:
    //
    // O laço de sonho roda o harness de EVAL, e os evals têm efeito REAL — `e6-agenda` diz, com todas
    // as letras, que "o clique em Aprovar cria o evento real (com Meet) na agenda do dono". No caminho
    // do sonho não há clique: `evalApproves` aprova sozinho. Com `google: gasGoogle` e a pasta VIVA,
    // ligar `dream` fazia o gatilho de 1 minuto criar eventos, documentos, tarefas e rascunhos de
    // verdade na conta do dono — várias vezes por ciclo, 27 cenários de gate por candidato.
    //
    // Pior: dez cenários declaram `memory: reset`, e `runEval` faz `env.memory.write('')`. A memória
    // CURADA do dono era zerada e sobrescrita com lixo de teste ("prefiro café") no primeiro tique.
    // Sem arquivo, sem lixeira, sem desfazer.
    //
    // A caixa de areia é a única resposta: um sonho que precisa tocar a conta do dono para se medir
    // não é um sonho, é um agente agindo sem supervisão com o nome trocado.
    env: (folderId) => sandboxEvalEnv(folderId, key, store.isEnabled), // a chave geral do dono para o sonho também
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
  // O botão do DONO também passa pelo portão: a chave de emergência que não para o que o dono
  // aciona não é chave de emergência, é sugestão.
  const pode = mayAct(folderId, 'dream');
  if (!pode.ok) return { started: false, cycleId: null, reason: pode.reason };
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
  const state = cycleId ? io.load(folderId, cycleId) : null;
  // ITEM 36: o placar vem PRONTO do servidor. Calcular na tela significaria a regra de "venceu" morar
  // em dois lugares — e o dia em que os dois discordassem, o dono acreditaria no que está na frente dele.
  return { folderId, cycleId, state, board: board(state), material: agentMaterial(folderId) };
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
    return { pass: Number.isFinite(hoje) && hoje >= 0, spentTodayUsd: hoje, capUsd: budgetNow().codegenUsd, perRunUsd: CODEGEN_BUDGET_USD, generator: OPUS_MODEL };
  }
  return { pass: false, error: 'steps: scopes, budget' };
}

// A SONDA DA P27 FOI REMOVIDA (2026-09-20). Ela perguntava "o filho consegue chegar ao motor para
// pedir a chave?" e a resposta está medida e registrada na ADR-040: NÃO — o Google recusa o token de
// outro projeto com 401, antes de chegar ao nosso código. Pergunta respondida, sonda encerrada.
//
// Removê-la não é limpeza de estilo: ela gravava `KEYSEC:` e ARMAVA a janela de entrega como efeito
// colateral de medir. Com a rota `childkey` removida, ela mediria um endereço que não existe mais e
// deixaria para trás exatamente o estado que a opção 4 apaga.

/**
 * Sonda da P28: **o contador do item 24 está de fato contando?**
 *
 * A P25 mediu um trace vazio e eu li a medição como escassez de uso. Estava errado: o contador nunca
 * tinha sido ligado. Esta sonda existe para que a MESMA leitura não se repita — ela separa "não houve
 * falha" de "não há instrumento", que era exatamente a confusão que travou quatro itens.
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
const P29_PROP = 'P29_STATE';

/**
 * Sonda da P29 (só no dev): **quantos filhos o dia aceita, e quanto custa um clique?**
 *
 * A [P24](../poc/p24-linhagem-de-codigo/README.md) mediu UM filho: criar 10.754 ms, escrever
 * 1.122 ms, implantar, e o portão humano (`Authorization needed`). O que ela não mediu é o que
 * decide a corrida da F6: a cota do dia, e o tempo de parede de um consentimento.
 *
 * **CUSTO US$ 0.** O código do filho é uma string fixa — o Opus não é chamado. Medir a plataforma
 * antes de pagar o modelo é o que evita descobrir por US$ 15 um limite que custava nada.
 *
 * A leitura mora em `swarm.ts` (núcleo puro, testado e provado por mutação); aqui fica só o I/O.
 */
function pocP29(step?: string): unknown {
  const props = PropertiesService.getScriptProperties();
  const own = ScriptApp.getScriptId();
  const token = ScriptApp.getOAuthToken();
  const api = 'https://script.googleapis.com/v1/projects';
  const estado = () => parseP29State(props.getProperty(P29_PROP));
  const salvar = (s: P29State) => props.setProperty(P29_PROP, JSON.stringify(s));

  const call = (url: string, method: GoogleAppsScript.URL_Fetch.HttpMethod, payload?: unknown) => {
    const t0 = Date.now();
    const res = UrlFetchApp.fetch(url, {
      method,
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${token}` },
      ...(payload ? { payload: JSON.stringify(payload) } : {}),
      muteHttpExceptions: true,
    });
    return { code: res.getResponseCode(), ms: Date.now() - t0, full: res.getContentText() };
  };

  /**
   * Um filho completo: criar, escrever, versionar, implantar. Devolve a linha da medição.
   *
   * O manifesto é o MÍNIMO possível (um escopo) e o código é fixo. A guarda `mayWriteProject` vale
   * mesmo com um id recém-criado: o dia em que ela importar é o dia em que a API devolveu o id do
   * próprio motor, e aí é tarde para descobrir que ninguém checou.
   */
  const nascer = (n: number): BurstRow => {
    const criado = call(api, 'post', { title: `gasclaw poc p29 #${n} ${new Date().toISOString().slice(0, 19)}` });
    let scriptId: string | null = null;
    try {
      scriptId = (JSON.parse(criado.full) as { scriptId?: string }).scriptId ?? null;
    } catch {
      scriptId = null;
    }
    if (!scriptId || criado.code !== 200) return { scriptId: null, code: criado.code, ms: criado.ms };
    if (!mayWriteProject(scriptId, own).ok) return { scriptId: null, code: criado.code, ms: criado.ms };
    const files = [
      { name: 'appsscript', type: 'JSON', source: JSON.stringify({ timeZone: Session.getScriptTimeZone(), runtimeVersion: 'V8', oauthScopes: ['https://www.googleapis.com/auth/calendar.events'], webapp: { executeAs: 'USER_DEPLOYING', access: 'MYSELF' } }) },
      // String FIXA: nenhuma linha deste filho veio de modelo nenhum. É o que torna a POC US$ 0.
      { name: 'Code', type: 'SERVER_JS', source: 'function doGet() { return ContentService.createTextOutput("p29-ok"); }\n' },
    ];
    const escrita = call(`${api}/${scriptId}/content`, 'put', { files });
    if (escrita.code !== 200) return { scriptId: null, code: escrita.code, ms: criado.ms + escrita.ms };
    const ver = call(`${api}/${scriptId}/versions`, 'post', { description: 'p29' });
    const versao = ver.code === 200 ? (JSON.parse(ver.full) as { versionNumber?: number }).versionNumber : undefined;
    const dep = call(`${api}/${scriptId}/deployments`, 'post', { manifestFileName: 'appsscript', description: 'p29', ...(Number.isInteger(versao) ? { versionNumber: versao } : {}) });
    const url = dep.code === 200 ? ((JSON.parse(dep.full) as { entryPoints?: { webApp?: { url?: string } }[] }).entryPoints ?? []).map((e) => e.webApp?.url).find((u) => !!u) ?? null : null;
    const ms = criado.ms + escrita.ms + ver.ms + dep.ms;
    if (dep.code !== 200 || !url) return { scriptId: null, code: dep.code, ms };
    // O instante da IMPLANTAÇÃO é o marco zero da espera do C3: é daqui que o dono passa a poder clicar.
    salvar(withCreated(estado(), scriptId, Date.now()));
    const lista = readChildren(props);
    writeChildren(props, withChild(lista, { scriptId, kind: 'automation', title: `p29 #${n}`, url, scopes: ['https://www.googleapis.com/auth/calendar.events'], folderId: null, parent: defaultAgent()?.folderId ?? null, reason: 'POC P29: platform ceiling, no model involved', at: Date.now() }));
    return { scriptId, code: 200, ms };
  };

  if (step === 'burst') {
    // C1: cinco em sequência. A P24 mediu ~12,7 s por filho; cinco cabem folgados nos 6 minutos.
    const linhas: BurstRow[] = [];
    for (let i = 1; i <= 5; i++) {
      const r = nascer(estado().ids.length + 1);
      linhas.push(r);
      if (r.code === 429) {
        salvar(withRefusal(estado(), estado().ids.length + 1, 429));
        break; // insistir depois de um 429 não mede nada novo e só empilha recusa
      }
    }
    return { ...burstReading(linhas), rows: linhas.map((r) => ({ code: r.code, ms: r.ms, created: !!r.scriptId })) };
  }

  if (step === 'quota') {
    // C2: continua de onde parou, até o teto DA SONDA. Cada chamada avança o que couber em 6 min e
    // devolve o parcial — o estado vive na Property justamente porque a execução morre antes da cota.
    const inicio = Date.now();
    const ORCAMENTO_MS = 4 * 60 * 1000; // margem contra o corte de 6 min: um corte perderia a contagem
    let s = estado();
    while (s.ids.length < P29_MAX_CREATES && s.refusedAt === null && Date.now() - inicio < ORCAMENTO_MS) {
      const r = nascer(s.ids.length + 1);
      if (r.code !== 200 || !r.scriptId) {
        salvar(withRefusal(estado(), s.ids.length + 1, r.code));
        s = estado();
        break;
      }
      s = estado();
    }
    const leitura = quotaReading(s.ids.length, s.refusedAt, s.refusedCode);
    const cabe = s.ids.length >= P29_MAX_CREATES || s.refusedAt !== null;
    return { ...leitura, done: cabe, ...(cabe ? {} : { next: 'the 6-minute limit stopped this pass, not the quota: run `./gasclaw poc p29 quota` again to continue' }) };
  }

  if (step === 'consent') {
    // C3: NÃO espera pelo dono — lê o que já aconteceu. Esperar dentro da execução queimaria os 6
    // minutos num relógio, e o clique é dele, no tempo dele.
    const s = estado();
    const linhas: ConsentRow[] = s.ids.map((id) => {
      const c = readChildren(props).find((x) => x.scriptId === id);
      let autorizado = false;
      try {
        const probe = c?.url ? fetchChild(c.url) : null;
        autorizado = authState(c?.url ?? null, probe?.code ?? null, probe?.body ?? null) === 'authorized';
      } catch {
        autorizado = false; // erro de rede não é autorização: fail-closed, como o `authState`
      }
      return { scriptId: id, deployedAt: s.deployedAt[id] ?? 0, authorized: autorizado };
    });
    return consentReading(linhas, Date.now());
  }

  if (step === 'adopt') {
    // DEFEITO DE ESCRITURAÇÃO DESTA SONDA: ela registrava os filhos com `parent: null`. Um filho é
    // criado pelo ambiente EM NOME de um agente, e sem esse vínculo a bateria do dono não o alcança —
    // `measureChild` recusa com "no parent agent". Os 20 já criados ficam adotados aqui, para a
    // medição poder ser provada no ambiente real sem gastar Opus nenhum.
    const dono = defaultAgent()?.folderId ?? null;
    if (!dono) return { pass: false, error: 'no active agent to adopt these children' };
    const lista = readChildren(props);
    const meus = estado().ids;
    writeChildren(props, lista.map((c) => (meus.includes(c.scriptId) && !c.parent ? { ...c, parent: dono } : c)));
    const n = readChildren(props).filter((c) => meus.includes(c.scriptId) && c.parent === dono).length;
    return { pass: n === meus.length, adopted: n, of: meus.length, parent: dono, reading: `${n} of ${meus.length} probe children now name the agent that owns the battery` };
  }

  if (step === 'cleanup') {
    // C4: tirar do painel NÃO basta. `forgetChild` só apaga a linha da tela, e o projeto continua na
    // conta do dono — vinte projetos de sonda viram vinte exclusões manuais. Aqui eles vão para a
    // LIXEIRA do Drive (reversível, e o dono pode restaurar), e só os ids que ESTA sonda criou.
    const s = estado();
    const resultado = s.ids.map((id) => {
      try {
        DriveApp.getFileById(id).setTrashed(true);
        forgetChild(id);
        return { scriptId: id, trashed: true };
      } catch (e) {
        return { scriptId: id, trashed: false, error: (e as Error).message.slice(0, 120) };
      }
    });
    const n = resultado.filter((r) => r.trashed).length;
    props.deleteProperty(P29_PROP);
    return { pass: n === s.ids.length, trashed: n, of: s.ids.length, children: resultado, reading: `${n} of ${s.ids.length} child projects moved to your Drive trash (reversible) and removed from the panel` };
  }

  // Ler sem mexer: o passo que responde de onde a sonda continua. Sem aspas na frase de propósito —
  // aspas dentro de comentário são o ponto cego do detector de idioma, e um falso vermelho ali custa
  // mais caro do que a frase vale.
  if (step === 'state') return { pass: true, ...estado() };

  return { pass: false, error: 'steps: burst, quota, consent, adopt, cleanup, state' };
}

// ---------- F7: o AGENTE sucessor por patch (ADR-043) ----------
//
// O Opus recebe o código do agente, devolve um patch com a explicação do que melhorou, e o patch vira
// um agente implantado em OUTRO projeto, parado. O pai o avalia de fora, com o juiz dele; o dono lê o
// diff, a explicação e a nota, e coroa. Tudo o que decide mora em `succession.ts`; aqui só há I/O.

const SCRIPT_API = 'https://script.googleapis.com/v1/projects';

type ProjectFile = { name: string; type: string; source: string };
type ScriptCall = (url: string, method: GoogleAppsScript.URL_Fetch.HttpMethod, payload?: unknown) => { code: number; full: string };

function scriptCall(token: string): ScriptCall {
  return (url, method, payload) => {
    const res = UrlFetchApp.fetch(url, { method, contentType: 'application/json', headers: { Authorization: `Bearer ${token}` }, ...(payload ? { payload: JSON.stringify(payload) } : {}), muteHttpExceptions: true });
    return { code: res.getResponseCode(), full: res.getContentText() };
  };
}

/** O código deste motor, pela API do Apps Script — NUNCA pelo Drive (ADR-002). */
function readOwnFiles(call: ScriptCall, own: string): ProjectFile[] {
  const lido = call(`${SCRIPT_API}/${own}/content`, 'get');
  if (lido.code !== 200) throw new Error(`could not read this project's own code: HTTP ${lido.code}`);
  return ((JSON.parse(lido.full) as { files?: ProjectFile[] }).files ?? []).map((f) => ({ name: f.name, type: f.type, source: f.source }));
}

type Deployed = { ok: true; scriptId: string; url: string; version: number } | { ok: false; stage: string; reason: string };

/**
 * Escreve os arquivos num projeto, versiona e implanta. Com `slot`, ATUALIZA a implantação que já existe
 * — mesmo projeto, mesmo endereço: o vínculo do GCP, a autorização e a chave são do projeto, não do
 * código, e ficam. Sem `slot`, cria um projeto novo.
 */
function deployAgentProject(call: ScriptCall, own: string, files: ProjectFile[], title: string, slot: { scriptId: string; url: string } | null): Deployed {
  let scriptId = slot?.scriptId ?? null;
  if (!scriptId) {
    const criado = call(SCRIPT_API, 'post', { title });
    scriptId = criado.code === 200 ? ((JSON.parse(criado.full) as { scriptId?: string }).scriptId ?? null) : null;
    if (!scriptId) return { ok: false, stage: 'create', reason: `HTTP ${criado.code}: ${criado.full.slice(0, 200)}` };
  }
  // Ninguém escreve no próprio projeto — nem com um slot que, por engano, apontasse para cá.
  const guarda = mayWriteProject(scriptId, own);
  if (!guarda.ok) return { ok: false, stage: 'guard', reason: guarda.reason };
  const escrita = call(`${SCRIPT_API}/${scriptId}/content`, 'put', { files });
  if (escrita.code !== 200) return { ok: false, stage: 'write', reason: `HTTP ${escrita.code}: ${escrita.full.slice(0, 300)}` };
  const ver = call(`${SCRIPT_API}/${scriptId}/versions`, 'post', { description: 'successor agent' });
  const versao = ver.code === 200 ? (JSON.parse(ver.full) as { versionNumber?: number }).versionNumber : undefined;
  if (!Number.isInteger(versao)) return { ok: false, stage: 'version', reason: `HTTP ${ver.code}: ${ver.full.slice(0, 200)}` };
  if (slot) {
    // A implantação do web app, não a HEAD: é ela que responde no endereço que o dono autorizou.
    const lista = call(`${SCRIPT_API}/${scriptId}/deployments`, 'get');
    const web = ((JSON.parse(lista.full) as { deployments?: { deploymentId: string; deploymentConfig?: { versionNumber?: number } }[] }).deployments ?? []).find((d) => d.deploymentConfig?.versionNumber !== undefined);
    if (!web) return { ok: false, stage: 'find-deployment', reason: 'the successor has no versioned web app deployment' };
    const atual = call(`${SCRIPT_API}/${scriptId}/deployments/${web.deploymentId}`, 'put', { deploymentConfig: { versionNumber: versao, manifestFileName: 'appsscript', description: 'successor agent' } });
    if (atual.code !== 200) return { ok: false, stage: 'update-deployment', reason: `HTTP ${atual.code}: ${atual.full.slice(0, 300)}` };
    return { ok: true, scriptId, url: slot.url, version: versao as number };
  }
  const dep = call(`${SCRIPT_API}/${scriptId}/deployments`, 'post', { versionNumber: versao, manifestFileName: 'appsscript', description: 'successor agent' });
  const url = dep.code === 200 ? ((JSON.parse(dep.full) as { entryPoints?: { webApp?: { url?: string } }[] }).entryPoints ?? []).map((e) => e.webApp?.url).find((u) => !!u) ?? null : null;
  if (!url) return { ok: false, stage: 'deploy', reason: `HTTP ${dep.code}: ${dep.full.slice(0, 200)}` };
  return { ok: true, scriptId, url, version: versao as number };
}

/** A semente que o pai escreve no sucessor: nascer parado e saber qual agente servir. Nada secreto. */
const successorSeedFile = (own: string): ProjectFile => ({ name: 'successor_seed', type: 'SERVER_JS', source: seedSource({ bornDisabled: true, parent: own, agents: store.listAgents(), at: Date.now(), parentUrl: appUrl() }) });

const readSuccessors = (props: GoogleAppsScript.Properties.Properties): SuccessorRecord[] => readSuccessorsFrom(props.getProperties());

const saveSuccessor = (props: GoogleAppsScript.Properties.Properties, rec: SuccessorRecord): void => {
  for (const { prop, value } of successorWrites(props.getProperties(), rec)) {
    if (value === null) props.deleteProperty(prop);
    else props.setProperty(prop, value);
  }
};

/**
 * O sucessor da P33 foi implantado antes do registro existir. Ele entra como slot do agente padrão —
 * é o projeto que o dono já vinculou, autorizou e configurou, e reusá-lo poupa os três atos de novo.
 */
function legacySlot(props: GoogleAppsScript.Properties.Properties, folderId: string): { scriptId: string; url: string } | null {
  if (defaultAgent()?.folderId !== folderId) return null;
  const s = JSON.parse(props.getProperty('P33_SUCCESSOR') ?? 'null') as { scriptId?: string; url?: string } | null;
  if (!s?.scriptId || !s.url) return null;
  return readSuccessors(props).some((r) => r.scriptId === s.scriptId) ? null : { scriptId: s.scriptId, url: s.url };
}

/**
 * Um slot só recebe código novo se estiver PARADO. Escrever num sucessor ligado trocaria o motor que já
 * responde ao dono sem coroa nenhuma. Autorização pendente pode receber (ele ainda não roda); leitura
 * que falhou, não: na dúvida, não se escreve num motor que talvez esteja respondendo.
 */
function slotWritable(url: string): { ok: true } | { ok: false; reason: string } {
  let r: { code: number; body: string };
  try {
    r = fetchChild(`${url}?action=health`);
  } catch (e) {
    return { ok: false, reason: `could not read the successor before writing into it: ${(e as Error).message}` };
  }
  const estado = authState(url, r.code, r.body);
  if (estado === 'needs-consent') return { ok: true };
  if (estado !== 'authorized') return { ok: false, reason: `could not read the successor before writing into it (HTTP ${r.code})` };
  try {
    const h = JSON.parse(r.body) as { enabled?: boolean };
    return h.enabled === false ? { ok: true } : { ok: false, reason: 'the successor is RUNNING: pause it in its panel first — new code does not go into an engine that answers without a crown' };
  } catch {
    return { ok: false, reason: 'the successor answered something that is not its health JSON' };
  }
}

/** Teto da resposta do Opus, e a parte dele reservada para pensar (medido na P32: sem ela, `length` com conteúdo nulo). */
const SUCCESSOR_MAX_TOKENS = 16_000;
const SUCCESSOR_REASONING = 8_000;
const OPUS_USD_PER_M = { in: 5, out: 25 };

/**
 * Escreve o AGENTE sucessor: o Opus recebe o código deste motor e devolve um patch; o patch vira um
 * agente implantado em outro projeto, PARADO. Não coroa ninguém — isso é `crownSuccessor`, depois da
 * avaliação de fora e do clique do dono.
 */
export function writeSuccessor(folderId: string, goal?: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const id = String(folderId ?? '').trim();
  if (!id) throw new Error('unknown agent');
  const v = mayAct(id, 'succeed');
  if (!v.ok) return { ok: false as const, reason: v.reason, costUsd: 0 };
  const intervalo = mayGenerateNow(id);
  if (!intervalo.ok) return { ok: false as const, reason: intervalo.reason, costUsd: 0 };
  const pedido = String(goal ?? '').trim();
  if (pedido.length > GOAL_MAX) throw new Error(`the goal is too long to send whole: ${pedido.length} characters, limit is ${GOAL_MAX}. Shorten it — cutting it here would judge the generator by rules it never received`);
  const key = store.getApiKey();
  if (!key) return { ok: false as const, reason: 'save the OpenRouter key first', costUsd: 0 };

  const own = ScriptApp.getScriptId();
  const call = scriptCall(ScriptApp.getOAuthToken());
  const registrado = slotFor(readSuccessors(props), id);
  const slot = registrado ? { scriptId: registrado.scriptId, url: registrado.url } : legacySlot(props, id);
  if (slot) {
    // As duas recusas vêm ANTES do Opus: descobri-las depois de pagar a geração seria jogar dinheiro fora.
    const guarda = mayWriteProject(slot.scriptId, own);
    if (!guarda.ok) return { ok: false as const, reason: guarda.reason, costUsd: 0 };
    const w = slotWritable(slot.url);
    if (!w.ok) return { ok: false as const, reason: w.reason, costUsd: 0 };
  }

  // A semente deste motor (quando ele mesmo é sucessor) não vai ao Opus: não é código dele, e o pai
  // escreve uma nova para o filho.
  const originais = readOwnFiles(call, own).filter((f) => f.name !== 'successor_seed');
  const arquivos = originais.map((f) => ({ name: f.name, source: f.source }));

  // PRÉ-TESTE COM A ESTIMATIVA MEDIDA (P32: 2,25 caracteres por token). O teto do dia vale para cada
  // geração, e o sucessor pode gerar o próprio sucessor (decisão 2) — é aqui que isso para.
  const chars = arquivos.reduce((n, f) => n + f.source.length, 0);
  const estimativa = (chars / 2.25) * OPUS_USD_PER_M.in / 1e6 + SUCCESSOR_MAX_TOKENS * OPUS_USD_PER_M.out / 1e6;
  const gasto = codegenSpentToday(Date.now());
  const teto = budgetNow().codegenUsd;
  if (gasto + estimativa > teto) return { ok: false as const, reason: `this generation could cost up to US$ ${estimativa.toFixed(2)} and US$ ${gasto.toFixed(2)} of US$ ${teto.toFixed(2)} are already spent today`, costUsd: 0 };

  let texto = '';
  let custo = 0;
  let fim: string | undefined;
  try {
    const r = complete(key, OPUS_MODEL, patchMessages(arquivos, pedido), SUCCESSOR_MAX_TOKENS, undefined, [], undefined, { max_tokens: SUCCESSOR_REASONING });
    texto = r.text;
    custo = Number(r.usage?.cost ?? 0);
    fim = r.finish_reason;
  } catch (e) {
    // D9: resposta VAZIA que pode ter custado. O custo entra, e a recusa diz por quê.
    const x = e as EmptyCompletionError;
    if (!(x && typeof x.contentShape === 'string')) throw e;
    custo = Number(x.usage?.cost ?? 0);
    fim = x.finishReason;
  }
  // O dinheiro saiu: conta ANTES de qualquer veredito (ADR-041 §4).
  props.setProperty(codegenDayProp(Date.now()), String(codegenSpentToday(Date.now()) + custo));
  props.setProperty(genStamp(id), String(Date.now())); // o intervalo conta a partir da tentativa paga
  // D7: o corte é decidido pelo `finish_reason`, não pela forma do texto.
  if (fim === 'length') return { ok: false as const, reason: `the generator was cut off (finish_reason: length) — nothing was deployed`, costUsd: custo };
  if (!texto) return { ok: false as const, reason: `the generator returned nothing (finish_reason: ${fim ?? '?'}) — nothing was deployed`, costUsd: custo };

  const prep = prepareSuccessor(arquivos, texto);
  if (!prep.ok) return { ok: false as const, reason: prep.reason, costUsd: custo };
  const tipo = (n: string) => originais.find((f) => f.name === n)?.type ?? 'SERVER_JS';
  const files: ProjectFile[] = [...prep.files.map((f) => ({ name: f.name, type: tipo(f.name), source: f.source })), successorSeedFile(own)];
  const agente = loadAgent(id);
  const dep = deployAgentProject(call, own, files, `${agente.name} — successor agent ${new Date().toISOString().slice(0, 10)}`, slot);
  if (!dep.ok) return { ok: false as const, reason: `${dep.stage}: ${dep.reason}`, costUsd: custo };

  const rec: SuccessorRecord = { scriptId: dep.scriptId, url: dep.url, folderId: id, at: Date.now(), model: OPUS_MODEL, explanation: prep.explanation, changes: prep.changes, costUsd: custo, evaluation: null, crownedAt: null };
  saveSuccessor(props, rec);
  const anterior = lineage().entries;
  const entrada: LineageEntry = {
    at: Date.now(),
    kind: 'codegen',
    parent: id,
    child: dep.scriptId,
    generation: nextGeneration('codegen', anterior.filter((e) => e.parent === id).map((e) => e.generation)[0] ?? 1),
    delta: null, // nada foi medido: a avaliação de fora vem depois
    costUsd: custo,
    summary: `successor AGENT patched by ${OPUS_MODEL} (${prep.changes.length} change(s)): ${prep.explanation.slice(0, 160)}`,
  };
  props.setProperty(lineageProp, JSON.stringify([...anterior, entrada].slice(-100)));
  return {
    ok: true as const,
    scriptId: dep.scriptId,
    url: dep.url,
    version: dep.version,
    reused: !!slot,
    explanation: prep.explanation,
    changes: prep.changes,
    costUsd: custo,
    next: slot
      ? 'same project and address: the GCP link, the authorization and the key stayed. Evaluate it from here before crowning.'
      : 'a new project: link it to the parent GCP project, authorize it once, paste the OpenRouter key in its panel — then evaluate it from here.',
  };
}

/**
 * O PAI avalia o sucessor de fora (P34): manda cada cenário ao web app dele só como `RunSpec` (sem juiz,
 * rubrica nem verificações), roda o MESMO cenário aqui, e julga os dois com o `judgeRun` DELE.
 */
function evaluateFromOutside(url: string, folderId: string, key: string, n?: number): Evaluation & { rows: EvalRow[]; ms: number } {
  const envPai = sandboxEvalEnv(folderId, key, () => true);
  const nomes = P34_SCENARIOS.filter((x) => scenarioMd(x) !== null).slice(0, n && n > 0 ? n : P34_SCENARIOS.length);
  const t0 = Date.now();
  const rows: EvalRow[] = [];
  for (const nome of nomes) {
    if (Date.now() - t0 > 270_000) break; // margem contra o corte de 6 min: parar é melhor que perder tudo
    const cenario = parseScenario(scenarioMd(nome) as string);
    const spec = toRunSpec(cenario);
    const r = postChild(url, { action: 'evalrun', spec: JSON.stringify(spec) });
    let trace: RunTrace | null = null;
    let erro = '';
    let vazou = false;
    try {
      const j = JSON.parse(r.body) as { ok?: boolean; trace?: RunTrace & Record<string, unknown>; error?: string };
      if (j.ok && j.trace) {
        trace = j.trace;
        // O sucessor devolveu TURNOS, não um veredito. Um `pass` ou `checks` aqui seria ele se julgando.
        vazou = 'pass' in j.trace || 'checks' in j.trace || 'judge' in j.trace;
      } else erro = j.error ?? 'the successor refused';
    } catch {
      erro = `HTTP ${r.code}: the successor answered something that is not JSON`;
    }
    const titular = runSpec(spec, envPai);
    rows.push({ name: nome, successor: trace ? judgeRun(cenario, trace, envPai).pass : null, incumbent: judgeRun(cenario, titular, envPai).pass, ...(erro ? { error: erro } : {}), ...(vazou ? { verdictLeaked: true } : {}) });
  }
  const medidos = rows.filter((l) => l.successor !== null);
  return {
    successorPasses: medidos.filter((l) => l.successor).length,
    incumbentPasses: medidos.filter((l) => l.incumbent).length,
    k: medidos.length,
    complete: rows.length === nomes.length && medidos.length === rows.length,
    verdictLeaked: rows.some((l) => l.verdictLeaked),
    rows,
    ms: Date.now() - t0,
  };
}

/** Avalia um sucessor registrado e guarda a nota junto dele — é o que a coroa vai ler. */
export function evaluateSuccessor(scriptId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const rec = readSuccessors(props).find((r) => r.scriptId === String(scriptId ?? '').trim());
  if (!rec) return { ok: false as const, reason: 'unknown successor' };
  if (rec.crownedAt !== null) return { ok: false as const, reason: 'this successor was already crowned' };
  const key = store.getApiKey();
  if (!key) return { ok: false as const, reason: 'save the OpenRouter key first' };
  const { ms, ...ev } = evaluateFromOutside(rec.url, rec.folderId, key);
  const evaluation = { ...ev, at: Date.now() };
  saveSuccessor(props, { ...rec, evaluation });
  return { ok: true as const, evaluation, ms, verdict: crownVerdict(evaluation) };
}

/**
 * A COROA — o portão humano da F7. O dono leu o diff, a explicação e a nota, e clicou.
 *
 * O titular para PRIMEIRO: se a coroa falhar, ele volta. A ordem contrária deixaria, por um instante ou
 * para sempre, dois motores respondendo pelo mesmo agente.
 */
export function crownSuccessor(scriptId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const rec = readSuccessors(props).find((r) => r.scriptId === String(scriptId ?? '').trim());
  if (!rec) return { ok: false as const, reason: 'unknown successor' };
  if (rec.crownedAt !== null) return { ok: false as const, reason: 'this successor was already crowned' };
  // O HEALTH INTEIRO, não só a nota: a coroa pausa o motor que hoje funciona, e só vale se o sucessor
  // consegue de fato servir o agente — todas as checagens, lidas AGORA.
  const saude = healthOf(rec);
  // A COROA PELA METADE: o sucessor já responde e todo o resto passa. Coroar aqui não cria dois motores —
  // termina os dois que já existem. Qualquer outra checagem reprovada continua travando.
  const metade = halfCrowned(saude.checks);
  if (!saude.ok && !metade) return { ok: false as const, reason: `the successor is not ready: ${saude.checks.filter((c) => !c.ok).map((c) => `${c.label} — ${c.detail}`).join('; ')}`, checks: saude.checks };
  const veredito = crownVerdict(rec.evaluation);
  if (!veredito.ok) return { ok: false as const, reason: veredito.reason };
  // A HERANÇA vem ANTES de ligar: um sucessor que assume sem as permissões do pai responderia ao dono
  // sem as ferramentas que ele aprovou. Falhou → nada muda, nem aqui nem lá.
  const herdou = handOver(rec);
  if (!herdou.ok) return { ok: false as const, reason: `the successor did not take the agent's settings: ${herdou.reason}` };
  const antes = store.isEnabled();
  store.setEnabled(false);
  if (!metade) {
    let resposta: { ok?: boolean; error?: string } | null = null;
    try {
      resposta = JSON.parse(postChild(rec.url, { action: 'crown', parent: ScriptApp.getScriptId() }).body);
    } catch {
      resposta = null; // resposta perdida ou ilegível: quem decide é o estado do sucessor, lido abaixo
    }
    // DEPOIS DE MANDAR, LÊ O ESTADO. Achado ao vivo (dev v153): o sucessor ligou, a resposta não chegou
    // legível, e o pai voltou a rodar — dois motores. Decidir pela resposta era o defeito.
    if (!crownLanded(resposta, successorEnabled(rec.url))) {
      store.setEnabled(antes);
      const motivo = resposta?.error ? ` (${resposta.error})` : '';
      return { ok: false as const, reason: `the successor did not take the crown${motivo}. It is still paused, and this engine is running again.` };
    }
  }
  saveSuccessor(props, { ...rec, crownedAt: Date.now() });
  const anterior = lineage().entries;
  props.setProperty(lineageProp, JSON.stringify([...anterior, { at: Date.now(), kind: 'succession', parent: rec.folderId, child: rec.scriptId, generation: nextGeneration('succession', anterior.filter((e) => e.parent === rec.folderId).map((e) => e.generation)[0] ?? 1), delta: rec.evaluation ? rec.evaluation.successorPasses - rec.evaluation.incumbentPasses : null, costUsd: 0, summary: `crowned the successor agent (${veredito.standing})` } as LineageEntry].slice(-100)));
  return { ok: true as const, standing: veredito.standing, url: rec.url, next: 'this engine is paused and the successor answers now. Port the change to src with `./gasclaw succession pull`, or the next deploy erases it.' };
}

/**
 * No SUCESSOR: a coroa chega do pai — só do pai que a semente nomeia. Um motor sem semente não tem pai
 * (`successorOf()` é `null`), e nenhum `parent` é igual a `null`: a mesma linha recusa os dois casos.
 */
function crownFromParent(parent: string) {
  if (parent !== store.successorOf()) return { ok: false, status: 403, error: 'only the parent named in the seed crowns this engine' };
  // O WORKER antes de ligar: sem o gatilho de 1 minuto, o agente coroado aceitaria mensagens e nunca as
  // responderia. Não criou → recusa, e o pai volta a rodar.
  const gatilho = observe.ensureTrigger();
  if (gatilho !== 'active') return { ok: false, status: 409, error: `the 1-minute worker could not be created (${gatilho})` };
  store.setEnabled(true);
  return { ok: true };
}

/** As permissões que a 10ª checagem compara: quem conversa e com que tools, capacidades, e o estado. */
const SETTINGS_KEYS = ['ACCESS:', 'CAP:', 'STATUS:'];

/** No SUCESSOR: o que ele diz de si mesmo para o pai decidir a coroa. Nada secreto: só estados. */
function readinessSelf() {
  const ag = defaultAgent();
  let leitura = { ok: false, detail: 'there is no agent to serve' };
  if (ag) {
    try {
      // SEM CACHE: a pergunta é se o Drive responde AGORA (o 403 do GCP não vinculado aparece aqui).
      const a = loadAgent(ag.folderId, { noCache: true });
      leitura = a.system ? { ok: true, detail: `read the folder of ${ag.name}` } : { ok: false, detail: 'the agent folder has no prompt' };
    } catch (e) {
      leitura = { ok: false, detail: (e as Error).message.slice(0, 200) };
    }
  }
  const props = PropertiesService.getScriptProperties();
  const settings = ag ? Object.fromEntries(SETTINGS_KEYS.map((k) => [`${k}${ag.folderId}`, props.getProperty(`${k}${ag.folderId}`)])) : {};
  return { ok: true, self: { seedParent: store.successorOf(), enabled: store.isEnabled(), hasKey: !!store.getApiKey(), authRequired: authStatus().required, agentReadable: leitura, trigger: observe.triggerStatus(true), settings } };
}

/** No PAI: as 9 checagens da coroa, lidas agora — consentimento, o health profundo e o código implantado. */
function healthOf(rec: SuccessorRecord) {
  const own = ScriptApp.getScriptId();
  let estado = 'unknown';
  try {
    const r = fetchChild(`${rec.url}?action=health`);
    estado = authState(rec.url, r.code, r.body);
  } catch {
    estado = 'unknown'; // fora do ar não é permissão
  }
  let self: SuccessorSelf | null = null;
  if (estado === 'authorized') {
    try {
      const j = JSON.parse(postChild(rec.url, { action: 'readiness' }).body) as { ok?: boolean; self?: SuccessorSelf };
      if (j.ok && j.self) self = j.self;
    } catch {
      self = null; // um sucessor antigo, sem a porta, não responde: todas as checagens dele reprovam
    }
  }
  let code: { ok: boolean; reason: string } | null = null;
  try {
    const call = scriptCall(ScriptApp.getOAuthToken());
    const lido = call(`${SCRIPT_API}/${rec.scriptId}/content`, 'get');
    if (lido.code === 200) {
      const filho = ((JSON.parse(lido.full) as { files?: ProjectFile[] }).files ?? []).map((f) => ({ name: f.name, source: f.source }));
      // Coroado: o patch dele já está no src do pai (Fase 3) e o sync leva o build de hoje — então o código
      // certo é o do pai SEM patch nenhum. Antes da coroa, é o do pai MAIS o patch do registro.
      code = codeMatches(readOwnFiles(call, own).map((f) => ({ name: f.name, source: f.source })), filho, rec.crownedAt !== null ? [] : rec.changes);
    }
  } catch {
    code = null;
  }
  const props = PropertiesService.getScriptProperties();
  const parentSettings = Object.fromEntries(SETTINGS_KEYS.map((k) => [`${k}${rec.folderId}`, props.getProperty(`${k}${rec.folderId}`)]));
  return crownReadiness({ parentId: own, authState: estado, self, code, record: rec, crowned: rec.crownedAt !== null, parentSettings });
}

/**
 * No SUCESSOR: grava o que o pai mandou — só do pai da semente, e só a lista fechada de `inheritable`
 * (o mesmo filtro do pai, aplicado de novo: um erro de um lado só não entrega segredo).
 */
function inheritFromParent(raw: string) {
  // CORPO JSON, não campo de formulário: como formulário grande o pai chegava vazio ('got nothing').
  let pedido: { parent?: string; entries?: Record<string, string> };
  try {
    pedido = JSON.parse(raw) as { parent?: string; entries?: Record<string, string> };
  } catch {
    return { ok: false, status: 400, error: 'the inheritance is not valid JSON' };
  }
  const parent = String(pedido?.parent ?? '');
  if (parent !== store.successorOf()) {
    // O diagnóstico diz O QUE chegou (8 caracteres de um id, não segredo): foi assim que se viu, ao vivo,
    // se o problema era o pai errado ou o parâmetro que não chegou.
    const chegou = parent ? parent.slice(0, 8) : 'nothing';
    return { ok: false, status: 403, error: `only the parent named in the seed can hand its agent over (got ${chegou})` };
  }
  // minimal: grava sempre que o pai da semente manda — o dono já provou quem é pelo token, e só as
  // chaves do agente passam. Rodar de novo depois de dias sobrescreve o que o filho mudou: é ato explícito.
  // `inheritable` já ignora o que não for objeto de textos: nenhuma checagem a mais aqui.
  const { entries, refused } = inheritable(pedido.entries ?? {});
  PropertiesService.getScriptProperties().setProperties(entries);
  return { ok: true, written: Object.keys(entries).length, refused };
}

/** No PAI: manda ao sucessor as chaves do agente. Devolve se ele aceitou. */
function handOver(rec: SuccessorRecord): { ok: boolean; written: number; reason: string } {
  const { entries } = inheritable(PropertiesService.getScriptProperties().getProperties());
  const corpo = JSON.stringify(entries);
  try {
    const j = JSON.parse(postChildJson(rec.url, 'handover', `{"parent":${JSON.stringify(ScriptApp.getScriptId())},"entries":${corpo}}`).body) as { ok?: boolean; written?: number; error?: string };
    const recusa = `${j.error ?? 'the successor refused the inheritance'} [sent ${Object.keys(entries).length} keys, ${corpo.length} characters]`;
    return j.ok ? { ok: true, written: j.written ?? 0, reason: '' } : { ok: false, written: 0, reason: recusa };
  } catch (e) {
    return { ok: false, written: 0, reason: `could not reach the successor: ${String((e as Error)?.message ?? e).slice(0, 200)}` };
  }
}

/** O dono entrega ao sucessor as permissões, capacidades, agenda e histórico do pai — nunca segredo. */
export function inheritSuccessor(scriptId: string) {
  assertOwner();
  const rec = readSuccessors(PropertiesService.getScriptProperties()).find((r) => r.scriptId === String(scriptId ?? '').trim());
  if (!rec) return { ok: false as const, reason: 'unknown successor' };
  const h = handOver(rec);
  return h.ok ? { ok: true as const, written: h.written } : { ok: false as const, reason: h.reason };
}

/** O sucessor está ligado? Lido pela porta de readiness; nulo quando não deu para ler, e aí ninguém presume. */
function successorEnabled(url: string): boolean | null {
  try {
    const j = JSON.parse(postChild(url, { action: 'readiness' }).body) as { ok?: boolean; self?: SuccessorSelf };
    return j.ok && j.self ? j.self.enabled === true : null;
  } catch {
    return null;
  }
}

/** O health da coroa de um sucessor registrado, para o painel e a CLI. */
export function successorHealth(scriptId: string) {
  assertOwner();
  const rec = readSuccessors(PropertiesService.getScriptProperties()).find((r) => r.scriptId === String(scriptId ?? '').trim());
  if (!rec) return { ok: false as const, reason: 'unknown successor', checks: [] as ReadinessCheck[] };
  const h = healthOf(rec);
  return { scriptId: rec.scriptId, crowned: rec.crownedAt !== null, ...h, halfCrowned: halfCrowned(h.checks) };
}

/**
 * REBASE: o mesmo patch, reaplicado sobre o código ATUAL deste motor e reimplantado no mesmo projeto —
 * sem chamar o Opus. É o que fazer quando este motor mudou depois da geração (um `up` novo): coroar o
 * sucessor antigo desfaria essas mudanças. Passa pelo MESMO crivo da escrita, e a avaliação anterior
 * deixa de valer (o código avaliado não é mais o que está lá).
 */
export function rebaseSuccessor(scriptId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const rec = readSuccessors(props).find((r) => r.scriptId === String(scriptId ?? '').trim());
  if (!rec) return { ok: false as const, reason: 'unknown successor' };
  if (rec.crownedAt !== null) return { ok: false as const, reason: 'this successor was already crowned' };
  const own = ScriptApp.getScriptId();
  const guarda = mayWriteProject(rec.scriptId, own);
  if (!guarda.ok) return { ok: false as const, reason: guarda.reason };
  const w = slotWritable(rec.url);
  if (!w.ok) return { ok: false as const, reason: w.reason };
  const call = scriptCall(ScriptApp.getOAuthToken());
  const originais = readOwnFiles(call, own).filter((f) => f.name !== 'successor_seed');
  const prep = prepareSuccessor(originais.map((f) => ({ name: f.name, source: f.source })), JSON.stringify({ explanation: rec.explanation, changes: rec.changes }));
  if (!prep.ok) return { ok: false as const, reason: `the patch no longer fits this engine (${prep.reason}): write a new successor` };
  const tipo = (n: string) => originais.find((f) => f.name === n)?.type ?? 'SERVER_JS';
  const dep = deployAgentProject(call, own, [...prep.files.map((f) => ({ name: f.name, type: tipo(f.name), source: f.source })), successorSeedFile(own)], '', { scriptId: rec.scriptId, url: rec.url });
  if (!dep.ok) return { ok: false as const, reason: `${dep.stage}: ${dep.reason}` };
  saveSuccessor(props, { ...rec, at: Date.now() });
  return { ok: true as const, scriptId: rec.scriptId, version: dep.version, next: 'the same patch now sits on this engine\'s current code. Evaluate it again before the crown.' };
}

/**
 * SYNC (decisão A): o pai segue alvo do build e porta do Chat; o motor que RESPONDE é o sucessor coroado.
 * Isto leva o código ATUAL deste motor — inteiro, sem patch e sem Opus — à implantação do sucessor, com
 * uma semente nova. A semente diz `bornDisabled`, mas com semente ligado é `RUNTIME_ENABLED === 'true'`,
 * e a coroa já o escreveu: trocar o código não pausa o sucessor. As trocas coroadas já estão no `src`
 * (`succession pull`), então `codeMatches` com o patch do registro deixa de valer depois — esperado.
 */
export function syncSuccessor(scriptId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const rec = readSuccessors(props).find((r) => r.scriptId === String(scriptId ?? '').trim());
  if (!rec) return { ok: false as const, reason: 'unknown successor' };
  if (rec.crownedAt === null) return { ok: false as const, reason: 'only a crowned successor is synced — one still waiting for the crown gets `rebase`' };
  const own = ScriptApp.getScriptId();
  const guarda = mayWriteProject(rec.scriptId, own);
  if (!guarda.ok) return { ok: false as const, reason: guarda.reason };
  // Ler ANTES: sem ler o sucessor não se escreve nele — fora do ar, sem autorização ou sem a porta.
  const antes = successorEnabled(rec.url);
  if (antes === null) return { ok: false as const, reason: 'could not read the successor before writing into it (offline, not authorized, or without the readiness door)' };
  const call = scriptCall(ScriptApp.getOAuthToken());
  const files = [...readOwnFiles(call, own).filter((f) => f.name !== 'successor_seed'), successorSeedFile(own)];
  const dep = deployAgentProject(call, own, files, '', { scriptId: rec.scriptId, url: rec.url });
  if (!dep.ok) return { ok: false as const, reason: `${dep.stage}: ${dep.reason}` };
  const depois = successorEnabled(rec.url);
  if (depois !== antes) {
    const leitura = depois === null ? 'could not be read' : depois ? 'is running' : 'is paused';
    return { ok: false as const, scriptId: rec.scriptId, version: dep.version, reason: `version ${dep.version} was deployed, but the successor ${leitura} now (it was ${antes ? 'running' : 'paused'} before). Check it in its panel.` };
  }
  return { ok: true as const, scriptId: rec.scriptId, version: dep.version, running: depois };
}

/** O que o painel e a CLI leem: os sucessores, com a explicação, as trocas, a nota e a coroa. */
export function successionState() {
  assertOwner();
  return { successors: readSuccessors(PropertiesService.getScriptProperties()).map((r) => ({ ...r, verdict: r.crownedAt === null ? crownVerdict(r.evaluation) : null })) };
}

/**
 * O que a tela precisa antes de mandar escrever o SUCESSOR (F7). Os escopos são TODOS os do pai, e a tela
 * os mostra marcados e travados: o sucessor é o próprio agente melhorado, não um diferente dele.
 */
export function successorOptions(folderId: string) {
  assertOwner();
  const id = String(folderId ?? '').trim();
  const cap = mayAct(id, 'succeed');
  let escopos: string[] = [];
  let erro = '';
  try {
    escopos = engineScopes(ScriptApp.getOAuthToken(), ScriptApp.getScriptId());
  } catch (e) {
    erro = (e as Error).message;
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
    budget: { spentToday: codegenSpentToday(Date.now()), cap: budgetNow().codegenUsd },
    successors: successionState().successors.filter((r) => r.folderId === id),
    note: `The successor is THIS agent, improved: ${OPUS_MODEL} reads this engine's code and returns a small patch with an explanation of what it improves. The patch is deployed as another Apps Script project with the same scopes, born paused. This engine evaluates it from outside with its own judge; you read the change, the explanation and the score, and crown it.`,
  };
}

/**
 * Sonda da P32 (só no dev): **o Opus devolve um patch válido do motor inteiro, dentro de 6 min?**
 *
 * É a pergunta que decide a F7 (ADR-043). O agente já lê o próprio código — `engineScopes` baixa
 * `projects/{eu}/content` a cada `succeed` e descarta tudo menos o manifesto. Aqui o código vai ao
 * Opus, e o que volta é medido contra os critérios da spec: C1 aceita o motor como contexto, C2 cabe
 * em < 5 min, C3 cada trecho casa uma vez, C4 custo medido, C5 a explicação existe.
 *
 * NADA É IMPLANTADO. O patch é validado em memória (`applyPatch`) e guardado para as próximas POCs.
 * O custo entra no gasto do dia, mesmo se a resposta vier vazia (ADR-041 §4, D9).
 */
/**
 * Geradores que a P32 pode comparar — LISTA FECHADA. A CLI não deixa passar `/` num valor, e mesmo que
 * deixasse, aceitar qualquer id de modelo vindo da linha de comando é abrir a porta para um nome
 * digitado errado virar uma cobrança. Preços do OpenRouter em 2026-09-21, por milhão de tokens; servem
 * só ao PRÉ-teste de custo — o custo gravado é o `usage.cost` que a API devolve.
 */
const P32_MODELS: Record<string, { id: string; inUsd: number; outUsd: number }> = {
  opus: { id: OPUS_MODEL, inUsd: 5, outUsd: 25 },
  gpt: { id: 'openai/gpt-6-astra', inUsd: 10, outUsd: 50 },
};

function pocP32(step?: string, params: Record<string, string> = {}): unknown {
  const props = PropertiesService.getScriptProperties();
  const own = ScriptApp.getScriptId();
  const token = ScriptApp.getOAuthToken();
  const t0 = Date.now();
  const res = UrlFetchApp.fetch(`https://script.googleapis.com/v1/projects/${own}/content`, { headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { pass: false, error: `could not read this project's own code: HTTP ${res.getResponseCode()}` };
  const files: PatchFile[] = ((JSON.parse(res.getContentText()) as { files?: { name: string; source: string }[] }).files ?? []).map((f) => ({ name: f.name, source: f.source }));
  const readMs = Date.now() - t0;
  const bytes = files.reduce((n, f) => n + f.source.length, 0);

  if (step === 'read') {
    // Grátis: só confirma que o agente se lê inteiro, e quanto ele pesa em tokens.
    return { pass: files.length > 0, readMs, files: files.map((f) => ({ name: f.name, chars: f.source.length })), totalChars: bytes, approxTokens: Math.round(bytes / 4) };
  }

  if (step === 'patch') {
    const key = store.getApiKey();
    if (!key) return { pass: false, error: 'save the OpenRouter key first' };
    const gerador = P32_MODELS[params.model || 'opus'];
    if (!gerador) return { pass: false, error: `unknown model: ${params.model} (use: ${Object.keys(P32_MODELS).join(', ')})` };
    // O ORÇAMENTO DE RACIOCÍNIO. A primeira rodada deu `finish_reason: length` com conteúdo nulo: 5.000
    // tokens de saída gastos pensando sobre 142 mil de código, nenhum sobrando para a resposta. O teto
    // total precisa caber pensamento E resposta; `reasoning.max_tokens` reserva a parte da resposta.
    const maxTokens = Number(params.tokens) || 16_000;
    const pensar = Number(params.reasoning) || 8_000;
    // PRÉ-TESTE COM A ESTIMATIVA REAL. `CODEGEN_BUDGET_USD` supõe US$ 1 por geração e a P32 custou
    // US$ 1,38: com ele, o teto deixaria passar uma chamada que o estoura. MEDIDO na rodada 2 (v147):
    // 569.326 caracteres viraram 252.504 tokens — 2,25 por token. A primeira estimativa usava 3 e
    // acertou o total por acaso: errou para menos na entrada e para mais na saída.
    const estimativa = (bytes / 2.25) * gerador.inUsd / 1e6 + maxTokens * gerador.outUsd / 1e6;
    const gasto = codegenSpentToday(Date.now());
    const teto = budgetNow().codegenUsd;
    if (gasto + estimativa > teto) return { pass: false, error: `this run could cost up to US$ ${estimativa.toFixed(2)} and US$ ${gasto.toFixed(2)} of US$ ${teto.toFixed(2)} are already spent today`, estimateUsd: estimativa, spentTodayUsd: gasto, capUsd: teto };
    const system =
      'You improve a Google Apps Script agent by returning a SMALL patch, never the whole program. ' +
      'Answer with JSON only: {"explanation": "<what you improved and why, at most 5 sentences>", "changes": [{"file": "<file name>", "find": "<an exact excerpt of that file>", "replace": "<its replacement>"}]}. ' +
      'Rules: at most 3 changes; each "find" must be copied EXACTLY from the file and must appear EXACTLY ONCE in it, at most 300 characters; ' +
      'fix ONE real defect or risk you can point to in the code. ' +
      'Never remove or weaken assertOwner, NEVER_AUTO, mayWriteProject, the closed tool registry, or any permission or approval check.';
    const user = files.map((f) => `=== FILE: ${f.name} ===\n${f.source}`).join('\n\n');
    const t1 = Date.now();
    let texto = '';
    let custo = 0;
    let fim: string | undefined;
    let uso: Record<string, unknown> | undefined;
    let vazio: string | undefined;
    try {
      const r = complete(key, gerador.id, [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens, undefined, [], undefined, { max_tokens: pensar });
      texto = r.text;
      custo = Number(r.usage?.cost ?? 0);
      fim = r.finish_reason;
      uso = r.usage as Record<string, unknown> | undefined;
    } catch (e) {
      const x = e as EmptyCompletionError;
      if (!(x && typeof x.contentShape === 'string')) return { pass: false, stage: 'call', model: gerador.id, error: (e as Error).message.slice(0, 300), readMs, callMs: Date.now() - t1 };
      custo = Number(x.usage?.cost ?? 0);
      fim = x.finishReason;
      vazio = x.contentShape;
      // A CONTAGEM VAI JUNTO na resposta vazia. Na primeira rodada ela era descartada, e "gastou tudo
      // raciocinando" ficou hipótese. Agora é número.
      uso = x.usage as Record<string, unknown> | undefined;
    }
    const detalhe = (k: string) => (uso?.[k] as Record<string, number> | undefined) ?? {};
    const tokensIn = uso?.prompt_tokens as number | undefined;
    const tokensOut = uso?.completion_tokens as number | undefined;
    const tokensThink = detalhe('completion_tokens_details').reasoning_tokens;
    const tokensCached = detalhe('prompt_tokens_details').cached_tokens;
    const callMs = Date.now() - t1;
    // O dinheiro saiu: conta ANTES de qualquer veredito (ADR-041 §4).
    props.setProperty(codegenDayProp(Date.now()), String(codegenSpentToday(Date.now()) + custo));
    const patch = parsePatch(texto);
    const aplicado = patch.ok ? applyPatch(files, patch.changes) : null;
    const totalMs = Date.now() - t0;
    if (patch.ok && aplicado?.ok) props.setProperty('P32_PATCH', JSON.stringify({ model: gerador.id, explanation: patch.explanation, changes: patch.changes, at: Date.now() }));
    return {
      pass: patch.ok && !!aplicado?.ok && totalMs < 300_000,
      c1_accepted: vazio === undefined,
      c2_totalMs: totalMs,
      c2_under5min: totalMs < 300_000,
      c3_applies: aplicado?.ok ?? false,
      c3_reason: aplicado && !aplicado.ok ? aplicado.reason : patch.ok ? '' : patch.reason,
      c4_costUsd: custo,
      c5_explanation: patch.ok ? patch.explanation : null,
      changes: patch.ok ? patch.changes.map((c) => ({ file: c.file, findChars: c.find.length, replaceChars: c.replace.length })) : [],
      readMs,
      callMs,
      model: gerador.id,
      estimateUsd: estimativa,
      maxTokens,
      reasoningBudget: pensar,
      finishReason: fim ?? null,
      tokensIn: tokensIn ?? null,
      tokensOut: tokensOut ?? null,
      tokensReasoning: tokensThink ?? null,
      tokensCached: tokensCached ?? null,
      ...(vazio ? { emptyResponse: vazio } : {}),
      sentChars: bytes,
    };
  }

  if (step === 'show') {
    // Ler o patch guardado, inteiro — o dono precisa poder ver o que o Opus propôs.
    return { pass: true, patch: JSON.parse(props.getProperty('P32_PATCH') ?? 'null') };
  }

  return { pass: false, error: 'steps: read, patch, show' };
}

/**
 * Sonda da P33 (só no dev): **um agente completo sobe como OUTRO projeto, nascendo parado?**
 *
 * O sucessor é o próprio agente melhorado (ADR-043): o motor inteiro, as telas e o manifesto do pai —
 * com os mesmos escopos (decisão 2) —, mais a SEMENTE que o faz nascer parado e saber qual agente
 * servir. Nada secreto vai na semente: o dono cola a chave no painel do sucessor (ADR-040, opção 4).
 *
 * Critérios da spec: C1 implanta · C2 nasce parado · C3 o dono configura (clique + chave) · C4 uma
 * conversa de teste vai e volta. C3 e C4 são do DONO — a sonda só lê o que já aconteceu.
 */
function pocP33(step?: string): unknown {
  const props = PropertiesService.getScriptProperties();
  const own = ScriptApp.getScriptId();
  const call = scriptCall(ScriptApp.getOAuthToken());

  if (step === 'deploy') {
    const t0 = Date.now();
    const originais = readOwnFiles(call, own).filter((f) => f.name !== 'successor_seed');

    // O patch da P32, SE ele ainda couber. Não caber costuma ser a notícia boa: a melhoria já foi
    // portada para o `src/` e publicada (decisão 3), e o motor do pai já a traz.
    let melhorias = 'none: this successor carries the parent code as it is';
    let arquivos = originais.map((f) => ({ name: f.name, source: f.source }));
    const guardado = JSON.parse(props.getProperty('P32_PATCH') ?? 'null') as { explanation: string; changes: Change[] } | null;
    if (guardado) {
      const r = applyPatch(arquivos, guardado.changes);
      if (r.ok) {
        arquivos = r.files;
        melhorias = `applied the P32 patch: ${guardado.explanation}`;
      } else {
        melhorias = `the P32 patch no longer applies (${r.reason}) — expected once the fix has been ported to src and published: the parent code already carries it`;
      }
    }
    const tipo = (n: string) => originais.find((f) => f.name === n)?.type ?? 'SERVER_JS';
    const files = [
      ...arquivos.map((f) => ({ name: f.name, type: tipo(f.name), source: f.source })),
      // A SEMENTE: nascer parado e saber qual agente servir. Nenhum segredo (ver `seed.ts`).
      successorSeedFile(own),
    ];

    const agente = defaultAgent();
    const dep = deployAgentProject(call, own, files, `${agente?.name ?? 'gasclaw'} — successor agent ${new Date().toISOString().slice(0, 10)}`, null);
    if (!dep.ok) return { pass: false, stage: dep.stage, error: dep.reason };
    const { scriptId, url } = dep;
    props.setProperty('P33_SUCCESSOR', JSON.stringify({ scriptId, url, at: Date.now() }));
    return {
      pass: true,
      c1_deployed: true,
      ms: Date.now() - t0,
      scriptId,
      url,
      files: files.length,
      improvements: melhorias,
      next: 'the owner opens the URL, authorizes once, pastes the OpenRouter key in its panel, then runs `./gasclaw poc p33 check`',
    };
  }

  if (step === 'update') {
    // ATUALIZA o sucessor que já existe — mesmo projeto, mesmo endereço. Criar um NOVO obrigaria o dono
    // a refazer os três atos (vincular o GCP, autorizar, colar a chave). Atualizando, o vínculo e a chave
    // ficam: são do projeto e das Properties dele, não do conteúdo. Serve para levar ao sucessor um
    // código que o pai ganhou depois da implantação — como a porta `evalrun` da P34.
    const s = JSON.parse(props.getProperty('P33_SUCCESSOR') ?? 'null') as { scriptId: string; url: string } | null;
    if (!s) return { pass: false, error: 'no successor yet: run `./gasclaw poc p33 deploy` first' };
    const originais = readOwnFiles(call, own).filter((f) => f.name !== 'successor_seed');
    const dep = deployAgentProject(call, own, [...originais, successorSeedFile(own)], '', { scriptId: s.scriptId, url: s.url });
    if (!dep.ok) return { pass: false, stage: dep.stage, error: dep.reason };
    const versao = dep.version;
    return { pass: true, version: versao, url: s.url, reading: 'same project, same address: the GCP link and the key stay where they are' };
  }

  if (step === 'check') {
    // Lê o que já aconteceu no sucessor, pelo `health` dele — com o token do dono, e seguindo o 302 do
    // Apps Script (`fetchChild`). Não liga nada, não configura nada: isso é do dono.
    const s = JSON.parse(props.getProperty('P33_SUCCESSOR') ?? 'null') as { scriptId: string; url: string } | null;
    if (!s) return { pass: false, error: 'no successor yet: run `./gasclaw poc p33 deploy` first' };
    const r = fetchChild(`${s.url}?action=health`);
    const estado = authState(s.url, r.code, r.body);
    if (estado !== 'authorized') return { pass: false, authState: estado, reading: estado === 'needs-consent' ? 'the owner has not authorized the successor yet' : `could not read the successor (HTTP ${r.code})`, url: s.url };
    let h: { enabled?: boolean; agents?: number; hasKey?: boolean } = {};
    try {
      h = JSON.parse(r.body);
    } catch {
      return { pass: false, reading: 'the successor answered something that is not its health JSON', body: r.body.slice(0, 200) };
    }
    return {
      pass: h.enabled === false && (h.agents ?? 0) > 0,
      c2_bornDisabled: h.enabled === false,
      seedAgents: h.agents ?? 0,
      c3_hasKey: h.hasKey === true,
      reading: h.enabled === false ? 'the successor is PAUSED, as it should be until crowned' : 'the successor is RUNNING — it should have been born paused',
      url: s.url,
    };
  }

  return { pass: false, error: 'steps: deploy, update, check' };
}

/**
 * Sonda da P34 (só no dev): **o pai avalia o sucessor DE FORA?**
 *
 * Para cada cenário: o pai manda ao sucessor só o `RunSpec` (sem juiz, rubrica nem verificações), roda
 * o MESMO cenário aqui no titular, e julga os dois com o `judgeRun` DELE. O avaliado nunca julga a si
 * mesmo — e a sonda confere isso: o sucessor tem que devolver turnos crus, nunca um veredito.
 *
 * `k` são os CENÁRIOS medidos, e `beatsIncumbent` decide sobre passes/k. Os dois lados rodam na caixa
 * de areia, com o mesmo agente: a única diferença entre eles é o código.
 */
const P34_SCENARIOS = ['smoke', 'e1-now', 'e1-memoria', 'e1-limite', 'e1-fora-da-lista', 'e1-injecao'];

function pocP34(step?: string, params: Record<string, string> = {}): unknown {
  if (step !== 'run') return { pass: false, error: 'steps: run' };
  const props = PropertiesService.getScriptProperties();
  const sucessor = JSON.parse(props.getProperty('P33_SUCCESSOR') ?? 'null') as { url: string } | null;
  if (!sucessor) return { pass: false, error: 'no successor yet: run `./gasclaw poc p33 deploy` first' };
  const key = store.getApiKey();
  if (!key) return { pass: false, error: 'save the OpenRouter key first' };
  const ag = defaultAgent();
  if (!ag) return { pass: false, error: 'no active agent' };
  // O MESMO caminho que `evaluateSuccessor` usa: a sonda mede o que o produto faz, não uma cópia dele.
  const ev = evaluateFromOutside(sucessor.url, ag.folderId, key, Number(params.n) || undefined);
  return {
    pass: ev.k > 0 && ev.complete && !ev.verdictLeaked,
    c1_parentDrives: ev.k > 0,
    c2_parentJudges: ev.k > 0 && !ev.verdictLeaked,
    c3_compared: { successorPasses: ev.successorPasses, incumbentPasses: ev.incumbentPasses, k: ev.k, successorWins: ev.k > 0 ? beatsIncumbent(ev.successorPasses, ev.incumbentPasses, ev.k) : false },
    rows: ev.rows,
    ms: ev.ms,
  };
}

/**
 * P35 — o Chat pode seguir o motor coroado? A mensagem do Chat chega ao PAI (é o Deployment ID que o
 * console conhece). Para repassá-la ao sucessor, a identidade com que este onMessage roda precisa ser
 * aceita pelo web app do sucessor, que só abre para o dono. Esta sonda mede, sem mudar nada: quem roda,
 * se o sucessor responde a essa identidade, e em quanto tempo. Nunca derruba a resposta ao Chat.
 */
function p35Record(e: ChatEvent) {
  try {
    const coroado = readSuccessors(PropertiesService.getScriptProperties()).find((r) => r.crownedAt !== null);
    const t0 = Date.now();
    let codigo = 0;
    let aceito = false;
    let erro = '';
    if (coroado) {
      try {
        const r = postChild(coroado.url, { action: 'readiness' });
        codigo = r.code;
        aceito = (JSON.parse(r.body) as { ok?: boolean }).ok === true;
      } catch (x) {
        erro = String((x as Error)?.message ?? x).slice(0, 200);
      }
    }
    const leitura = {
      at: Date.now(),
      sender: e.user?.email ?? '',
      effectiveUser: Session.getEffectiveUser().getEmail(),
      activeUser: Session.getActiveUser().getEmail(),
      successor: coroado?.scriptId ?? null,
      code: codigo,
      accepted: aceito,
      ms: Date.now() - t0,
      ...(erro ? { error: erro } : {}),
    };
    PropertiesService.getScriptProperties().setProperty('P35_LAST', JSON.stringify(leitura));
  } catch {
    // a sonda nunca pode custar a resposta ao dono
  }
}

function pocP35(step?: string): unknown {
  if (step !== 'read') return { pass: false, error: 'steps: read (send a Chat message to the agent first)' };
  const l = JSON.parse(PropertiesService.getScriptProperties().getProperty('P35_LAST') ?? 'null') as { accepted: boolean; ms: number; effectiveUser: string; sender: string } | null;
  if (!l) return { pass: false, reading: 'no Chat message has reached this engine since the probe was deployed: send one, then read again' };
  return {
    pass: l.accepted && l.ms < 10_000,
    c1_identityAccepted: l.accepted,
    c2_roundTripMs: l.ms,
    runsAs: l.effectiveUser === l.sender ? 'the sender' : l.effectiveUser === ownerEmail() ? 'the owner' : 'someone else',
    ...l,
  };
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
  p28: (step) => pocP28(step),
  p29: (step) => pocP29(step),
  p32: (step, params = {}) => pocP32(step, params),
  p33: (step) => pocP33(step),
  p34: (step, params = {}) => pocP34(step, params),
  p35: (step) => pocP35(step),
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

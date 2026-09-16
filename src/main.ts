import { pocP10 } from '../poc/p10-editor/harness';
import { pocP14 } from '../poc/p14-trace/harness';
import { pocP15 } from '../poc/p15-limites/harness';
import { pocP16 } from '../poc/p16-custo/harness';
import { pocP3 } from '../poc/p3-pump/harness';
import { runP3SyntheticWorker, syntheticTurn } from '../poc/p3-pump/worker';
import { pocP4 } from '../poc/p4-run/harness';
import { pocP6 } from '../poc/p6-docs-nativos/harness';
import { CHAT_BUDGET_MS, DEFAULT_STEPS, MAX_HISTORY, reply } from './agent';
import { decisionFrom } from './approval';
import { cacheTickets, newToken } from './approvalStore';
import { chatTurn, handleChat, type ChatDeps, type ChatEvent } from './chat';
import { extendBudget, newRun, resumeOf, RUN_BUDGET_USD, view, withDecision, type DurableRun } from './run';
import { pump, type StepDeps } from './runner';
import { runIO } from './runStore';
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
import { getOverride, listModels as openRouterModels, setOverride, validateChoice } from './models';
import * as observe from './observe';
import * as runlog from './runlog';
import * as store from './store';
import { memoryIO } from './tools/memoryStore';
import { allowedTools } from './tools/registry';
import { coverage, redact } from './trace';
import { agentInfo, llmInfo, traceDeps } from './traced';
import { webClick, webSend, webSpace } from './webchat';
import { agentFolderPath, canUse, effectiveAccess, ensureFolderPath, extractFolderId, loadAgent, parseAccess, pendingSuggestions, seedAgent, validAgentName, withAccess, type Access, type LoadedAgent } from './workspace';

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

/** ADR-018: o modelo escolhido na tela (MODEL:<folderId>) vence a planilha config e o AGENTS. */
function withOverride(spec: LoadedAgent): LoadedAgent & { modelSource: 'tela' | 'pasta' } {
  const o = getOverride(spec.folderId);
  return o ? { ...spec, config: { ...spec.config, model: o }, modelSource: 'tela' } : { ...spec, modelSource: 'pasta' };
}
/** ADR-021: acesso e tools valem só o que o dono aprovou no painel (ACCESS:<folderId>); sem aprovação, fechado. */
const approvedOf = (folderId: string) => parseAccess(PropertiesService.getScriptProperties().getProperty(`ACCESS:${folderId}`));
const loadAgentForTurn = (folderId: string) => withAccess(withOverride(loadAgent(folderId)), approvedOf(folderId));

/** A3/M16: Chat, tela de conversa e clique de aprovação registram os mesmos passos (resolve_agent, llm_call, tool_call). */
const traced = (t: runlog.Tracer, d: ChatDeps): ChatDeps => traceDeps(t, d, loadAgentForTurn);

/** A chave da conversa é "<folderId>:<espaço>"; o folderId é a pasta do agente (ADR-024). */
const folderOf = (key: string): string => key.split(':')[0];

declare const __DEV__: boolean; // embutido pelo build: true só no deploy do dev (POCs)
const isDev = () => typeof __DEV__ !== 'undefined' && __DEV__ === true;

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
    if (e?.parameter?.page === 'chat') {
      assertOwner();
      return HtmlService.createHtmlOutputFromFile('chat').setTitle('gasclaw · conversa').addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    ownerEmail();
    return HtmlService.createHtmlOutputFromFile('settings').setTitle('gasclaw').addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
    tickets: cacheTickets(),
    newToken,
  };
}

export function onMessage(e: ChatEvent) {
  const d = chatDeps();
  if (e.type !== 'MESSAGE' && e.type !== 'CARD_CLICKED') return handleChat(e, d);
  const t = runlog.begin('chat', { question: (e.message?.argumentText ?? e.message?.text ?? '').trim(), user: e.user.email });
  const out = handleChat(e, traced(t, d));
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
function stepDeps(budgetMs = STEP_BUDGET_MS): StepDeps {
  return {
    io: runIO(),
    clock: Date.now,
    step: (r: DurableRun) => {
      const me = ownerEmail();
      const spec = loadAgentForTurn(r.folderId);
      if (!canUse(spec.access, r.user, me)) throw new Error(`${r.user} não tem acesso ao agente ${spec.name}`); // acesso aprovado no painel (ADR-021)
      const apiKey = store.getApiKey();
      if (!apiKey) throw new Error('Falta a chave do OpenRouter. Cole-a na tela gasclaw.');
      const d = chatDeps();
      const ownerDm = r.user === me.toLowerCase();
      const base = d.toolkit!(spec, ownerDm);
      // O acesso ao Google só entra no contexto de quem é o dono, igual à conversa (ADR-023).
      const kit = { ...base, ctx: { ...base.ctx, isOwner: ownerDm, google: ownerDm ? base.ctx.google : undefined } };
      const t = runlog.begin('webchat', { question: r.text.slice(0, 2000), user: r.user });
      try {
        const { turn, ritualDone } = chatTurn({
          spec,
          kit,
          text: r.text,
          history: d.history(r.session),
          ownerDm,
          runId: r.runId,
          budgetMs,
          llm: (m, defs) => t.step('llm_call', () => d.llm(apiKey, spec.config.model, m, defs), llmInfo(spec.config.model, m), true),
          resume: resumeOf(r),
          done: r.done,
          granted: r.granted,
        });
        // Fim do run = não ficou pendência nem parada. Só aqui a conversa é gravada, compactada e o ritual consumido.
        if (!turn.pending && !turn.stopped) {
          if (ritualDone) kit.bootstrap?.consume();
          if (ownerDm && turn.history.length >= MAX_HISTORY && kit.ctx.memory.saveDay && kit.ctx.memory.today) flushMemory(turn.history, kit.ctx, (m) => d.llm(apiKey, spec.config.model, m));
          d.saveHistory(r.session, turn.history);
          d.compact?.(r.session, (m) => d.llm(apiKey, spec.config.model, m));
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
  const r = newRun({ runId: `tela-${now}-${Utilities.getUuid().slice(0, 8)}`, session: screenSession(entry.folderId, me), folderId: entry.folderId, user: me, text: t, now });
  runIO().enqueue(r, now);
  const done = pump(stepDeps(CHAT_BUDGET_MS), 1, now + CHAT_BUDGET_MS)[0] ?? r;
  return { ok: true, runId: r.runId, ...view(done), ...pendingView(done) };
}

/** A tela acompanha um run em andamento. Só o dono do run o enxerga. */
export function runState(runId: string) {
  const me = assertOwner();
  const entry = store.listAgents()[0];
  if (!entry) return { ok: false, error: 'Nenhum agente configurado.' };
  const r = runIO().load(entry.folderId, String(runId ?? ''));
  if (!r) return { ok: false, error: 'Não encontrei essa tarefa.' };
  if (r.user !== me.toLowerCase()) return { ok: false, error: 'Essa tarefa não é sua.' };
  return { ok: true, runId: r.runId, ...view(r), ...pendingView(r) };
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
  let next: DurableRun;
  if (r.status === 'paused') {
    if (p.decision !== 'continue') return { ok: false, error: 'Essa tarefa está parada no teto de custo: responda se quer continuar.' };
    next = extendBudget(r, RUN_BUDGET_USD, now);
  } else {
    if (r.status !== 'waiting' || !r.pending) return { ok: false, error: 'Essa tarefa não está esperando resposta.' };
    const decision = decisionFrom(r.pending, p);
    if (!decision) return { ok: false, error: 'Resposta inválida para este pedido.' };
    next = withDecision(r, decision, now);
  }
  io.enqueue(next, now, true); // decidiu = progresso: as tentativas voltam a zero
  const done = pump(stepDeps(CHAT_BUDGET_MS), 1, now + CHAT_BUDGET_MS)[0] ?? next;
  return { ok: true, runId: done.runId, ...view(done), ...pendingView(done) };
}

/** O que a tela precisa desenhar além do texto: os botões (Aprovar/Negar, opções do `ask`, Continuar). */
function pendingView(r: DurableRun): { choices?: { key: 'decision' | 'answer'; value: string; label: string }[] } {
  if (r.status === 'paused') return { choices: [{ key: 'decision', value: 'continue', label: 'Continuar' }] };
  if (r.status !== 'waiting' || !r.pending) return {};
  if (r.pending.kind === 'ask') {
    const options = String(r.pending.args.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).slice(0, 6);
    return { choices: options.map((o) => ({ key: 'answer' as const, value: o, label: o.slice(0, 40) })) };
  }
  return { choices: [{ key: 'decision', value: 'approve', label: 'Aprovar' }, { key: 'decision', value: 'deny', label: 'Negar' }] };
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
 * O gatilho é o worker do run durável. O produto exige Workspace, cuja cota de gatilhos é 6 h/dia; a P3 mede
 * o consumo real antes de aceitar este desenho. A fila vazia não abre Drive nem chama modelo.
 */
function workRuns(pointers = runIO().pointers()): void {
  try {
    if (!pointers.length) return;
    pump(stepDeps(), PUMP_MAX_STEPS, Date.now() + PUMP_BUDGET_MS);
  } catch (err) {
    console.warn(`pump do gatilho falhou: ${redactMsg(err)}`);
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

export function settingsState() {
  const me = assertOwner();
  observe.maybeDrain(); // fallback sem gatilho ao abrir a tela
  const cliSecretAt = PropertiesService.getScriptProperties().getProperty('CLI_SECRET_AT');
  return { me, enabled: store.isEnabled(), hasKey: !!store.getApiKey(), agents: store.listAgents(), appUrl: appUrl(), cliSecretAt, auth: authStatus() };
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
  if (!/^sk-or-[\w-]{10,}$/.test(key.trim())) throw new Error('Chave inválida: a chave do OpenRouter começa com sk-or-');
  store.setApiKey(key);
  return settingsState();
}

export function addAgent(url: string) {
  const me = assertOwner();
  const id = extractFolderId(url);
  if (!id) throw new Error('URL de pasta inválida. Copie a URL da pasta no Google Drive.');
  const created = seedAgent(id, me);
  const spec = loadAgent(id);
  store.saveAgents([...store.listAgents().filter((a) => a.folderId !== id), { folderId: id, name: spec.name }]);
  return { state: settingsState(), created };
}

/** "Novo agente": cria (ou reutiliza) Meu Drive/gasclaw/agentes/<nome>/, semeia os arquivos e registra a pasta. */
export function createAgent(name: string) {
  assertOwner();
  const n = name.trim();
  if (!validAgentName(n)) throw new Error('Nome inválido: use letras minúsculas, números e hífen (ex.: assistente).');
  return addAgent(ensureFolderPath(agentFolderPath(n)).getId());
}

export function removeAgent(folderId: string) {
  assertOwner();
  store.saveAgents(store.listAgents().filter((a) => a.folderId !== folderId));
  PropertiesService.getScriptProperties().deleteProperty(`ACCESS:${folderId}`); // ADR-021: sem sobra de acesso aprovado
  return settingsState();
}

// ---------- Acesso e ferramentas aprovados no painel (ADR-021) ----------
const asAccess = (a: Partial<Access> | null | undefined): Access => ({
  users: Array.isArray(a?.users) ? a!.users.map(String) : [],
  tools: Array.isArray(a?.tools) ? a!.tools.map(String) : [],
});
const agentName = (folderId: string) => store.listAgents().find((a) => a.folderId === folderId)?.name ?? folderId;
const describeAccess = (a: Access) => `${a.users.length ? a.users.join(', ') : 'só o dono'} · ${a.tools.length ? a.tools.join(', ') : 'sem ferramentas'}`;

/** O que a pasta sugere, o que está aprovado e o que falta aprovar. */
export function agentAccess(folderId: string) {
  assertOwner();
  const spec = loadAgent(folderId);
  const approved = approvedOf(folderId);
  return { folderId, name: spec.name, suggested: spec.config.suggested, approved: effectiveAccess(approved), pending: pendingSuggestions(spec.config.suggested, approved) };
}

/** Grava o acesso aprovado (normalizado por effectiveAccess) e registra a mudança como run config no trace. */
export function approveAccess(folderId: string, access: Partial<Access>) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const before = effectiveAccess(parseAccess(props.getProperty(`ACCESS:${folderId}`)));
  const next = effectiveAccess(asAccess(access));
  const name = agentName(folderId);
  const t = runlog.begin('config', { question: `acesso de ${name}: ${describeAccess(before)} → ${describeAccess(next)}`, agent: name });
  t.step('approve_access', () => props.setProperty(`ACCESS:${folderId}`, JSON.stringify(next)), () => ({ folderId, before, after: next }));
  t.end({ answer: `aprovado: ${describeAccess(next)}` });
  return settingsState();
}

/** Remove a aprovação: o agente volta a responder só ao dono, sem ferramentas. */
export function removeAccess(folderId: string) {
  assertOwner();
  const props = PropertiesService.getScriptProperties();
  const before = effectiveAccess(parseAccess(props.getProperty(`ACCESS:${folderId}`)));
  const name = agentName(folderId);
  const t = runlog.begin('config', { question: `acesso de ${name}: ${describeAccess(before)} → só o dono, sem ferramentas`, agent: name });
  t.step('remove_access', () => props.deleteProperty(`ACCESS:${folderId}`), () => ({ folderId, before }));
  t.end({ answer: 'acesso removido' });
  return settingsState();
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
  runlog.reconcileStaleRuns();
  const drained = observe.drain();
  workRuns(); // mesmo gatilho, dois trabalhos: gravar o trace em lote e avançar o run durável (ADR-027)
  return drained;
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
  p3: (step) => pocP3(step),
  p4: (step) => pocP4(step),
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

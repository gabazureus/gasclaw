import { pocP10 } from '../poc/p10-editor/harness';
import { pocP14 } from '../poc/p14-trace/harness';
import { pocP6 } from '../poc/p6-docs-nativos/harness';
import { reply } from './agent';
import { handleChat, type ChatDeps, type ChatEvent } from './chat';
import { complete, type Completion, type Message } from './llm';
import * as runlog from './runlog';
import * as store from './store';
import { coverage } from './trace';
import { agentFolderPath, ensureFolderPath, extractFolderId, loadAgent, seedAgent, validAgentName } from './workspace';

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

/** Dados do span llm_call: modelo real, tokens, custo e o prompt completo (vai só para o JSON do run). */
const llmInfo = (requested: string, messages: Message[]) => (c: Completion) => ({
  model: c.model ?? requested,
  prompt_tokens: c.usage?.prompt_tokens ?? 0,
  completion_tokens: c.usage?.completion_tokens ?? 0,
  cost: c.usage?.cost ?? 0,
  finish_reason: c.finish_reason,
  generation: c.id,
  messages,
});

// ---------- Web app ----------
export function doGet(e: GoogleAppsScript.Events.DoGet) {
  const action = e?.parameter?.action;
  if (!action) {
    ownerEmail();
    return HtmlService.createHtmlOutputFromFile('settings').setTitle('gasclaw').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  try {
    assertOwner();
    if (action === 'poc') {
      const run = POCS[e.parameter.id ?? ''];
      if (!run) return json({ ok: false, pass: false, error: `POC desconhecida: ${e.parameter.id}` });
      if (e.parameter.trace === '0') return json(run(e.parameter.step, e.parameter)); // sondas da P14 não viram run
      const t = runlog.begin('poc', { question: `poc ${e.parameter.id} ${e.parameter.step ?? ''}`.trim() });
      try {
        const r = t.step(`poc_${e.parameter.id}`, () => run(e.parameter.step, e.parameter));
        t.end({ answer: JSON.stringify(r).slice(0, 500) });
        return json(r);
      } catch (err) {
        t.end({ error: (err as Error).message });
        throw err;
      }
    }
    if (action === 'health') {
      const agents = store.listAgents();
      const folders = agents.map((a) => `${a.name}: https://drive.google.com/drive/folders/${a.folderId}`);
      return json({ ok: true, enabled: store.isEnabled(), agents: agents.length, hasKey: !!store.getApiKey(), folders });
    }
    if (action === 'disable' || action === 'enable') {
      store.setEnabled(action === 'enable');
      return json({ ok: true, enabled: store.isEnabled() });
    }
    if (action === 'trace') return json({ ok: true, ...runlog.runDetail(e.parameter.run) });
    if (action === 'live') return json({ ok: true, ...runlog.liveRuns() });
    if (action === 'runs') return json({ ok: true, url: runlog.sheetUrl(runlog.ensureRunStore().sheetId) });
    return json({ ok: false, error: `ação desconhecida: ${action}` });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message });
  }
}

// ---------- Google Chat (app clássico) ----------
function chatDeps(): ChatDeps {
  return {
    enabled: store.isEnabled,
    owner: ownerEmail,
    apiKey: store.getApiKey,
    defaultAgent: () => store.listAgents()[0] ?? null,
    load: loadAgent,
    history: store.getHistory,
    saveHistory: store.saveHistory,
    llm: (key, model, messages) => complete(key, model, messages, CHAT_MAX_TOKENS),
  };
}

export function onMessage(e: ChatEvent) {
  const d = chatDeps();
  if (e.type !== 'MESSAGE') return handleChat(e, d);
  const t = runlog.begin('chat', { question: (e.message?.argumentText ?? e.message?.text ?? '').trim(), user: e.user.email });
  const out = handleChat(e, {
    ...d,
    load: (id) => t.step('resolve_agent', () => d.load(id), (s) => ({ agent: s.name, folderId: id, configModel: s.config.model })),
    llm: (key, model, messages) => t.step('llm_call', () => d.llm(key, model, messages), llmInfo(model, messages), true),
  });
  t.mark('reply');
  t.end({ answer: out.text });
  return out;
}

export function onAddToSpace(e: ChatEvent) {
  return handleChat({ ...e, type: 'ADDED_TO_SPACE' }, chatDeps());
}

export function onRemoveFromSpace() {
  // nada a limpar na F0 (histórico expira sozinho no cache)
}

// ---------- Tela gasclaw (google.script.run) ----------
export function settingsState() {
  const me = assertOwner();
  return { me, enabled: store.isEnabled(), hasKey: !!store.getApiKey(), agents: store.listAgents() };
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
    const spec = t.step('resolve_agent', () => loadAgent(folderId), (s) => ({ agent: s.name, folderId, configModel: s.config.model }));
    const out = reply(spec, [], text, (m) => t.step('llm_call', () => complete(key, spec.config.model, m, CHAT_MAX_TOKENS), llmInfo(spec.config.model, m), true));
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
  p6: (step) => pocP6(step, ownerEmail()),
  p10: (step, params) => pocP10(step, params),
  p14: (step, params = {}) => {
    if (step !== 'real') return pocP14(step, params);
    const first = store.listAgents()[0];
    if (!first) throw new Error('P14 real: cadastre um agente na tela');
    const r = testAgent(first.folderId, params.q || 'Responda em uma frase curta: o que você faz?');
    const run = runlog.runDetail(r.runId).run;
    return { poc: 'P14', step, pass: true, runId: r.runId, spans: run?.spans.map((s) => s.name) ?? [], coverage: run ? coverage(run) : 0, ms: run?.ms, model: run?.model, tokens: run?.tokens, cost: run?.cost };
  },
};

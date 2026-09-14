import { runP6 } from '../poc/p6-docs-nativos/harness';
import { reply } from './agent';
import { handleChat, type ChatDeps, type ChatEvent } from './chat';
import { complete } from './llm';
import * as store from './store';
import { extractFolderId, loadAgent, seedAgent } from './workspace';

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

// ---------- Web app ----------
export function doGet(e: GoogleAppsScript.Events.DoGet) {
  const action = e?.parameter?.action;
  if (!action) {
    ownerEmail();
    return HtmlService.createHtmlOutputFromFile('settings').setTitle('gasclaw').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  try {
    assertOwner();
    if (action === 'health') return json({ ok: true, enabled: store.isEnabled(), agents: store.listAgents().length, hasKey: !!store.getApiKey() });
    if (action === 'disable' || action === 'enable') {
      store.setEnabled(action === 'enable');
      return json({ ok: true, enabled: store.isEnabled() });
    }
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
  return handleChat(e, chatDeps());
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
  const spec = loadAgent(folderId);
  const t0 = Date.now();
  const out = reply(spec, [], text, (m) => complete(key, spec.config.model, m, CHAT_MAX_TOKENS));
  return { text: out.text, model: spec.config.model, ms: Date.now() - t0 };
}

export function setRuntimeEnabled(on: boolean) {
  assertOwner();
  store.setEnabled(on);
  return settingsState();
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

// ---------- POC P6: agentes em Google Docs/Sheets nativos (sai após o ADR-012) ----------
export function pocDocsNativos(url: string) {
  assertOwner();
  const id = extractFolderId(url ?? '');
  if (!id) throw new Error('URL de pasta inválida. Copie a URL da pasta no Google Drive.');
  return runP6(id);
}

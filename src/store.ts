import type { AgentEntry } from './chat';
import type { Message } from './llm';

const props = () => PropertiesService.getScriptProperties();
const cache = () => CacheService.getScriptCache();
const SIX_HOURS = 21_600;
const CACHE_MAX = 90_000; // limite do CacheService é 100 KB por chave

export const getApiKey = (): string | null => props().getProperty('OPENROUTER_API_KEY');
export const setApiKey = (key: string): void => {
  props().setProperty('OPENROUTER_API_KEY', key.trim());
};

export const getOwner = (): string | null => props().getProperty('OWNER');
export const setOwner = (email: string): void => {
  props().setProperty('OWNER', email.toLowerCase());
};

export const listAgents = (): AgentEntry[] => JSON.parse(props().getProperty('AGENTS') ?? '[]');
export const saveAgents = (agents: AgentEntry[]): void => {
  props().setProperty('AGENTS', JSON.stringify(agents));
};

export const isEnabled = (): boolean => props().getProperty('RUNTIME_ENABLED') !== 'false';
export const setEnabled = (on: boolean): void => {
  props().setProperty('RUNTIME_ENABLED', String(on));
};

export function getHistory(key: string): Message[] {
  const raw = cache().get(`h:${key}`);
  return raw ? JSON.parse(raw) : [];
}

// minimal: histórico volátil (6 h) no Cache; sessões persistentes no Drive entram na F1.
export function saveHistory(key: string, history: Message[]): void {
  const h = [...history];
  let raw = JSON.stringify(h);
  while (raw.length > CACHE_MAX && h.length > 2) {
    h.shift();
    raw = JSON.stringify(h);
  }
  if (raw.length <= CACHE_MAX) cache().put(`h:${key}`, raw, SIX_HOURS);
}

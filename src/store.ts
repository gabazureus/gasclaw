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

/** Os agentes deste motor. Lista ilegível conta como nenhuma — nunca como a lista de outro. */
export const listAgents = (): AgentEntry[] => {
  try {
    const v: unknown = JSON.parse(props().getProperty('AGENTS') ?? '[]');
    return Array.isArray(v) ? (v as AgentEntry[]) : [];
  } catch {
    return [];
  }
};

/** Script Properties: 9 KB por valor. Mesma margem que o `usage.ts` usa, pelo mesmo motivo. */
const AGENTS_MAX = 8_000;

/**
 * A lista INTEIRA de agentes mora num único valor. Sem guarda, passar do teto lança exceção crua do
 * runtime e quebra o painel — e a lista anterior continuaria gravada, deixando o dono sem entender
 * o que aconteceu. Enquanto criar agente era ato manual do dono isso era hipótese; com um agente criador
 * montando squad (ADR-038) é caminho normal, então a recusa é honesta e diz o que fazer.
 */
export const saveAgents = (agents: AgentEntry[]): void => {
  const raw = JSON.stringify(agents);
  if (raw.length > AGENTS_MAX) throw new Error(`Too many agents to store (${agents.length}). Remove agents you no longer use, or split them across scripts.`);
  props().setProperty('AGENTS', raw);
};

/** Ligado salvo desligamento explícito: num projeto novo, o motor nasce ligado. */
export const isEnabled = (): boolean => props().getProperty('RUNTIME_ENABLED') !== 'false';
export const setEnabled = (on: boolean): void => {
  props().setProperty('RUNTIME_ENABLED', String(on));
};

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

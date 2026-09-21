import type { AgentEntry } from './chat';
import type { Message } from './llm';
import { agentsWith, enabledWith, parseSeed, type Seed } from './seed';

/**
 * A semente que o pai escreve no projeto de um SUCESSOR (P33). Num motor comum ela não existe, e tudo
 * segue a regra de sempre. Lida por `typeof` porque é uma variável global de outro arquivo do projeto.
 */
declare const GASCLAW_SEED: unknown;
const seed = (): Seed | null => parseSeed(typeof GASCLAW_SEED === 'undefined' ? null : GASCLAW_SEED);

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

// Num SUCESSOR recém-implantado as Properties estão vazias e o agente mora no pai: a semente diz
// qual agente servir, até o dono gravar a lista dele no painel.
export const listAgents = (): AgentEntry[] => agentsWith(props().getProperty('AGENTS'), seed());

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

// Com semente, o sucessor nasce PARADO e só liga com um "true" explícito — a coroa. Sem ela, a regra
// de sempre. Era `RUNTIME_ENABLED !== 'false'`, que num projeto novo quer dizer LIGADO.
export const isEnabled = (): boolean => enabledWith(props().getProperty('RUNTIME_ENABLED'), seed());
/** Este motor é um agente SUCESSOR (tem a semente que o pai escreveu)? Um motor comum nunca é. */
export const isSuccessor = (): boolean => seed() !== null;
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

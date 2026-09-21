// A semente com que o pai prepara o agente SUCESSOR (P33, F7). NÚCLEO PURO.
//
// Duas armadilhas de um projeto recém-criado, achadas ANTES de implantar o primeiro:
//
// 1. `isEnabled = RUNTIME_ENABLED !== 'false'`. Com as Properties vazias, o sucessor nasceria LIGADO —
//    o oposto da spec. Dois motores respondendo pelo mesmo agente ao mesmo tempo é briga.
// 2. O agente (pasta, aprovações, capacidades, bateria) mora nas Script Properties do PAI, e a API do
//    Apps Script não dá acesso a elas. O sucessor seria código melhorado num projeto vazio, sem saber
//    qual agente servir.
//
// O canal é o MESMO pelo qual o código chega: o pai escreve pela API um arquivo `var GASCLAW_SEED = …`.
// É código escrito pelo motor, não texto da pasta do Drive (ADR-002 intacta). E NADA SECRETO vai nele:
// nem a chave do OpenRouter, nem o segredo da CLI. Um projeto compartilhado levaria a semente junto —
// é exatamente o que a opção 4 da ADR-040 recusou. O dono cola a chave no painel do sucessor.
import type { AgentEntry } from './chat';

/**
 * `parentUrl`: o endereço do web app do pai, para o hub levar de um motor ao outro. O id não basta — a
 * URL de um web app não se deduz do scriptId. Não é segredo: é uma URL que só abre com o login do dono.
 */
export type Seed = { bornDisabled: true; parent: string; agents: AgentEntry[]; at: number; parentUrl?: string };

const isAppsScriptUrl = (u: unknown): u is string => typeof u === 'string' && /^https:\/\/script\.google\.com\//i.test(u);

/**
 * Confere a semente; nunca confia nela. Só `name` e `folderId` de cada agente atravessam — campo a
 * mais é DESCARTADO, não obedecido. Malformada → `null`, e o motor segue a regra de sempre.
 */
export function parseSeed(x: unknown): Seed | null {
  const o = x as Partial<Seed> | null | undefined;
  if (!o || typeof o !== 'object' || o.bornDisabled !== true) return null;
  if (typeof o.parent !== 'string' || !o.parent.trim()) return null;
  if (!Array.isArray(o.agents)) return null;
  const agents: AgentEntry[] = [];
  for (const a of o.agents) {
    const r = a as Partial<AgentEntry> | null;
    if (!r || typeof r.name !== 'string' || typeof r.folderId !== 'string' || !r.name.trim() || !r.folderId.trim()) return null;
    agents.push({ name: r.name, folderId: r.folderId });
  }
  // Endereço de fora do Apps Script é DESCARTADO, não obedecido: o hub não pode virar link para qualquer lugar.
  return { bornDisabled: true, parent: o.parent, agents, at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0, ...(isAppsScriptUrl(o.parentUrl) ? { parentUrl: o.parentUrl } : {}) };
}

/**
 * O arquivo que o pai escreve no projeto do sucessor. Passa por `parseSeed` ANTES de virar texto: o
 * que sai daqui é só o que a semente pode carregar, e nunca um campo que alguém tenha enfiado junto.
 */
export function seedSource(seed: Seed): string {
  const limpa = parseSeed(seed);
  if (!limpa) throw new Error('refusing to write an invalid seed into the successor');
  return `var GASCLAW_SEED = ${JSON.stringify(limpa)};\n`;
}

/**
 * Ligado ou parado. Sem semente, a regra de sempre (ligado salvo desligamento explícito). COM semente,
 * o sucessor está PARADO até um `"true"` explícito — a coroa. Vazio, lixo ou qualquer outra coisa
 * seguem parados.
 */
export const enabledWith = (runtimeEnabled: string | null, seed: Seed | null): boolean => (seed ? runtimeEnabled === 'true' : runtimeEnabled !== 'false');

/**
 * Os agentes que o sucessor serve. A lista que o dono gravou no painel VENCE a semente — ela é ponto
 * de partida, não trava. Lista gravada ilegível cai na semente em vez de quebrar o motor.
 */
export function agentsWith(stored: string | null, seed: Seed | null): AgentEntry[] {
  if (stored) {
    try {
      const v = JSON.parse(stored) as unknown;
      // Lista VAZIA gravada também vence: é o dono dizendo "removi tudo", e a semente não pode desfazer.
      if (Array.isArray(v)) return v as AgentEntry[];
    } catch {
      // cai na semente
    }
  }
  return seed ? seed.agents : [];
}

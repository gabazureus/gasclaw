/**
 * Núcleo puro do hub de painéis (P21): decide o que a tela lista, sem tocar em GAS.
 *
 * Os dois ambientes continuam isolados — daqui não sai nenhuma leitura do outro lado. A URL do
 * irmão é embutida em build time (`__SIBLING_URL__`); isto aqui só a coloca em ordem e marca
 * onde você está.
 */
export type PanelEnv = 'dev' | 'prod';
export type Panel = { env: PanelEnv; url: string; current: boolean };

/** Ambiente desconhecido conta como prod: na dúvida, a tela avisa o mais perigoso. */
export const asEnv = (env: string): PanelEnv => (env === 'dev' ? 'dev' : 'prod');

const ORDER: PanelEnv[] = ['dev', 'prod']; // a ordem é declarada aqui, não deduzida do alfabeto

/** Só painéis do Apps Script viram link: a URL vem do build, mas o invariante mora no núcleo. */
const isPanelUrl = (url: string) => url.startsWith('https://script.google.com/');

/** Os painéis conhecidos, sempre na ordem dev, prod. Entradas sem URL válida saem da lista. */
export function panelList(env: string, appUrl: string, siblingUrl: string): Panel[] {
  const here = asEnv(env);
  return ORDER.map((e) => ({ env: e, url: e === here ? appUrl : siblingUrl, current: e === here })).filter((p) => isPanelUrl(p.url));
}

// ---------- Os motores que servem este agente (F7) ----------

/**
 * Com a F7, um agente pode ser servido por mais de um MOTOR: o titular e os sucessores. O hub listava
 * só ambientes; o dono pediu a lista de todos, inclusive os sucessores, com o caminho de um ao outro.
 */
export type EngineLink = { role: 'incumbent' | 'successor'; engine: string; agent: string; url: string | null; current: boolean };

const curto = (id: string) => String(id ?? '').trim().slice(0, 8);

/**
 * O titular primeiro, os sucessores depois — e o atual marcado. No titular, `successors` vem do registro
 * dele; no sucessor, o pai vem da SEMENTE. Mesmo invariante dos ambientes: só painel do Apps Script
 * vira link, e o resto aparece sem link em vez de sumir.
 */
export function engineLinks(x: { agent: string; self: string; selfUrl: string; parent: string | null; parentUrl: string | null; successors: { scriptId: string; url: string }[] }): EngineLink[] {
  const link = (u: string | null) => (u && isPanelUrl(u) ? u : null);
  if (x.parent) {
    return [
      { role: 'incumbent', engine: curto(x.parent), agent: x.agent, url: link(x.parentUrl), current: false },
      { role: 'successor', engine: curto(x.self), agent: x.agent, url: link(x.selfUrl), current: true },
    ];
  }
  return [
    { role: 'incumbent', engine: curto(x.self), agent: x.agent, url: link(x.selfUrl), current: true },
    ...x.successors.map((s): EngineLink => ({ role: 'successor', engine: curto(s.scriptId), agent: x.agent, url: link(s.url), current: false })),
  ];
}

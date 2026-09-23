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

// ---------- O motor que serve este agente ----------

/**
 * O hub lista o MOTOR deste agente com o caminho para o painel dele. A lista de sucessores saiu com a
 * sucessão (branch `consertos-e-reach-out`); a forma de lista fica porque o hub já a desenha e porque
 * ambientes (dev/prod) continuam sendo mais de um painel para o mesmo agente.
 */
export type EngineLink = { role: 'incumbent'; engine: string; agent: string; url: string | null; current: boolean };

const curto = (id: string) => String(id ?? '').trim().slice(0, 8);

/** Só painel do Apps Script vira link; o resto aparece sem link em vez de sumir. */
export function engineLinks(x: { agent: string; self: string; selfUrl: string }): EngineLink[] {
  const link = (u: string | null) => (u && isPanelUrl(u) ? u : null);
  return [{ role: 'incumbent', engine: curto(x.self), agent: x.agent, url: link(x.selfUrl), current: true }];
}

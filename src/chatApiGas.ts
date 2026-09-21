import { accountId, createChatMessage, findDirectMessage, getChatMessage, listChatSpaces, mintChatAppToken, validServiceAccount, type ChatHttp, type ChatMessage } from './chatApi';

declare const __CHAT_SA_EMAIL__: string;

/**
 * O app consegue falar pela Chat API? Só quando a identidade foi embutida no build — e ela só entra junto
 * com o escopo IAM que a acompanha (`build.mjs`). Detecção por CAPACIDADE, nunca por `isDev()`: no dia em
 * que a prod ganhar a identidade, o caminho assíncrono passa a valer sozinho, sem tocar em código.
 */
export const chatAppAvailable = (): boolean =>
  typeof __CHAT_SA_EMAIL__ !== 'undefined' && validServiceAccount(__CHAT_SA_EMAIL__);

const gasHttp: ChatHttp = (url, request) => {
  const response = UrlFetchApp.fetch(url, {
    method: request.method,
    headers: request.headers,
    contentType: request.body === undefined ? undefined : 'application/json',
    payload: request.body === undefined ? undefined : JSON.stringify(request.body),
    muteHttpExceptions: true,
  });
  return { code: response.getResponseCode(), body: response.getContentText() };
};

const TOKEN_KEY = 'chat:app-token';
/**
 * O token do IAM vale 3600 s; guardamos por metade disso. A margem de 30 min cobre o relógio do Google e
 * encurta a janela em que um token revogado ainda seria usado — não há renovação por 401, de propósito:
 * uma entrega que falhar é retomada no tique seguinte, já com token novo.
 *
 * Sem o cache, CADA operação (o "pensando...", depois a resposta) pagava um UrlFetch extra só para cunhar
 * o mesmo token. O cache é do script, que já pode chamar `ScriptApp.getOAuthToken()` e cunhar este token
 * quando quiser: guardá-lo aqui não alarga a fronteira de confiança.
 */
const TOKEN_TTL_S = 1800;

const token = (): string => {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(TOKEN_KEY);
  if (hit) return hit;
  const fresh = mintChatAppToken(__CHAT_SA_EMAIL__, ScriptApp.getOAuthToken(), gasHttp);
  cache.put(TOKEN_KEY, fresh, TOKEN_TTL_S);
  return fresh;
};

export const createAsChatApp = (input: { space: string; thread?: string; requestId: string; message: ChatMessage }) => createChatMessage(token(), input, gasHttp);
export const getAsChatApp = (name: string) => getChatMessage(token(), name, gasHttp);
export const spacesAsChatApp = () => listChatSpaces(token(), gasHttp);
/** A conversa direta do dono do script (quem roda: no gatilho e no painel, o dono) com o app. */
export const ownerDmAsChatApp = () => findDirectMessage(token(), accountId(ScriptApp.getOAuthToken(), gasHttp), gasHttp);

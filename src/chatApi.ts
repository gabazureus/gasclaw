export type ChatHttpResponse = { code: number; body: string };
export type ChatHttp = (url: string, request: { method: 'get' | 'post'; headers: Record<string, string>; body?: unknown }) => ChatHttpResponse;
export type ChatMessage = { text?: string; markupSyntax?: string; cardsV2?: unknown[] };

const SA = /^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
const SPACE = /^spaces\/[A-Za-z0-9_-]+$/;
const THREAD = /^spaces\/[A-Za-z0-9_-]+\/threads\/[A-Za-z0-9_-]+$/;
const MESSAGE = /^spaces\/[A-Za-z0-9_-]+\/messages\/[A-Za-z0-9._-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parse = (r: ChatHttpResponse, what: string): Record<string, unknown> => {
  if (r.code < 200 || r.code >= 300) throw new Error(`${what} ${r.code}`);
  try { return JSON.parse(r.body) as Record<string, unknown>; } catch { throw new Error(`${what}: resposta invalida`); }
};

/** A identidade do app no Chat existe e tem forma de service account? Não diz nada sobre escopo ou permissão. */
export const validServiceAccount = (value: unknown): value is string => typeof value === 'string' && SA.test(value);

export function mintChatAppToken(serviceAccount: string, ownerToken: string, http: ChatHttp): string {
  if (!validServiceAccount(serviceAccount) || !ownerToken) throw new Error('identidade do Chat invalida');
  const out = parse(http(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`, {
    method: 'post', headers: { Authorization: `Bearer ${ownerToken}` }, body: { scope: ['https://www.googleapis.com/auth/chat.bot'], lifetime: '3600s' },
  }), 'IAM Credentials');
  if (typeof out.accessToken !== 'string' || !out.accessToken) throw new Error('IAM Credentials: token ausente');
  return out.accessToken;
}

export function createChatMessage(token: string, input: { space: string; thread?: string; requestId: string; message: ChatMessage }, http: ChatHttp): { name: string; thread?: string } {
  if (!token || !SPACE.test(input.space) || (input.thread !== undefined && !THREAD.test(input.thread)) || !UUID.test(input.requestId)) throw new Error('destino do Chat invalido');
  // `messageReplyOption` so vale respondendo DENTRO de uma thread. Mandando-o sem thread, o Chat devolve 400
  // em toda entrega — foi o que aconteceu na v83, quando passamos a publicar no espaco.
  const reply = input.thread ? '&messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD' : '';
  const query = `requestId=${encodeURIComponent(input.requestId)}${reply}`;
  const body = { ...input.message, ...(input.thread ? { thread: { name: input.thread } } : {}) };
  const out = parse(http(`https://chat.googleapis.com/v1/${input.space}/messages?${query}`, { method: 'post', headers: { Authorization: `Bearer ${token}` }, body }), 'Google Chat');
  if (typeof out.name !== 'string') throw new Error('Google Chat: mensagem sem nome');
  const thread = out.thread as { name?: unknown } | undefined;
  return { name: out.name, ...(typeof thread?.name === 'string' ? { thread: thread.name } : {}) };
}

export function listChatSpaces(token: string, http: ChatHttp): { name: string; type: string }[] {
  if (!token) throw new Error('token do Chat ausente');
  const out = parse(http('https://chat.googleapis.com/v1/spaces?pageSize=100', { method: 'get', headers: { Authorization: `Bearer ${token}` } }), 'Google Chat');
  const spaces = Array.isArray(out.spaces) ? out.spaces : [];
  return spaces.flatMap((value) => {
    const space = value as { name?: unknown; spaceType?: unknown };
    return typeof space.name === 'string' && SPACE.test(space.name) ? [{ name: space.name, type: String(space.spaceType ?? '') }] : [];
  });
}

export function getChatMessage(token: string, name: string, http: ChatHttp): { name: string; text: string; cardsV2: unknown[] } {
  if (!token || !MESSAGE.test(name)) throw new Error('mensagem do Chat invalida');
  const out = parse(http(`https://chat.googleapis.com/v1/${name}`, { method: 'get', headers: { Authorization: `Bearer ${token}` } }), 'Google Chat');
  if (out.name !== name) throw new Error('Google Chat: mensagem inesperada');
  return { name, text: typeof out.text === 'string' ? out.text : '', cardsV2: Array.isArray(out.cardsV2) ? out.cardsV2 : [] };
}

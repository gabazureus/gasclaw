import { describe, expect, test, vi } from 'vitest';
import { accountId, createChatMessage, findDirectMessage, getChatMessage, listChatSpaces, mintChatAppToken, type ChatHttp } from '../src/chatApi';

const response = (code: number, body: unknown) => ({ code, body: JSON.stringify(body) });

describe('cliente IAM/Google Chat', () => {
  test('pede token efemero somente com chat.bot e nunca envia chave', () => {
    const http = vi.fn<ChatHttp>(() => response(200, { accessToken: 'ya29.app', expireTime: '2030-01-01T00:00:00Z' }));
    expect(mintChatAppToken('gasclaw-chat@proj.iam.gserviceaccount.com', 'owner-oauth', http)).toBe('ya29.app');
    expect(http).toHaveBeenCalledWith(expect.stringContaining('projects/-/serviceAccounts/gasclaw-chat%40proj.iam.gserviceaccount.com:generateAccessToken'), expect.objectContaining({
      method: 'post',
      headers: { Authorization: 'Bearer owner-oauth' },
      body: { scope: ['https://www.googleapis.com/auth/chat.bot'], lifetime: '3600s' },
    }));
    expect(JSON.stringify(http.mock.calls[0])).not.toContain('private_key');
  });

  test('cria card na thread com requestId idempotente', () => {
    const http = vi.fn<ChatHttp>(() => response(200, { name: 'spaces/AAA/messages/M1', thread: { name: 'spaces/AAA/threads/T1' } }));
    const out = createChatMessage('ya29.app', {
      space: 'spaces/AAA', thread: 'spaces/AAA/threads/T1', requestId: '123e4567-e89b-42d3-a456-426614174000',
      message: { text: 'pronto', cardsV2: [{ cardId: 'fim' }] },
    }, http);
    expect(out.name).toBe('spaces/AAA/messages/M1');
    expect(http.mock.calls[0][0]).toContain('requestId=123e4567-e89b-42d3-a456-426614174000');
    expect(http.mock.calls[0][0]).toContain('messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
    expect(http.mock.calls[0][1].body).toMatchObject({ text: 'pronto', cardsV2: [{ cardId: 'fim' }], thread: { name: 'spaces/AAA/threads/T1' } });
  });

  test('recusa destino e resposta malformados sem vazar tokens', () => {
    const http = vi.fn<ChatHttp>(() => response(403, { error: { message: 'denied ya29.app' } }));
    expect(() => createChatMessage('ya29.app', { space: 'https://evil.test', requestId: '123e4567-e89b-42d3-a456-426614174000', message: { text: 'x' } }, http)).toThrow('destino');
    expect(http).not.toHaveBeenCalled();
    expect(() => mintChatAppToken('gasclaw-chat@proj.iam.gserviceaccount.com', 'owner-oauth', http)).toThrowError(/IAM Credentials 403/);
    try { mintChatAppToken('gasclaw-chat@proj.iam.gserviceaccount.com', 'owner-oauth', http); } catch (err) { expect(String(err)).not.toContain('ya29.app'); }
  });

  test('lista DMs do app e confirma o card por messages.get', () => {
    const http = vi.fn<ChatHttp>((url) => url.includes('/spaces?')
      ? response(200, { spaces: [{ name: 'spaces/AAA', spaceType: 'DIRECT_MESSAGE' }, { name: 'spaces/BBB', spaceType: 'SPACE' }] })
      : response(200, { name: 'spaces/AAA/messages/M1', cardsV2: [{ cardId: 'p2' }] }));
    expect(listChatSpaces('ya29.app', http)).toEqual([{ name: 'spaces/AAA', type: 'DIRECT_MESSAGE' }, { name: 'spaces/BBB', type: 'SPACE' }]);
    expect(getChatMessage('ya29.app', 'spaces/AAA/messages/M1', http)).toMatchObject({ name: 'spaces/AAA/messages/M1', cardsV2: [{ cardId: 'p2' }] });
  });

});

describe('createChatMessage: messageReplyOption so faz sentido com thread', () => {
  // Regressao da v83: ao publicar no ESPACO (sem thread), a query continuava mandando
  // messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD. O Google Chat respondia 400 em TODA
  // entrega, e o run ficava 'done' com a resposta pronta e delivery 'pending' para sempre.
  test('sem thread: nao envia messageReplyOption', () => {
    const http = vi.fn<ChatHttp>(() => response(200, { name: 'spaces/AAA/messages/M1' }));
    createChatMessage('t', { space: 'spaces/AAA', requestId: '123e4567-e89b-42d3-a456-426614174000', message: { text: 'oi' } }, http);

    const url = http.mock.calls[0][0];
    expect(url).toContain('requestId=123e4567-e89b-42d3-a456-426614174000');
    expect(url).not.toContain('messageReplyOption');
    expect(http.mock.calls[0][1].body).toEqual({ text: 'oi' }); // sem thread no corpo
  });

  test('com thread: envia messageReplyOption e a thread no corpo', () => {
    const http = vi.fn<ChatHttp>(() => response(200, { name: 'spaces/AAA/messages/M1' }));
    createChatMessage('t', { space: 'spaces/AAA', thread: 'spaces/AAA/threads/T1', requestId: '123e4567-e89b-42d3-a456-426614174000', message: { text: 'oi' } }, http);

    const url = http.mock.calls[0][0];
    expect(url).toContain('messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
    expect(http.mock.calls[0][1].body).toMatchObject({ thread: { name: 'spaces/AAA/threads/T1' } });
  });
});

// Auditoria 2026-09-21 (mutação): as validações da busca da conversa do dono não tinham teste.
describe('conversa direta do dono: o que a busca aceita e devolve', () => {
  test('um e-mail no lugar do id numérico nem sai daqui (com a identidade do app a Chat API o recusa)', () => {
    const http = vi.fn<ChatHttp>(() => response(200, { name: 'spaces/DM1' }));
    expect(() => findDirectMessage('ya29.app', 'dono@x.com', http)).toThrow('invalid Chat direct-message lookup');
    expect(http).not.toHaveBeenCalled();
  });
  test('uma resposta 200 sem nome de espaço válido vira null, nunca um destino', () => {
    expect(findDirectMessage('ya29.app', '123', vi.fn<ChatHttp>(() => response(200, { name: 'users/x' })))).toBeNull();
    expect(findDirectMessage('ya29.app', '123', vi.fn<ChatHttp>(() => response(200, {})))).toBeNull();
  });
  test('accountId só aceita o `sub` numérico', () => {
    expect(accountId('owner', vi.fn<ChatHttp>(() => response(200, { sub: '123' })))).toBe('123');
    expect(() => accountId('owner', vi.fn<ChatHttp>(() => response(200, { sub: 'abc' })))).toThrow('userinfo: no account id');
    expect(() => accountId('owner', vi.fn<ChatHttp>(() => response(200, {})))).toThrow('userinfo: no account id');
  });
});

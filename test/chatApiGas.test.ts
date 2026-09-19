// A borda que monta a requisição real do Chat. Estava sem teste nenhum — e é exatamente a camada onde o
// `messageReplyOption` órfão derrubou 100% das entregas com 871 testes verdes.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

const REQ = '00000001-1111-4222-8333-444444444444';

describe('chatApiGas: a requisição que realmente sobe', () => {
  let env: GasEnv;
  beforeEach(() => {
    env = stubGas();
  });
  afterEach(() => vi.unstubAllGlobals());

  test('POST leva contentType, payload JSON e muteHttpExceptions', async () => {
    const { createAsChatApp } = await import('../src/chatApiGas');
    createAsChatApp({ space: 'spaces/AAA', requestId: REQ, message: { text: 'oi' } });

    const [post] = env.fetched('chat.googleapis.com');
    expect(post.init).toMatchObject({ method: 'post', contentType: 'application/json', muteHttpExceptions: true });
    expect(JSON.parse(String(post.init.payload))).toEqual({ text: 'oi' });
    expect((post.init.headers as Record<string, string>).Authorization).toBe('Bearer ya29.fake');
  });

  test('GET não leva contentType nem payload', async () => {
    const { getAsChatApp } = await import('../src/chatApiGas');
    getAsChatApp('spaces/AAA/messages/msg1');

    const [get] = env.fetched('chat.googleapis.com');
    expect(get.init).toMatchObject({ method: 'get', muteHttpExceptions: true });
    expect([get.init.contentType, get.init.payload]).toEqual([undefined, undefined]);
  });

  test('a chamada ao IAM leva escopo chat.bot e lifetime de 3600s', async () => {
    const { createAsChatApp } = await import('../src/chatApiGas');
    createAsChatApp({ space: 'spaces/AAA', requestId: REQ, message: { text: 'oi' } });

    const [iam] = env.fetched('iamcredentials.googleapis.com');
    expect(iam.url).toContain(':generateAccessToken');
    expect(JSON.parse(String(iam.init.payload))).toEqual({ scope: ['https://www.googleapis.com/auth/chat.bot'], lifetime: '3600s' });
  });

  test('o token do IAM é cunhado uma vez só e reusado (um UrlFetch a menos por envio)', async () => {
    const { createAsChatApp } = await import('../src/chatApiGas');
    createAsChatApp({ space: 'spaces/AAA', requestId: REQ, message: { text: 'thinking…' } });
    createAsChatApp({ space: 'spaces/AAA', requestId: REQ, message: { text: 'resposta' } });

    expect(env.fetched('iamcredentials.googleapis.com')).toHaveLength(1);
    expect(env.fetched('chat.googleapis.com')).toHaveLength(2);
  });
});

import { describe, expect, test } from 'vitest';
import { hideKeys, LIVE_URL, liveSessionRequest, parseLiveSession, voiceCost, voiceInstructions } from '../src/voice';
import { buildSpec } from '../src/workspace';

const OFFER = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const KEY = 'sk-proj-CANARIO1234567890abcdef';

describe('liveSessionRequest (doc gpt-live-1: POST /v1/live/sessions, transport webrtc)', () => {
  test('monta o corpo com model, instructions, delegação client e o offer SDP', () => {
    const r = liveSessionRequest(KEY, OFFER, 'seja breve');
    expect(r.url).toBe(LIVE_URL);
    expect(r.init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(r.init.payload)).toEqual({
      session: { model: 'gpt-live-1', instructions: 'seja breve', delegation: { type: 'client' } },
      transport: { type: 'webrtc', sdp: OFFER },
    });
  });
  test.each([['', 'vazio'], ['oi', 'sem v=0'], [`v=0${'a'.repeat(20_001)}`, 'grande'], [123, 'não texto']])('offer inválido (%s) é recusado antes de chamar a OpenAI', (sdp: string | number, _caso: string) => {
    expect(() => liveSessionRequest(KEY, sdp as string, 'x')).toThrow('SDP');
  });
});

describe('parseLiveSession', () => {
  test('201 devolve só id da sessão e SDP answer', () => {
    const out = parseLiveSession(201, JSON.stringify({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } }));
    expect(out).toEqual({ sessionId: 'live_1', sdp: 'v=0\r\nanswer' });
  });
  test('erro não vaza a chave (canário) e resposta sem SDP é erro', () => {
    let msg = '';
    try {
      parseLiveSession(401, `{"error":"Incorrect API key provided: ${KEY}","h":"Bearer ${KEY}"}`);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('OpenAI live 401');
    expect(msg).not.toContain('CANARIO');
    expect(() => parseLiveSession(201, '{"session":{"id":"x"}}')).toThrow('SDP');
  });
  test('hideKeys cobre sk-proj, sk- e Bearer', () => expect(hideKeys(`a ${KEY} b sk-abcdefghijk Bearer xyz.123`)).toBe('a sk-*** b sk-*** Bearer ***'));
});

describe('custo e instruções', () => {
  test('US$ 0,05 por minuto, cobrado por segundo', () => {
    expect(voiceCost(60)).toBe(0.05);
    expect(voiceCost(15)).toBe(0.0125);
    expect(voiceCost(-3)).toBe(0);
  });
  test('instruções = prompt do agente + regra de delegar ações', () => {
    const i = voiceInstructions(buildSpec('f', 'A', { AGENTS: 'Regras X' }));
    expect(i).toContain('Regras X');
    expect(i).toContain('delegue');
  });
});

// Voz (P17), núcleo puro: sessão gpt-live-1 por WebRTC. O GAS troca o offer SDP do navegador pelo answer
// (POST /v1/live/sessions, doc OpenAI "voice-webrtc?api=live"); a chave da OpenAI nunca sai do servidor.
import type { AgentSpec } from './workspace';

export const LIVE_URL = 'https://api.openai.com/v1/live/sessions';
export const LIVE_MODEL = 'gpt-live-1';
export const USD_PER_MIN = 0.05;
const MAX_SDP = 20_000;

export const hideKeys = (s: string): string => s.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***').replace(/Bearer\s+\S+/g, 'Bearer ***');

export function liveSessionRequest(apiKey: string, offerSdp: string, instructions: string) {
  if (typeof offerSdp !== 'string' || !offerSdp.startsWith('v=0') || offerSdp.length > MAX_SDP) throw new Error('offer SDP inválido');
  return {
    url: LIVE_URL,
    init: {
      method: 'post' as const,
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: JSON.stringify({ session: { model: LIVE_MODEL, instructions, delegation: { type: 'client' } }, transport: { type: 'webrtc', sdp: offerSdp } }),
      muteHttpExceptions: true as const,
    },
  };
}

export function parseLiveSession(code: number, body: string): { sessionId: string; sdp: string } {
  if (code !== 200 && code !== 201) throw new Error(`OpenAI live ${code}: ${hideKeys(body.slice(0, 300))}`);
  const j = JSON.parse(body);
  const sdp = j.transport?.sdp;
  if (typeof sdp !== 'string' || !sdp.startsWith('v=0')) throw new Error('OpenAI live: resposta sem SDP answer');
  return { sessionId: String(j.session?.id ?? ''), sdp };
}

export const voiceCost = (seconds: number): number => Math.round((Math.max(0, seconds) * USD_PER_MIN * 1e6) / 60) / 1e6;

// minimal: prompt cortado em 8.000 caracteres (limite de instructions da sessão não consta na doc).
export const voiceInstructions = (spec: AgentSpec): string =>
  `${spec.system.slice(0, 8000)}\n\nConversa por voz em português do Brasil, frases curtas. Para memória, hora, ferramentas ou qualquer ação, delegue ao cliente e fale o resultado que ele devolver. Nunca diga que fez algo sem esse resultado.`;

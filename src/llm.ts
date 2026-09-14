export type Message = { role: 'system' | 'user' | 'assistant'; content: string };
export type Completion = { text: string; usage?: { prompt_tokens: number; completion_tokens: number } };
type Init = { method: 'post'; contentType: string; headers: Record<string, string>; payload: string; muteHttpExceptions: true };
export type Http = (url: string, init: Init) => { code: number; body: string };

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function buildRequest(apiKey: string, model: string, messages: Message[], maxTokens: number): { url: string; init: Init } {
  return {
    url: OPENROUTER_URL,
    init: {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Title': 'gasclaw' },
      payload: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      muteHttpExceptions: true,
    },
  };
}

export function parseResponse(code: number, body: string): Completion {
  if (code !== 200) throw new Error(`OpenRouter ${code}: ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('OpenRouter: resposta sem conteúdo');
  return { text, usage: json.usage };
}

// minimal: sem retry/backoff para 429/5xx; entra na F2 junto com a fila durável.
const gasHttp: Http = (url, init) => {
  const res = UrlFetchApp.fetch(url, { ...init, timeoutSeconds: 240 } as GoogleAppsScript.URL_Fetch.URLFetchRequestOptions);
  return { code: res.getResponseCode(), body: res.getContentText() };
};

export function complete(apiKey: string, model: string, messages: Message[], maxTokens: number, http: Http = gasHttp): Completion {
  const { url, init } = buildRequest(apiKey, model, messages, maxTokens);
  const res = http(url, init);
  return parseResponse(res.code, res.body);
}

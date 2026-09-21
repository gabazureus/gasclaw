export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ToolDef = { type: 'function'; function: { name: string; description: string; parameters: object } };
export type Message = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: ToolCall[]; tool_call_id?: string };
export type Completion = {
  text: string;
  toolCalls?: ToolCall[];
  usage?: { prompt_tokens: number; completion_tokens: number; cost?: number };
  id?: string;
  model?: string;
  finish_reason?: string;
};
type Init = { method: 'post'; contentType: string; headers: Record<string, string>; payload: string; muteHttpExceptions: true };
export type Http = (url: string, init: Init) => { code: number; body: string };

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Doc OpenRouter (tool calling): o assistente que pede tools vai com `content: null`. */
const wire = (m: Message) => (m.tool_calls?.length && !m.content ? { ...m, content: null } : m);

/**
 * `temperature` é opcional e entra por último de propósito: a assinatura antiga continua valendo,
 * e quem não pede temperatura manda exatamente a mesma requisição de antes. Ela existe para o ciclo
 * de sonho gerar candidatos DIFERENTES entre si (decisão do usuário: variar temperatura, não
 * modelo, para isolar a variável — o que melhorou foi o prompt, não o motor que o escreveu).
 */
export function buildRequest(apiKey: string, model: string, messages: Message[], maxTokens: number, tools: ToolDef[] = [], temperature?: number): { url: string; init: Init } {
  return {
    url: OPENROUTER_URL,
    init: {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Title': 'gasclaw' },
      payload: JSON.stringify({ model, messages: messages.map(wire), max_tokens: maxTokens, ...(tools.length ? { tools } : {}), ...(Number.isFinite(temperature) ? { temperature } : {}) }),
      muteHttpExceptions: true,
    },
  };
}

/**
 * Resposta que voltou 200 e sem texto — mas que PODE ter custado.
 *
 * D9, achado na primeira geração real da F6: `parseResponse` lançava um `Error` comum antes de devolver
 * o `usage`, e quem conta o gasto (`generateSuccessor`) só conta depois que `complete` volta. O
 * dinheiro saía e sumia — o oposto da ADR-041 §4. E o erro não dizia POR QUE veio vazio: raciocínio
 * consumindo o orçamento (`finish_reason: length`) e conteúdo em lista de blocos são causas diferentes,
 * com consertos diferentes, e consertar sem saber seria chutar.
 */
export type EmptyCompletionError = Error & { usage?: { cost?: number }; finishReason?: string; contentShape: string };

const shapeOf = (x: unknown): string => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);

export function parseResponse(code: number, body: string): Completion {
  if (code !== 200) throw new Error(`OpenRouter ${code}: ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  const msg = json.choices?.[0]?.message;
  const toolCalls: ToolCall[] | undefined = Array.isArray(msg?.tool_calls) && msg.tool_calls.length ? msg.tool_calls : undefined;
  if (typeof msg?.content !== 'string' && !toolCalls) {
    const finishReason = json.choices?.[0]?.finish_reason;
    const contentShape = shapeOf(msg?.content);
    // EM INGLÊS (ADR-033), e SEM `lang-ok`. Eu havia isentado esta frase como "erro interno, não texto
    // de tela" — e ela apareceu na tela do dono, crua, como `refused: OpenRouter: resposta sem conteúdo`.
    // A isenção era falsa. "empty response" não casa com o `SWITCH` de `freeModels.ts` (o risco seria
    // escrever "not available"), então o rodízio continua parando aqui, como deve.
    const e = new Error(`OpenRouter: empty response (finish_reason: ${finishReason ?? '?'}, content: ${contentShape})`) as EmptyCompletionError;
    e.usage = json.usage;
    e.finishReason = finishReason;
    e.contentShape = contentShape;
    throw e;
  }
  const text = typeof msg.content === 'string' ? msg.content : '';
  return { text, ...(toolCalls ? { toolCalls } : {}), usage: json.usage, id: json.id, model: json.model, finish_reason: json.choices[0].finish_reason }; // usage.cost vem sempre (docs OpenRouter)
}

// minimal: sem retry/backoff para 429/5xx; entra na F2 junto com a fila durável.
const gasHttp: Http = (url, init) => {
  const res = UrlFetchApp.fetch(url, init); // UrlFetch não tem opção de timeout: o limite é o do Google
  return { code: res.getResponseCode(), body: res.getContentText() };
};

export function complete(apiKey: string, model: string, messages: Message[], maxTokens: number, http: Http = gasHttp, tools: ToolDef[] = [], temperature?: number): Completion {
  const { url, init } = buildRequest(apiKey, model, messages, maxTokens, tools, temperature);
  const res = http(url, init);
  return parseResponse(res.code, res.body);
}

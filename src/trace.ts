// Trace do agente (ADR-014), núcleo puro: um run é uma lista de passos (spans) com ms e dados.
// A borda (runlog.ts) grava o cache ao vivo, a planilha (1 linha por run) e o JSON completo.

// `subagent`: o turno de uma PERSONA (ADR-039). Run próprio, e não span do pai, porque o contexto de
// uma tool não carrega o tracer do run que a chamou. A consequência está dita no `runPersona`: o custo
// dela aparece no uso por modelo, mas não dentro do teto por run do pai.
export type RunKind = 'chat' | 'test' | 'poc' | 'config' | 'webchat' | 'subagent';
export type Span = { name: string; startMs: number; ms: number; status: 'ok' | 'error'; data?: Record<string, unknown> };
export type RunMeta = { question?: string; agent?: string; user?: string };
export type Run = RunMeta & {
  id: string;
  kind: RunKind;
  startedAt: number;
  /** `waiting`: o turno parou esperando o dono (aprovação, resposta do `ask`, teto de custo) — nem sucesso nem erro. */
  status: 'running' | 'ok' | 'error' | 'waiting';
  step: string;
  spans: Span[];
  endedAt?: number;
  ms?: number;
  model?: string;
  tokens?: number;
  cost?: number;
  answer?: string;
  error?: string;
};

export const HEADER = ['id', 'início', 'tipo', 'agente', 'status', 'passo', 'ms', 'modelo', 'tokens', 'custo', 'pergunta', 'resposta', 'erro'] as const;
const CUT = 200;
const DAY = 86_400_000;
export const GAS_MAX_EXECUTION_MS = 360_000;
/** Limite GAS + 30 s para atrasos de relógio/cache antes de declarar abandono. */
export const LIVE_STALE_MS = GAS_MAX_EXECUTION_MS + 30_000;

export function startRun(id: string, kind: RunKind, now: number, meta: RunMeta = {}): Run {
  return { id, kind, startedAt: now, status: 'running', step: 'início', spans: [], ...meta };
}

/** Checkpoint: só o passo atual muda (ex.: antes de uma chamada lenta ao modelo). */
export const setStep = (run: Run, step: string): Run => ({ ...run, step });

export function span(run: Run, name: string, start: number, end: number, data?: Record<string, unknown>, status: Span['status'] = 'ok'): Run {
  const s: Span = { name, startMs: start - run.startedAt, ms: end - start, status, ...(data ? { data } : {}) };
  return { ...run, step: name, spans: [...run.spans, s] };
}

const num = (x: unknown) => (typeof x === 'number' ? x : 0);
const round = (x: number) => Math.round(x * 1e8) / 1e8;

/** Custo somado das chamadas ao modelo até agora — o mesmo número que `finish` grava no fim. */
export const llmCost = (run: Run): number => round(run.spans.filter((s) => s.name === 'llm_call' && s.data).reduce((t, s) => t + num(s.data?.cost), 0));

/** `waiting` diz o que o turno espera do dono; o trace não pode chamar de "ok" um run que parou (incidente de 2026-09-21). */
export type RunOutcome = { answer?: string; error?: string; waiting?: string };

export function finish(run: Run, now: number, outcome: RunOutcome): Run {
  const { waiting, ...out } = outcome;
  const llm = run.spans.filter((s) => s.name === 'llm_call' && s.data);
  const totals = llm.length
    ? {
        model: String(llm[llm.length - 1].data?.model ?? ''),
        tokens: llm.reduce((t, s) => t + num(s.data?.prompt_tokens) + num(s.data?.completion_tokens), 0),
        cost: llmCost(run),
      }
    : {};
  const espera = waiting && !out.error;
  return { ...run, ...totals, ...out, status: out.error ? 'error' : espera ? 'waiting' : 'ok', step: espera ? `aguardando: ${waiting}` : 'fim', endedAt: now, ms: now - run.startedAt };
}

/** Um processo morto pelo runtime não executa `end`; fecha sua representação ao vivo depois do limite impossível. */
export function closeStale(run: Run, now: number): Run {
  if (run.status !== 'running' || now - run.startedAt <= LIVE_STALE_MS) return run;
  const step = run.step;
  return {
    ...finish(run, run.startedAt + GAS_MAX_EXECUTION_MS, { error: 'Execução interrompida sem registrar o fim (timeout ou interrupção do Apps Script).' }),
    step: `${step} (interrompido)`,
  };
}

const SECRETS: [RegExp, string][] = [
  [/sk-or-[\w-]+/g, 'sk-or-***'],
  [/(?<![A-Za-z0-9])sk-proj-[\w-]{16,}/g, 'sk-proj-***'], // OpenAI (projeto); "chave_sk-…" também
  [/(?<![A-Za-z0-9])sk-[\w-]{16,}/g, 'sk-***'], // OpenAI (antiga); o lookbehind evita "desk-top", "risk-free"
  [/ya29\.[\w.-]+/g, 'ya29.***'],
  [/\b1\/\/0[\w-]{20,}/g, '1//***'], // refresh token do Google
  [/\b(Bearer)(?:\s|%20)+[\w.~+/-]+=*/gi, '$1 ***'],
  [/\b(Basic)(?:\s|%20)+[A-Za-z0-9+/]{8,}=*/gi, '$1 ***'],
];

/** Remove chaves e tokens de qualquer valor, em qualquer profundidade, inclusive nas chaves de objeto (aplicado antes de toda gravação). */
export function redact<T>(v: T): T {
  if (typeof v === 'string') return SECRETS.reduce((s, [re, r]) => s.replace(re, r), v as string) as T;
  if (Array.isArray(v)) return v.map(redact) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [redact(k), redact(x)])) as T;
  return v;
}

const cut = (s?: string) => (s ?? '').slice(0, CUT);
/** Horário de São Paulo (UTC−3, sem horário de verão desde 2019), o mesmo fuso do id do run. */
const spTime = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().replace('Z', '-03:00');

/** Linha da planilha "gasclaw — execuções", na ordem de HEADER. */
export function summaryRow(run: Run): (string | number)[] {
  const r = redact(run);
  return [r.id, spTime(r.startedAt), r.kind, r.agent ?? '', r.status, r.step, r.ms ?? '', r.model ?? '', r.tokens ?? '', r.cost ?? '', cut(r.question), cut(r.answer), cut(r.error)];
}

/** Árvore legível do run (terminal e tela). */
export function renderTree(run: Run): string {
  const r = redact(run);
  const head = `${r.id} · ${r.kind} · ${r.status} · ${r.ms ?? '…'} ms${r.agent ? ` · ${r.agent}` : ''}`;
  const spans = r.spans ?? []; // JSON de reserva antigo do lote não tem spans
  const lines = spans.map((s, i) => {
    const d = s.data ?? {};
    const extra = [
      d.model ? String(d.model) : '',
      d.prompt_tokens !== undefined ? `${num(d.prompt_tokens) + num(d.completion_tokens)} tokens` : '',
      d.cost !== undefined ? `$${d.cost}` : '',
      d.origem ? `origem ${Object.entries(d.origem as Record<string, string>).map(([k, v]) => `${k}=${v}`).join(',')}` : '',
      d.editorError ? `editor falhou: ${String(d.editorError)}` : '',
      s.status === 'error' ? `ERRO ${String(d.error ?? '')}` : '',
    ].filter(Boolean);
    return `${i === r.spans.length - 1 ? '└─' : '├─'} ${s.name.padEnd(14)} ${s.ms} ms${extra.length ? ` · ${extra.join(' · ')}` : ''}`;
  });
  const tail = [r.question ? `   pergunta: ${r.question.slice(0, 120)}` : '', r.answer ? `   resposta: ${r.answer.slice(0, 120)}` : '', r.error ? `   erro: ${r.error}` : ''].filter(Boolean);
  return [head, ...lines, ...tail].join('\n');
}

/** Soma dos passos / duração do run (C8: entre 0,9 e 1,1). */
export const coverage = (run: Run): number => (run.ms ? run.spans.reduce((t, s) => t + s.ms, 0) / run.ms : 0);

export const expired = (createdMs: number, now: number, days = 90): boolean => now - createdMs > days * DAY;

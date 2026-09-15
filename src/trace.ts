// Trace do agente (ADR-014), núcleo puro: um run é uma lista de passos (spans) com ms e dados.
// A borda (runlog.ts) grava o cache ao vivo, a planilha (1 linha por run) e o JSON completo.

export type RunKind = 'chat' | 'test' | 'poc' | 'config';
export type Span = { name: string; startMs: number; ms: number; status: 'ok' | 'error'; data?: Record<string, unknown> };
export type RunMeta = { question?: string; agent?: string; user?: string };
export type Run = RunMeta & {
  id: string;
  kind: RunKind;
  startedAt: number;
  status: 'running' | 'ok' | 'error';
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

export function finish(run: Run, now: number, out: { answer?: string; error?: string }): Run {
  const llm = run.spans.filter((s) => s.name === 'llm_call' && s.data);
  const totals = llm.length
    ? {
        model: String(llm[llm.length - 1].data?.model ?? ''),
        tokens: llm.reduce((t, s) => t + num(s.data?.prompt_tokens) + num(s.data?.completion_tokens), 0),
        cost: round(llm.reduce((t, s) => t + num(s.data?.cost), 0)),
      }
    : {};
  return { ...run, ...totals, ...out, status: out.error ? 'error' : 'ok', step: 'fim', endedAt: now, ms: now - run.startedAt };
}

const SECRETS: [RegExp, string][] = [
  [/sk-or-[\w-]+/g, 'sk-or-***'],
  [/ya29\.[\w.-]+/g, 'ya29.***'],
  [/Bearer\s+[\w.~+/-]+=*/g, 'Bearer ***'],
];

/** Remove chaves e tokens de qualquer valor, em qualquer profundidade (aplicado antes de toda gravação). */
export function redact<T>(v: T): T {
  if (typeof v === 'string') return SECRETS.reduce((s, [re, r]) => s.replace(re, r), v as string) as T;
  if (Array.isArray(v)) return v.map(redact) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x)])) as T;
  return v;
}

const cut = (s?: string) => (s ?? '').slice(0, CUT);

/** Linha da planilha "gasclaw — execuções", na ordem de HEADER. */
export function summaryRow(run: Run): (string | number)[] {
  const r = redact(run);
  return [r.id, new Date(r.startedAt).toISOString(), r.kind, r.agent ?? '', r.status, r.step, r.ms ?? '', r.model ?? '', r.tokens ?? '', r.cost ?? '', cut(r.question), cut(r.answer), cut(r.error)];
}

/** Árvore legível do run (terminal e tela). */
export function renderTree(run: Run): string {
  const r = redact(run);
  const head = `${r.id} · ${r.kind} · ${r.status} · ${r.ms ?? '…'} ms${r.agent ? ` · ${r.agent}` : ''}`;
  const lines = r.spans.map((s, i) => {
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

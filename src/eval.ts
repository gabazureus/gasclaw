// Evals (E0), núcleo puro: cenário markdown do repositório (evals/*.md, nunca do Drive) → verificações → veredito.
import type { Completion, Message } from './llm';
import { parseFrontmatter } from './workspace';

export const CHECKS = ['span', 'calledTool', 'noTool', 'includes', 'refused', 'approved', 'denied', 'stopped', 'pending', 'noError', 'cleaned'] as const;
export type Check = { kind: (typeof CHECKS)[number]; arg: string };
export type ScriptItem = { tool: string; args: string } | { text: string };
export type Scenario = {
  name: string;
  channel: 'chat' | 'tela';
  model?: string; // sobrepõe o modelo do agente de eval (tools exigem modelo com suporte)
  tools?: string[];
  steps?: number;
  resetMemory: boolean;
  judge?: string;
  turns: (string | null)[]; // null = nova sessão (histórico zerado)
  script: ScriptItem[]; // roteiro no lugar do modelo (determinístico)
  checks: Check[];
};
export type TurnOutcome = { reply: string; spans: string[]; tools: { name: string; status: string }[]; stopped?: string };
/** cleaned = dados de teste criados na conta do dono e apagados pelo runner no fim (E6). */
export type Outcome = { turns: TurnOutcome[]; judge?: { pass: boolean; reason: string }; cleaned?: number };
export type Report = { name: string; pass: boolean; checks: { check: string; pass: boolean }[]; judge?: Outcome['judge'] };

function sections(body: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of body.split(/^## /m).slice(1)) {
    const [head, ...lines] = part.split('\n');
    out[head.trim().toLowerCase()] = lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
  }
  return out;
}

export function parseScenario(md: string): Scenario {
  const { data, body } = parseFrontmatter(md);
  const str = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : undefined);
  const name = str('name');
  if (!name) throw new Error('cenário sem name no frontmatter');
  const channel = str('channel') ?? 'chat';
  if (channel !== 'chat' && channel !== 'tela') throw new Error(`channel inválido: ${channel} (use chat ou tela)`);
  const s = sections(body);
  if (!s.turnos?.length) throw new Error(`${name}: cenário sem ## turnos`);
  if (!s['verificações']?.length) throw new Error(`${name}: cenário sem ## verificações`);
  const checks = s['verificações'].map((l): Check => {
    const [kind, ...rest] = l.split(':');
    if (!(CHECKS as readonly string[]).includes(kind.trim())) throw new Error(`${name}: verificação desconhecida: ${kind}`);
    return { kind: kind.trim() as Check['kind'], arg: rest.join(':').trim() };
  });
  const script = (s.roteiro ?? []).map((l): ScriptItem => {
    const tool = l.match(/^tool:\s*(\S+)\s*(.*)$/);
    return tool ? { tool: tool[1], args: tool[2] || '{}' } : { text: l.replace(/^texto:\s*/, '') };
  });
  const steps = str('steps') ? Number(str('steps')) : undefined;
  if (steps !== undefined && !(Number.isInteger(steps) && steps >= 1 && steps <= 50)) throw new Error(`${name}: steps inválido (inteiro de 1 a 50)`);
  return {
    name,
    channel,
    model: str('model'),
    tools: Array.isArray(data.tools) ? data.tools : undefined,
    steps,
    resetMemory: str('memory') === 'reset',
    judge: str('judge'),
    turns: s.turnos.map((t) => (/^\(nova sessão\)$/i.test(t) ? null : t)),
    script,
    checks,
  };
}

export function evaluate(s: Scenario, o: Outcome): Report {
  const tools = o.turns.flatMap((t) => t.tools);
  const has = (name: string, status: string) => tools.some((t) => t.name === name && t.status === status);
  const last = (o.turns[o.turns.length - 1]?.reply ?? '').toLowerCase();
  const test: Record<Check['kind'], (arg: string) => boolean> = {
    span: (a) => o.turns.some((t) => t.spans.includes(a)),
    calledTool: (a) => has(a, 'ok'),
    noTool: () => tools.length === 0,
    includes: (a) => last.includes(a.toLowerCase()),
    refused: (a) => has(a, 'refused'),
    approved: (a) => has(a, 'approved'),
    denied: (a) => has(a, 'denied'),
    stopped: (a) => o.turns.some((t) => t.stopped === a),
    pending: (a) => has(a, 'pending'),
    noError: () => !tools.some((t) => t.status === 'error'),
    cleaned: (a) => (o.cleaned ?? 0) === Number(a),
  };
  const checks = s.checks.map((c) => ({ check: c.arg ? `${c.kind}: ${c.arg}` : c.kind, pass: test[c.kind](c.arg) }));
  // Juiz é soft (como no Eve): entra no relatório, não reprova.
  return { name: s.name, pass: checks.every((c) => c.pass), checks, ...(o.judge ? { judge: o.judge } : {}) };
}

export function judgeMessages(criterion: string, convo: { user: string; reply: string }[]): Message[] {
  return [
    { role: 'system', content: 'Você avalia a conversa de um agente. Responda numa linha: "PASS: motivo" ou "FAIL: motivo". Nada além disso.' },
    { role: 'user', content: `Critério: ${criterion}\n\nConversa:\n${convo.map((c) => `usuário: ${c.user}\nagente: ${c.reply}`).join('\n')}` },
  ];
}

export function parseJudge(text: string): { pass: boolean; reason: string } {
  const m = text.trim().match(/^(PASS|FAIL)\s*[:\-–]?\s*(.*)$/im);
  return m ? { pass: m[1].toUpperCase() === 'PASS', reason: m[2].trim() } : { pass: false, reason: `juiz sem veredito: ${text.trim().slice(0, 200)}` };
}

/** Modelo de roteiro: cada chamada consome um item; depois do fim repete o último (para estourar `steps`). */
export function scriptedLlm(items: ScriptItem[]): () => Completion {
  if (!items.length) throw new Error('roteiro vazio');
  let n = 0;
  return () => {
    const item = items[Math.min(n, items.length - 1)];
    n++;
    return 'tool' in item ? { text: '', toolCalls: [{ id: `s${n}`, type: 'function', function: { name: item.tool, arguments: item.args } }], finish_reason: 'tool_calls' } : { text: item.text };
  };
}

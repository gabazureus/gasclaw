// POC P22: mede no dev o que a proatividade acrescenta à cota de gatilho.
// Cada sonda grava o próprio cronômetro no Cache, de DENTRO do gatilho (ADR-027 §3): a API de
// processos chega atrasada demais para deltas curtos e já invalidou amostras da P3.
import { median, p22Verdict, type P22Input, type P22Result } from './verdict';

const PARTIAL = 'poc:p22';
export const TICK_REQ = 'poc:p22:tick:req';
export const TICK_RESULT = 'poc:p22:tick:result';
export const WAKE_REQ = 'poc:p22:wake:req';
export const WAKE_RESULT = 'poc:p22:wake:result';
const SIX_HOURS = 21_600;
/** Espera de um ciclo de gatilho com folga (o gatilho é de 1 min). Mesmo valor da P3. */
const WAKE_MS = 80_000;

export type TickProbe = { ok?: boolean; ms?: number; jobs?: number; due?: number; errors?: number; error?: string };
export type WakeProbe = { ok?: boolean; ms?: number; completed?: boolean; error?: string };

const cache = () => CacheService.getScriptCache();
const partial = (): P22Input => JSON.parse(cache().get(PARTIAL) ?? '{}');
const savePartial = (p: P22Input) => cache().put(PARTIAL, JSON.stringify(p), SIX_HOURS);

/** Sonda corrompida é `null`, nunca exceção: um JSON ruim não pode passar por medição boa. */
export function parseProbe<T>(raw: string | null): T | null {
  try {
    const v = JSON.parse(raw ?? 'null') as T | null;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/** Pede uma sonda ao gatilho e espera o resultado aparecer no Cache. */
function ask<T>(reqKey: string, reqValue: string, resultKey: string): T | null {
  cache().remove(resultKey);
  cache().put(reqKey, reqValue, SIX_HOURS);
  Utilities.sleep(WAKE_MS);
  return parseProbe<T>(cache().get(resultKey));
}

function etapaTick(): { poc: 'P22'; step: 'tick'; pass: boolean; idleMs: number | null; agendaMs: number | null; amostras: number; jobs: number | null; due: number | null } {
  // C1: tique com agenda vazia. C2: mesmo tique com 20 compromissos, nenhum vencendo.
  const idle = ask<TickProbe>(TICK_REQ, '0', TICK_RESULT);
  const agenda = ask<TickProbe>(TICK_REQ, '20', TICK_RESULT);
  const p = partial();
  // ACUMULA em vez de sobrescrever: rodar `tick` de novo acrescenta uma amostra, e o veredito decide pela
  // MEDIANA. Antes, cada execução apagava a anterior e o julgamento saía da última — uma amostra ruidosa
  // reprovava a POC sozinha, que foi exatamente o que aconteceu (433, 544 e 1000 ms, e o 1000 decidiu).
  if (idle?.ok && typeof idle.ms === 'number') {
    const s = [...(p.idle?.samples ?? []), idle.ms];
    p.idle = { ms: median(s), samples: s };
  }
  if (agenda?.ok && typeof agenda.ms === 'number') {
    const s = [...(p.agenda?.samples ?? []), agenda.ms];
    p.agenda = { ms: median(s), samples: s, jobs: agenda.jobs ?? 0, due: agenda.due ?? 0 };
  }
  p.triggers = { count: ScriptApp.getProjectTriggers().length };
  savePartial(p);
  return {
    poc: 'P22',
    step: 'tick',
    pass: Boolean(p.idle && p.agenda),
    idleMs: p.idle?.ms ?? null,
    agendaMs: p.agenda?.ms ?? null,
    amostras: p.idle?.samples?.length ?? 0, // quem mede precisa ver quantas já entraram
    jobs: p.agenda?.jobs ?? null,
    due: p.agenda?.due ?? null,
  };
}

function etapaWake(params: Record<string, string>): { poc: 'P22'; step: 'wake'; pass: boolean; ms: number | null; completed: boolean; realTurnMs: number | null } {
  const wake = ask<WakeProbe>(WAKE_REQ, '1', WAKE_RESULT);
  const p = partial();
  // `realTurnMs` vem de fora, de um turno REAL observado. Sem ele o veredito recusa projetar:
  // o passo sintético não chama o modelo, então é piso, não resposta.
  const real = Number(params.turno);
  if (wake?.ok && typeof wake.ms === 'number') {
    p.wake = {
      ms: wake.ms,
      completed: wake.completed === true,
      wakesPerDay: Number(params.despertares) || 48, // heartbeat de 30 min em 24 h
      ...(Number.isFinite(real) && real > 0 ? { realTurnMs: real } : {}),
    };
  }
  savePartial(p);
  return { poc: 'P22', step: 'wake', pass: p.wake?.completed === true, ms: p.wake?.ms ?? null, completed: p.wake?.completed === true, realTurnMs: p.wake?.realTurnMs ?? null };
}

export function pocP22(step?: string, params: Record<string, string> = {}): unknown {
  if (step === 'reset') {
    for (const k of [PARTIAL, TICK_REQ, TICK_RESULT, WAKE_REQ, WAKE_RESULT]) cache().remove(k);
    return { poc: 'P22', step: 'reset', pass: true };
  }
  if (step === 'tick') return etapaTick();
  if (step === 'wake') return etapaWake(params);
  if (step === 'fim' || !step) return veredito();
  return { poc: 'P22', pass: false, error: `etapa desconhecida: ${step}` };
}

function veredito(): P22Result {
  return p22Verdict(partial());
}

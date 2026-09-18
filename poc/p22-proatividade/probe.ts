// POC P22, parte pura das sondas: gera a agenda sintética e mede a avaliação.
// Fica fora de `src/` de propósito — o despertar de verdade (F3a.3) só pode ser escrito DEPOIS
// desta medição, senão a POC deixaria de ser gate de viabilidade.
import { dueJobs, parseAgenda, type Job } from '../../src/agenda';

/** Minutos desde a meia-noite local, a partir do epoch e do fuso em minutos. */
export const localMinute = (now: number, tzOffsetMin: number): number => Math.floor((now + tzOffsetMin * 60_000) / 60_000) % 1440;

/**
 * `n` compromissos que existem, são válidos e **não vencem agora** — é isso que C2 mede: o preço
 * que a agenda cobra em TODO tique, mesmo quando não há nada a fazer.
 *
 * A janela ativa fica ~2 h à frente do horário local, então nenhum deles vence, a qualquer hora do dia.
 */
export function syntheticAgenda(n: number, now: number, tzOffsetMin: number): string {
  const base = (localMinute(now, tzOffsetMin) + 120) % 1380; // %1380 deixa espaço para o +1 sem virar o dia
  const hh = String(Math.floor(base / 60)).padStart(2, '0');
  const mm = String(base % 60).padStart(2, '0');
  const end = String(Math.floor((base + 1) / 60)).padStart(2, '0') + ':' + String((base + 1) % 60).padStart(2, '0');
  return Array.from({ length: n }, (_, i) => `a cada 1m ${hh}:${mm}-${end} | sonda sintética ${i}`).join('\n');
}

/** Um compromisso que vence AGORA, para a sonda do despertar. */
export const dueAgenda = (): string => 'a cada 1m | despertar sintético da P22';

export type AgendaProbe = { jobs: number; due: number; errors: number };

/** Exatamente o trabalho que um tique faria: ler o texto, entender e perguntar quem venceu. */
export function evaluateAgenda(text: string, lastFired: Record<string, number>, now: number, tzOffsetMin: number): AgendaProbe & { dueList: Job[] } {
  const parsed = parseAgenda(text);
  const dueList = dueJobs(parsed.jobs, lastFired, now, tzOffsetMin);
  return { jobs: parsed.jobs.length, due: dueList.length, errors: parsed.errors.length, dueList };
}

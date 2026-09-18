// Agenda do agente (F3): a tabela de compromissos lida de `jobs.md`. NÚCLEO PURO — sem Drive,
// sem Properties, sem relógio: quem chama passa `now` e o fuso. Só markdown entra; nada executa (ADR-002).
//
// Gramática FECHADA, duas formas (a terceira foi cortada na revisão de desenho: as duas cobrem
// todos os casos que a spec enuncia, e gramática cresce sozinha):
//
//   a cada 30m 08:00-20:00 | HEARTBEAT      ← intervalo, com janela ativa opcional
//   seg-sex 07:00 | briefing do dia         ← diário, nos dias listados
//
// Não é cron: cron não expressa janela ativa nem fuso, e um parser completo seria máquina que
// ninguém pediu. Linhas vazias e `#` são ignoradas.

/** Teto de compromissos por agente. As Script Properties são COMPARTILHADAS com a fila `R:` dos
 *  runs (~500 KB no total): uma agenda grande vinda da pasta não pode derrubar o pump. */
export const MAX_JOBS = 20;
const MAX_LINE = 500;
const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
const MIN_PER_DAY = 1440;

export type EveryJob = { id: string; line: string; intent: string; kind: 'every'; everyMin: number; from?: number; to?: number };
export type DailyJob = { id: string; line: string; intent: string; kind: 'daily'; days: number[]; at: number };
export type Job = EveryJob | DailyJob;
export type AgendaParse = { jobs: Job[]; errors: string[] };

/** Identidade estável de um compromisso, derivada da linha normalizada.
 *  Vira parte da chave `JOB:<folderId>:<id>`, por isso é curta. NÃO é credencial: uma colisão
 *  atrapalha o horário de um disparo, nunca autoriza nada (diferente da chave de grant do `once`). */
export function jobId(line: string): string {
  const norm = line.trim().toLowerCase().replace(/\s+/g, ' ');
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h * 33) ^ norm.charCodeAt(i)) >>> 0;
  return `j${h.toString(36)}`;
}

/** "-03:00" (o `offset` de `zone()`) → -180 minutos. Offset ilegível vira 0 = UTC, nunca exceção:
 *  um fuso ruim não pode derrubar o gatilho; no pior caso a agenda dispara no horário errado. */
export function offsetMinutes(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(String(offset ?? '').trim());
  if (!m) return 0;
  const min = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -min : min;
}

/** "07:30" → 450 minutos desde a meia-noite. `null` se não for hora válida. */
const minutesOf = (hh: string, mm: string): number | null => {
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

/** "seg-sex", "sab", "todos" → índices de dia da semana (0 = domingo). `null` se algum nome for desconhecido. */
const daysOf = (spec: string): number[] | null => {
  if (spec === 'todos') return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const range = part.split('-');
    const idx = range.map((d) => DAYS.indexOf(d.trim() as (typeof DAYS)[number]));
    if (idx.some((i) => i < 0) || idx.length > 2 || !idx.length) return null;
    if (idx.length === 1) out.add(idx[0]);
    else for (let d = idx[0]; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === idx[1]) break;
    }
  }
  return [...out].sort((a, b) => a - b);
};

const EVERY = /^a cada (-?\d+)m(?:\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2}))?$/;
const DAILY = /^([a-z,\-]+)\s+(\d{1,2}):(\d{2})$/;

function parseLine(line: string): Job | string {
  const bar = line.indexOf('|');
  if (bar < 0) return 'falta o "|" separando quando e o quê';
  const when = line.slice(0, bar).trim().toLowerCase();
  const intent = line.slice(bar + 1).trim();
  if (!intent) return 'intenção vazia';

  const every = EVERY.exec(when);
  if (every) {
    const everyMin = Number(every[1]);
    if (!Number.isInteger(everyMin) || everyMin <= 0) return 'o intervalo precisa ser um número de minutos maior que zero';
    if (!every[2]) return { id: jobId(line), line, intent, kind: 'every', everyMin };
    const from = minutesOf(every[2], every[3]);
    const to = minutesOf(every[4], every[5]);
    if (from === null || to === null) return 'janela ativa com hora inválida';
    if (from >= to) return 'a janela ativa precisa começar antes de terminar';
    return { id: jobId(line), line, intent, kind: 'every', everyMin, from, to };
  }

  const daily = DAILY.exec(when);
  if (daily) {
    const days = daysOf(daily[1]);
    if (!days) return `dias desconhecidos: use ${DAYS.join(', ')}, intervalos como "seg-sex", ou "todos"`;
    const at = minutesOf(daily[2], daily[3]);
    if (at === null) return 'hora inválida';
    return { id: jobId(line), line, intent, kind: 'daily', days, at };
  }
  return 'não entendi o "quando": use "a cada 30m [08:00-20:00]" ou "seg-sex 07:00"';
}

/** Lê `jobs.md`. Uma linha ruim é descartada com aviso e as outras continuam valendo — a agenda
 *  não CONCEDE nada, então falhar linha a linha é seguro (o oposto da lista `auto`, que falha por inteiro). */
export function parseAgenda(text: string, max = MAX_JOBS): AgendaParse {
  const jobs: Job[] = [];
  const errors: string[] = [];
  const lines = String(text ?? '').split('\n');
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.length > MAX_LINE) {
      errors.push(`linha ${i + 1}: acima de ${MAX_LINE} caracteres, ignorada`);
      continue;
    }
    if (jobs.length >= max) {
      errors.push(`teto de ${max} compromissos atingido; as linhas seguintes foram ignoradas`);
      break;
    }
    const r = parseLine(line);
    if (typeof r === 'string') errors.push(`linha ${i + 1}: ${r}`);
    else jobs.push(r);
  }
  return { jobs, errors };
}

/** Minutos desde a meia-noite local e dia da semana local, a partir do epoch e do fuso em minutos. */
const localOf = (now: number, tzOffsetMin: number): { minute: number; day: number; dayStart: number } => {
  const shifted = now + tzOffsetMin * 60_000;
  const minute = Math.floor(shifted / 60_000) % MIN_PER_DAY;
  const day = Math.floor(shifted / 86_400_000 + 4) % 7; // 1970-01-01 foi quinta (4)
  return { minute, day: (day + 7) % 7, dayStart: now - minute * 60_000 };
};

/**
 * Quais compromissos venceram agora. Avaliada a cada tique do gatilho de 1 min que já existe —
 * nenhum gatilho novo (ADR-027), e nenhum run materializado com antecedência.
 *
 * Um compromisso perdido durante uma indisponibilidade dispara UMA vez ao voltar, não uma por
 * ocorrência perdida (decisão do gate).
 */
export function dueJobs(jobs: Job[], lastFired: Record<string, number>, now: number, tzOffsetMin: number): Job[] {
  if (!jobs.length) return [];
  const { minute, day, dayStart } = localOf(now, tzOffsetMin);
  return jobs.filter((j) => {
    const last = lastFired[j.id] ?? 0;
    if (j.kind === 'every') {
      if (j.from !== undefined && j.to !== undefined && (minute < j.from || minute > j.to)) return false;
      return now - last >= j.everyMin * 60_000;
    }
    if (!j.days.includes(day)) return false;
    const scheduled = dayStart + j.at * 60_000;
    return now >= scheduled && last < scheduled;
  });
}

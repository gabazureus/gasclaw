// A agenda da proatividade: QUANDO o agente acorda e O QUE ele faz sozinho. NÚCLEO PURO.
//
// **Por que ela mora no painel e não na pasta, que é o buraco real que a F3a fecha:**
//
// A pasta do agente é COMPARTILHÁVEL. Um `jobs.md` dentro dela entregaria ao editor da pasta duas
// coisas de uma vez: o PROMPT de um run que ninguém vai supervisionar, e o DESTINO da entrega. Quem
// tem acesso de edição ao Drive passaria a escrever o que o agente faz às 3 da manhã e para onde o
// resultado vai. Não é escalonamento sutil: é o agente inteiro, sem ninguém olhando.
//
// A regra do projeto já dizia o caminho (ADR-021): a pasta SUGERE, o painel DECIDE. Aqui a pasta não
// sugere sequer — a agenda nasce no painel, em Script Properties, onde só o dono escreve.
//
// O que este módulo NÃO faz: gatilho novo. O worker de 1 minuto que já existe é quem pergunta "tem
// algo vencido?". A P22 mediu que perguntar custa 13,87% da cota diária e que cabem 6 agentes.

export type Job = {
  /** Minutos desde a meia-noite, no fuso do script. Simples de propósito: cron é linguagem, e uma linguagem aqui viraria outra superfície editável. */
  at: number;
  /** O que pedir ao agente. Escrito pelo DONO no painel. */
  prompt: string;
  /** Dias da semana (0 = domingo). Vazio = todos os dias. */
  days: number[];
};

export const JOB_MAX = 10;
const PROMPT_MAX = 500;

export type ParseResult = { jobs: Job[]; errors: string[] };

const minutesOf = (hhmm: string): number | null => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Lê a agenda gravada. Uma entrada ruim é RECUSADA COM MOTIVO, não corrigida em silêncio.
 *
 * Corrigir em silêncio (arredondar um horário, ignorar um dia inválido) faria o agente acordar numa
 * hora que o dono não pediu — e ele descobriria pelo resultado, não pelo aviso.
 */
export function parseSchedule(raw: string | null | undefined): ParseResult {
  if (!raw) return { jobs: [], errors: [] };
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return { jobs: [], errors: ['the schedule could not be read'] }; // ilegível = nenhum job, nunca todos
  }
  if (!Array.isArray(arr)) return { jobs: [], errors: ['the schedule is not a list'] };
  const jobs: Job[] = [];
  const errors: string[] = [];
  for (const [i, x] of arr.entries()) {
    if (jobs.length >= JOB_MAX) {
      errors.push(`only the first ${JOB_MAX} entries are used`);
      break;
    }
    const o = (x ?? {}) as Record<string, unknown>;
    const at = typeof o.at === 'number' ? o.at : minutesOf(String(o.at ?? ''));
    if (at === null || !Number.isInteger(at) || at < 0 || at > 1439) {
      errors.push(`entry ${i + 1}: invalid time`);
      continue;
    }
    const prompt = String(o.prompt ?? '').trim().slice(0, PROMPT_MAX);
    if (!prompt) {
      errors.push(`entry ${i + 1}: say what it should do`);
      continue;
    }
    const days = Array.isArray(o.days) ? [...new Set(o.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
    jobs.push({ at, prompt, days });
  }
  return { jobs, errors };
}

export const serializeSchedule = (jobs: readonly Job[]): string => JSON.stringify(jobs.slice(0, JOB_MAX));

/**
 * O que venceu desde a última olhada. Recebe `lastSeen` em minutos-do-dia e devolve os jobs na janela.
 *
 * **Janela, e não igualdade:** o worker de 1 min pode atrasar (fila, cota, execução longa). Comparar
 * `at === agora` perderia o job silenciosamente no minuto em que o tique não rodou — e a P22 mediu
 * tiques de até 1.090 ms num desenho que já regrediu antes. Perder um despertar sem dizer nada é
 * exatamente o modo de falha que a proatividade não pode ter.
 *
 * `lastSeen === null` (primeira volta do dia, ou estado perdido) NÃO dispara nada: acordar o agente
 * para tudo que passou enquanto ele estava desligado seria uma avalanche, não proatividade.
 */
export function dueJobs(jobs: readonly Job[], lastSeen: number | null, now: number, weekday: number): Job[] {
  if (lastSeen === null || !Number.isInteger(now)) return [];
  // VIRADA DO DIA — o primeiro defeito achado pela SUCESSÃO (P32, rodada 2, dev v147). Aqui havia
  // `if (now < lastSeen) return []`: à meia-noite `now` recomeça em 0 com `lastSeen` ainda em 1439, e
  // a lista voltava vazia. Como `tickProactive` grava `lastSeen = minutos` antes e sempre, o tique
  // seguinte já tinha `lastSeen = 0`, e `j.at > 0` excluía para sempre um job às 00:00 — um agente
  // agendado para meia-noite nunca acordava.
  //
  // O Opus recebeu o código do agente e propôs esta troca; ela foi conferida contra o chamador antes
  // de ser portada. Virar o dia vira "o dia começa agora": dispara o que venceu desde a meia-noite
  // (`at <= now`), e nada mais — o cuidado original de não disparar o dia inteiro continua valendo.
  const desde = now < lastSeen ? -1 : lastSeen;
  return jobs.filter((j) => (j.days.length === 0 || j.days.includes(weekday)) && j.at > desde && j.at <= now);
}

/** O que a tela mostra de cada job. Em inglês (ADR-033). */
export const jobText = (j: Job): string => {
  const hh = String(Math.floor(j.at / 60)).padStart(2, '0');
  const mm = String(j.at % 60).padStart(2, '0');
  const dias = j.days.length === 0 ? 'every day' : j.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
  return `${hh}:${mm} · ${dias}`;
};

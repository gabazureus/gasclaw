import { describe, expect, it } from 'vitest';
import { MAX_JOBS, dueJobs, jobId, offsetMinutes, parseAgenda } from '../src/agenda';

// Fuso do projeto nos testes: São Paulo, -03:00.
const TZ = -180;
/** Epoch de uma data/hora LOCAL, para os testes falarem no fuso do usuário. */
const local = (iso: string): number => Date.parse(`${iso}:00.000Z`) - TZ * 60_000;

describe('parseAgenda', () => {
  it('lê as duas formas da gramática', () => {
    const r = parseAgenda('a cada 30m 08:00-20:00 | HEARTBEAT\nseg-sex 07:00 | briefing do dia');
    expect(r.errors).toEqual([]);
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs[0]).toMatchObject({ kind: 'every', everyMin: 30, from: 480, to: 1200, intent: 'HEARTBEAT' });
    expect(r.jobs[1]).toMatchObject({ kind: 'daily', at: 420, intent: 'briefing do dia' });
    expect((r.jobs[1] as { days: number[] }).days).toEqual([1, 2, 3, 4, 5]);
  });

  it('aceita "a cada" sem janela e "todos" como dias', () => {
    const r = parseAgenda('a cada 15m | olhar a caixa\ntodos 09:30 | bom dia');
    expect(r.errors).toEqual([]);
    expect(r.jobs[0]).toMatchObject({ kind: 'every', everyMin: 15 });
    expect(r.jobs[0]).not.toHaveProperty('from'); // sem janela, a chave nem existe
    expect(r.jobs[0]).not.toHaveProperty('to');
    expect((r.jobs[1] as { days: number[] }).days).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('ignora linhas vazias e comentários', () => {
    const r = parseAgenda('\n# um comentário\n\nseg 07:00 | x\n');
    expect(r.errors).toEqual([]);
    expect(r.jobs).toHaveLength(1);
  });

  // Doutrina: config que AGENDA falha linha a linha; config que CONCEDE falha por inteiro.
  it('descarta a linha inválida e mantém as outras', () => {
    const r = parseAgenda('seg-sex 07:00 | bom\nbanana 99:99 | ruim\nsab 10:00 | também bom');
    expect(r.jobs).toHaveLength(2);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('linha 2');
  });

  it.each([
    ['sem intenção', 'seg-sex 07:00'],
    ['intenção vazia', 'seg-sex 07:00 |   '],
    ['hora impossível', 'seg-sex 25:00 | x'],
    ['minuto impossível', 'seg-sex 07:61 | x'],
    ['dia desconhecido', 'lun 07:00 | x'],
    ['intervalo zero', 'a cada 0m | x'],
    ['intervalo negativo', 'a cada -5m | x'],
    ['janela invertida', 'a cada 30m 20:00-08:00 | x'],
  ])('recusa %s', (_nome, linha) => {
    const r = parseAgenda(linha);
    expect(r.jobs).toEqual([]);
    expect(r.errors).toHaveLength(1);
  });

  // Achado 9 da revisão de segurança: Properties é compartilhada com a fila `R:`.
  it('corta a agenda no teto e avisa, em vez de estourar as Properties', () => {
    const r = parseAgenda(Array.from({ length: MAX_JOBS + 5 }, (_, i) => `seg 07:${String(i).padStart(2, '0')} | j${i}`).join('\n'));
    expect(r.jobs).toHaveLength(MAX_JOBS);
    expect(r.errors.join(' ')).toContain('teto');
  });

  it('dá id estável para a mesma linha e id diferente para linhas diferentes', () => {
    expect(jobId('seg-sex 07:00 | briefing')).toBe(jobId('seg-sex 07:00 | briefing'));
    expect(jobId('seg-sex 07:00 | briefing')).not.toBe(jobId('seg-sex 08:00 | briefing'));
  });
});

describe('dueJobs', () => {
  const heartbeat = parseAgenda('a cada 30m 08:00-20:00 | HEARTBEAT').jobs;
  const briefing = parseAgenda('seg-sex 07:00 | briefing').jobs;

  it('dispara o "a cada" quando o intervalo passou, dentro da janela', () => {
    const now = local('2026-09-17T10:00');
    const last = { [heartbeat[0].id]: now - 31 * 60_000 };
    expect(dueJobs(heartbeat, last, now, TZ).map((j) => j.intent)).toEqual(['HEARTBEAT']);
  });

  it('não dispara antes de o intervalo passar', () => {
    const now = local('2026-09-17T10:00');
    expect(dueJobs(heartbeat, { [heartbeat[0].id]: now - 29 * 60_000 }, now, TZ)).toEqual([]);
  });

  it('não dispara fora da janela ativa', () => {
    const now = local('2026-09-17T03:00');
    expect(dueJobs(heartbeat, { [heartbeat[0].id]: now - 10 * 60 * 60_000 }, now, TZ)).toEqual([]);
  });

  it('dispara na primeira vez, sem registro anterior', () => {
    expect(dueJobs(heartbeat, {}, local('2026-09-17T10:00'), TZ)).toHaveLength(1);
  });

  it('dispara o diário depois da hora, num dia da semana válido', () => {
    // 2026-09-17 é quinta-feira.
    expect(dueJobs(briefing, {}, local('2026-09-17T07:30'), TZ)).toHaveLength(1);
  });

  it('não dispara o diário antes da hora', () => {
    expect(dueJobs(briefing, {}, local('2026-09-17T06:59'), TZ)).toEqual([]);
  });

  it('não dispara o diário num dia fora da lista', () => {
    // 2026-09-19 é sábado.
    expect(dueJobs(briefing, {}, local('2026-09-19T09:00'), TZ)).toEqual([]);
  });

  it('não repete o diário depois de já ter disparado hoje', () => {
    const now = local('2026-09-17T09:00');
    expect(dueJobs(briefing, { [briefing[0].id]: local('2026-09-17T07:01') }, now, TZ)).toEqual([]);
  });

  // Decisão do gate: compromisso perdido dispara UMA vez ao voltar, não uma por ocorrência.
  it('dispara uma única vez depois de dias fora do ar', () => {
    const now = local('2026-09-17T09:00');
    const last = { [briefing[0].id]: local('2026-09-14T07:00') };
    expect(dueJobs(briefing, last, now, TZ)).toHaveLength(1);
    // e, tendo disparado agora, não dispara de novo no mesmo dia
    expect(dueJobs(briefing, { [briefing[0].id]: now }, local('2026-09-17T09:01'), TZ)).toEqual([]);
  });

  it('é pura: não olha o relógio nem o fuso do ambiente', () => {
    const now = local('2026-09-17T10:00');
    const a = dueJobs(heartbeat, {}, now, TZ);
    const b = dueJobs(heartbeat, {}, now, TZ);
    expect(a).toEqual(b);
  });

  it('agenda vazia devolve vazio sem trabalho', () => {
    expect(dueJobs([], {}, Date.now(), TZ)).toEqual([]);
  });
});

describe('offsetMinutes', () => {
  it('converte o offset de zone() em minutos', () => {
    expect(offsetMinutes('-03:00')).toBe(-180);
    expect(offsetMinutes('+05:30')).toBe(330);
    expect(offsetMinutes('+00:00')).toBe(0);
  });

  // Fuso ilegível não pode derrubar o gatilho: no pior caso a agenda dispara no horário errado.
  it.each(['', 'Z', '-3:00', 'America/Sao_Paulo', '-03:00:00'])('cai em UTC diante de %o, sem lançar', (bad) => {
    expect(offsetMinutes(bad as string)).toBe(0);
  });
});

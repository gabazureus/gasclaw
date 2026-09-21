// A agenda da proatividade (item 28): quando o agente acorda, e por que isso não mora na pasta.
//
// O buraco que a F3a fecha não é de conveniência. Um `jobs.md` na pasta COMPARTILHÁVEL entregaria ao
// editor do Drive o PROMPT de um run não supervisionado e o DESTINO da entrega — quem edita a pasta
// passaria a escrever o que o agente faz às 3 da manhã e para onde o resultado vai.
import { describe, expect, test } from 'vitest';
import { dueJobs, JOB_MAX, jobText, parseSchedule, serializeSchedule } from '../src/schedule';

describe('parseSchedule: entrada ruim é recusada COM MOTIVO, nunca corrigida em silêncio', () => {
  test('vazio é vazio, sem erro', () => {
    expect(parseSchedule(null)).toEqual({ jobs: [], errors: [] });
  });

  test('aceita HH:MM e minutos', () => {
    const r = parseSchedule(JSON.stringify([{ at: '08:30', prompt: 'resumo do dia' }, { at: 540, prompt: 'agenda' }]));
    expect(r.jobs.map((j) => j.at)).toEqual([510, 540]);
    expect(r.errors).toEqual([]);
  });

  // Corrigir em silêncio faria o agente acordar numa hora que o dono não pediu — e ele descobriria
  // pelo resultado, não pelo aviso.
  test.each(['25:00', '8:70', 'amanhã', ''])('horário inválido %s vira erro, não hora arredondada', (at) => {
    const r = parseSchedule(JSON.stringify([{ at, prompt: 'x' }]));
    expect(r.jobs).toEqual([]);
    expect(r.errors[0]).toMatch(/invalid time/);
  });

  test('job sem prompt é recusado: acordar sem saber para quê é só custo', () => {
    expect(parseSchedule(JSON.stringify([{ at: '08:00', prompt: '   ' }])).errors[0]).toMatch(/say what/);
  });

  test('ilegível não vira agenda vazia silenciosa: o erro aparece', () => {
    const r = parseSchedule('{isto não é json');
    expect(r.jobs).toEqual([]);
    expect(r.errors[0]).toMatch(/could not be read/);
  });

  test('acima do teto, avisa em vez de cortar calado', () => {
    const r = parseSchedule(JSON.stringify(Array.from({ length: JOB_MAX + 3 }, () => ({ at: '08:00', prompt: 'x' }))));
    expect(r.jobs).toHaveLength(JOB_MAX);
    expect(r.errors.join(' ')).toMatch(new RegExp(`first ${JOB_MAX}`));
  });

  test('dias inválidos somem do job, e os válidos ficam sem repetição', () => {
    expect(parseSchedule(JSON.stringify([{ at: '08:00', prompt: 'x', days: [1, 1, 9, -2, 6] }])).jobs[0].days).toEqual([1, 6]);
  });

  test('o que sai do serialize volta igual no parse', () => {
    const jobs = parseSchedule(JSON.stringify([{ at: '07:15', prompt: 'bom dia', days: [1, 2] }])).jobs;
    expect(parseSchedule(serializeSchedule(jobs)).jobs).toEqual(jobs);
  });
});

describe('dueJobs: janela, não igualdade', () => {
  const j = (at: number, days: number[] = []) => ({ at, prompt: 'x', days });

  // Comparar `at === agora` perderia o job no minuto em que o tique não rodou — e a P22 mediu tiques
  // de até 1.090 ms num desenho que já regrediu antes. Perder um despertar calado é o modo de falha
  // que a proatividade não pode ter.
  test('um tique atrasado ainda pega o job que venceu no caminho', () => {
    expect(dueJobs([j(510)], 505, 515, 1)).toHaveLength(1);
  });

  test('o mesmo job não dispara duas vezes: a janela anda com o lastSeen', () => {
    expect(dueJobs([j(510)], 510, 515, 1)).toEqual([]);
  });

  // Acordar para tudo que passou enquanto estava desligado seria avalanche, não proatividade.
  test('sem lastSeen (primeira volta, ou estado perdido) NÃO dispara nada', () => {
    expect(dueJobs([j(510)], null, 900, 1)).toEqual([]);
  });

  test('virada do dia recomeça limpo em vez de disparar o dia inteiro', () => {
    expect(dueJobs([j(510)], 1400, 10, 1)).toEqual([]);
  });

  test('dias declarados são respeitados', () => {
    expect(dueJobs([j(510, [1])], 505, 515, 1)).toHaveLength(1);
    expect(dueJobs([j(510, [1])], 505, 515, 3)).toEqual([]);
  });

  test('sem dias declarados, todo dia', () => {
    expect(dueJobs([j(510)], 505, 515, 0)).toHaveLength(1);
  });
});

describe('jobText: o dono lê o que marcou', () => {
  test('hora com zero à esquerda e os dias por nome', () => {
    expect(jobText({ at: 510, prompt: 'x', days: [1, 5] })).toBe('08:30 · Mon, Fri');
    expect(jobText({ at: 65, prompt: 'x', days: [] })).toBe('01:05 · every day');
  });
});

// A fiação, pelo critério que derrubou seis itens na auditoria: o símbolo aparece no bundle, chamado?
describe('a proatividade está LIGADA, e sem gatilho novo', () => {
  test('o despertar roda dentro do worker de 1 min que já existe', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toContain("isolado('wake', () => tickProactive())");
    // NENHUM gatilho novo: a P22 mediu 13,87% da cota para o worker que já existe, e um segundo
    // gatilho cobraria de novo os 1.440 tiques do dia.
    expect(main).not.toMatch(/newTrigger\([^)]*[Ww]ake/);
  });

  test('a agenda mora em Script Properties, não na pasta', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('SCHED:');
    // O buraco real: `jobs.md` na pasta compartilhável entregaria o prompt E o destino de um run
    // não supervisionado a quem tivesse acesso de edição ao Drive.
    const ws = (await import('node:fs')).readFileSync('src/workspace.ts', 'utf8');
    expect(ws).not.toContain('jobs.md');
  });

  test('o run proativo esbarrando num card falha em vez de ficar pendurado', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('onProactiveBlock(');
    expect(main).toContain('mayAutoApprove(');
  });

  test('silêncio deixa rastro: acordou e não tinha nada é diferente de não acordou', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('noReplySpan(');
  });
});

// O defeito que a revisão desta rodada pegou, e ele é de PRIVILÉGIO.
//
// `tickProactive` conferia o ciclo de vida (arquivado não roda) e esquecia a CAPACIDADE. Um agente sem
// `initiative`, com uma agenda gravada, acordaria e agiria sem ninguém olhando — a capacidade existe
// justamente para ser esse portão, e ela estava sendo desenhada na tela e ignorada no motor.
//
// Pior: a agenda sobrevive a desligar a capacidade. Quem desligasse `initiative` acreditando ter

describe('a agenda da PASTA não volta para o motor', () => {
  test('o motor não importa o parser do jobs.md', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    // `offsetMinutes` é utilitário de fuso e pode ficar; o que não pode é o PARSER.
    expect(main).not.toContain('parseAgenda');
    expect(main).toMatch(/import \{ offsetMinutes \} from '\.\/agenda'/);
  });

  test('o motor não lê nenhum arquivo de agenda da pasta', async () => {
    const fs = await import('node:fs');
    for (const f of ['src/main.ts', 'src/workspace.ts', 'src/tools/personaStore.ts']) {
      expect(fs.readFileSync(f, 'utf8'), `${f} não pode ler agenda da pasta`).not.toContain('jobs.md');
    }
  });

  test('o parser continua existindo para a POC medir — não é remoção, é isolamento', async () => {
    const probe = (await import('node:fs')).readFileSync('poc/p22-proatividade/probe.ts', 'utf8');
    expect(probe).toContain("from '../../src/agenda'");
  });
});

// O PRIMEIRO DEFEITO ACHADO PELA SUCESSÃO — P32, rodada 2 (dev v147), 2026-09-21.
//
// O motor mandou o próprio código ao Opus, e o patch que voltou apontou isto: à meia-noite `now`
// recomeça em 0 enquanto `lastSeen` ainda é 1439, e `dueJobs` devolvia VAZIO. Como `tickProactive`
// grava `lastSeen = minutos` ANTES e SEMPRE (main.ts, em volta de `dueJobs(`), o tique seguinte já
// tinha `lastSeen = 0` — e `j.at > 0` exclui para sempre um job às 00:00.
//
// UM AGENTE PROATIVO AGENDADO PARA MEIA-NOITE NUNCA ACORDAVA. Nenhum teste cobria a virada do dia.
// A correção foi conferida à mão contra o chamador antes de ser portada — a explicação do Opus não
// foi aceita como prova.
describe('dueJobs na virada do dia', () => {
  const job = (at: number) => ({ at, prompt: 'x', days: [] as number[] });

  test('um job às 00:00 dispara no tique da meia-noite', () => {
    expect(dueJobs([job(0)], 1439, 0, 1)).toHaveLength(1);
  });

  // O cuidado que o código original tinha, e que a correção preserva: virar o dia NÃO dispara o dia
  // inteiro — só o que já venceu desde a meia-noite.
  test('virar o dia não dispara o que ainda não chegou', () => {
    expect(dueJobs([job(0), job(720)], 1439, 0, 1).map((j) => j.at)).toEqual([0]);
  });

  // Tique atrasado (a cota de gatilho do Apps Script não garante o minuto exato): tudo que venceu entre
  // a meia-noite e agora dispara, uma vez.
  test('tique atrasado na virada dispara o que venceu desde a meia-noite', () => {
    expect(dueJobs([job(0), job(1), job(2), job(3)], 1439, 2, 1).map((j) => j.at)).toEqual([0, 1, 2]);
  });

  // E uma vez só: o tique seguinte, com `lastSeen` já no novo dia, não dispara de novo.
  test('o job das 00:00 não dispara duas vezes', () => {
    expect(dueJobs([job(0)], 0, 1, 1)).toHaveLength(0);
  });

  // A SEQUÊNCIA REAL, como o chamador a vive: grava o minuto e então pergunta. Era aqui que o defeito
  // morava — nenhum teste simulava mais de um tique.
  test('a sequência de tiques 23:59 → 00:00 → 00:01 dispara o job das 00:00 exatamente uma vez', () => {
    let visto: number | null = null;
    let disparos = 0;
    for (const minuto of [1438, 1439, 0, 1, 2]) {
      const anterior = visto;
      visto = minuto; // `tickProactive` grava ANTES de perguntar
      disparos += dueJobs([job(0)], anterior, minuto, 1).length;
    }
    expect(disparos).toBe(1);
  });
});

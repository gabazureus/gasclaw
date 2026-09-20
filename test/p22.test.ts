import { describe, expect, it } from 'vitest';
import { P22_BASELINE_PCT, P22_QUOTA_MS_PER_DAY, agentsThatFit, p22Verdict, projectedFixedMs, type P22Result, median } from '../poc/p22-proatividade/verdict';

const full = {
  idle: { ms: 700 },
  agenda: { ms: 750, jobs: 20, due: 0 },
  wake: { ms: 4_000, completed: true, wakesPerDay: 48, realTurnMs: 11_600 },
  triggers: { count: 1 },
};
const ids = (r: { checks: { id: string }[] }) => r.checks.map((c) => c.id);
const check = (r: P22Result, id: string) => r.checks.find((c) => c.id === id)!;

describe('p22Verdict', () => {
  it('aprova quando os quatro critérios passam', () => {
    const r = p22Verdict(full);
    expect(ids(r)).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(r.pass).toBe(true);
  });

  // A P3 foi invalidada duas vezes por amostra parcial; um veredito incompleto não pode passar.
  it('nunca aprova com menos de quatro critérios', () => {
    expect(p22Verdict({ idle: { ms: 10 } }).pass).toBe(false);
    expect(p22Verdict({}).pass).toBe(false);
  });

  it('reprova C1 quando o tique ocioso estoura o teto', () => {
    expect(check(p22Verdict({ ...full, idle: { ms: 1_000 } }), 'C1').pass).toBe(false);
  });

  it('reprova C2 se um compromisso venceu durante a medição', () => {
    const c = check(p22Verdict({ ...full, agenda: { ms: 100, jobs: 20, due: 1 } }), 'C2');
    expect(c.pass).toBe(false);
    expect(c.detail).toContain('contaminada');
  });

  it('reprova C2 se a agenda sintética não chegou a ser carregada', () => {
    const c = check(p22Verdict({ ...full, agenda: { ms: 5, jobs: 0, due: 0 } }), 'C2');
    expect(c.pass).toBe(false);
    expect(c.detail).toContain('não foi carregada');
  });

  it('reprova C3 quando o custo somado passa dos 20% da cota', () => {
    const r = p22Verdict({ ...full, wake: { ms: 4_000, completed: true, wakesPerDay: 48, realTurnMs: 60_000 } });
    expect(check(r, 'C3').pass).toBe(false);
    expect(check(r, 'C3').detail).toContain('8.47%'); // a baseline da P3 entra na conta, não é esquecida
  });

  it('reprova C3 quando o despertar sintético não completou', () => {
    const c = check(p22Verdict({ ...full, wake: { ms: 10, completed: false, wakesPerDay: 48, realTurnMs: 11_600 } }), 'C3');
    expect(c.pass).toBe(false);
    expect(c.detail).toContain('não completou');
  });

  // O passo sintético não chama o modelo: projetar com ele responderia a pergunta errada.
  it('recusa C3 quando só existe o piso sintético, sem turno real', () => {
    const c = check(p22Verdict({ ...full, wake: { ms: 4_000, completed: true, wakesPerDay: 48 } }), 'C3');
    expect(c.pass).toBe(false);
    expect(c.detail).toContain('piso');
  });

  it('projeta com o turno real, não com o sintético', () => {
    const c = check(p22Verdict(full), 'C3');
    expect(c.detail).toContain('turno real de 11600 ms');
  });

  it('reprova C4 se a POC criou um gatilho novo', () => {
    expect(check(p22Verdict({ ...full, triggers: { count: 2 } }), 'C4').pass).toBe(false);
  });
});

describe('projeção', () => {
  it('cobra a avaliação da agenda em todo tique e o run em cada despertar', () => {
    expect(projectedFixedMs(750, 10_000, 48)).toBe(750 * 1440 + 10_000 * 48);
  });

  it('o número de agentes que cabem desconta a baseline da P3 e o custo compartilhado do tique', () => {
    const agendaMs = 750;
    const wakeMs = 11_600;
    const wakes = 48;
    const fit = agentsThatFit(agendaMs, wakeMs, wakes);
    // o custo de `fit` agentes tem de caber, e o de `fit + 1` não
    const total = (n: number) => P22_BASELINE_PCT + (projectedFixedMs(agendaMs, wakeMs, wakes * n) / P22_QUOTA_MS_PER_DAY) * 100;
    expect(total(fit)).toBeLessThanOrEqual(20);
    expect(total(fit + 1)).toBeGreaterThan(20);
  });

  it('devolve zero agentes quando nem um cabe', () => {
    expect(agentsThatFit(750, 600_000, 48)).toBe(0);
  });
});

// O defeito do INSTRUMENTO, achado medindo: o veredito julgava pela ÚLTIMA amostra.
//
// Aconteceu de verdade: as três amostras do tique com agenda foram 433, 544 e 1000 ms, e o 1000 — sozinho,
// exatamente no teto — reprovou o C2. A medição anterior já tinha esbarrado nisso (1.448 ms numa faixa real
// de 517–1.160) e o conserto foi aplicado À MÃO: quem media colhia seis e tirava a mediana de cabeça. O
// cuidado dependia de alguém lembrar dele. Agora está dentro da ferramenta.
describe('mediana: uma amostra ruidosa não decide sozinha', () => {
  it('mediana de ímpar e de par', () => {
    expect(median([433, 544, 1000])).toBe(544);
    expect(median([2, 4, 6, 8])).toBe(5);
    expect(median([7])).toBe(7);
  });

  it('a ordem de chegada não muda o resultado', () => {
    expect(median([1000, 433, 544])).toBe(median([433, 1000, 544]));
  });

  it('sem amostra devolve NaN em vez de zero — zero passaria em qualquer teto', () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });

  // O caso real: com a última amostra o C2 reprovava; com a mediana das três, passa.
  it('as três amostras reais: a última reprovava, a mediana aprova', () => {
    const r = p22Verdict({ agenda: { ms: median([433, 544, 1000]), samples: [433, 544, 1000], jobs: 20, due: 0 } });
    const c2 = r.checks.find((c) => c.id === 'C2');
    expect(c2?.pass).toBe(true);
    expect(c2?.detail).toContain('544 ms');
  });

  // Um número sozinho parece mais firme do que é: quem lê precisa ver quantas amostras o sustentam.
  it('o detalhe declara o número de amostras e a faixa', () => {
    const r = p22Verdict({ idle: { ms: 730, samples: [518, 730, 966] } });
    expect(r.checks[0].detail).toContain('mediana de 3 amostras');
    expect(r.checks[0].detail).toContain('518–966 ms');
  });

  it('com uma amostra só, ele diz isso em vez de fingir robustez', () => {
    const r = p22Verdict({ idle: { ms: 730, samples: [730] } });
    expect(r.checks[0].detail).toContain('1 amostra só');
  });
});

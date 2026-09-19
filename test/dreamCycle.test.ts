// O ciclo de sonho como plano de passos (núcleo puro). Testes antes da fiação.
//
// Três decisões medidas moldam este arquivo:
//  - k=17 por cenário, porque a P23 mediu que a variância é da AMOSTRAGEM DO AGENTE (juiz com
//    resposta congelada deu desvio 0,00; agente com modelo fixo oscilou 0,4,4,0);
//  - o portão vem ANTES da qualidade, e isso não é estética: é custo. Um candidato que morre no
//    portão custa 2 execuções em vez de 102;
//  - o `holdout` nunca entra na seleção, senão a evidência é circular.
import { describe, expect, test } from 'vitest';
import {
  QUALITY_PASS_GRADE,
  stepPassed,
  cluster,
  hasMaterial,
  cycleCost,
  dreamVerdict,
  DREAM_STEPS_PER_TICK,
  eliminated,
  nextStep,
  planCycle,
  recordResult,
  stepKey,
  type DreamPlan,
} from '../src/dreamCycle';

const plano = (): DreamPlan =>
  planCycle({
    cycleId: 'c1',
    candidates: ['cand-a', 'cand-b', 'cand-c'],
    gate: ['g-injecao', 'g-fora-da-lista'],
    quality: ['q-conciso', 'q-incerteza', 'q-pergunta-antes', 'q-recusa-util', 'q-uma-coisa-so', 'q-extra'],
    k: 17,
  });

describe('o portão vem antes, e isso é economia, não estética', () => {
  test('os primeiros passos são todos de portão, com UMA execução cada', () => {
    const p = plano();
    const primeiros = p.steps.slice(0, 6);
    expect(primeiros.every((s) => s.kind === 'gate')).toBe(true);
    expect(primeiros.every((s) => s.rep === 0)).toBe(true); // portão é determinístico: k=1
  });

  test('só depois do portão inteiro começa a qualidade', () => {
    const p = plano();
    const primeiroQuality = p.steps.findIndex((s) => s.kind === 'quality');
    expect(primeiroQuality).toBe(3 * 2); // 3 candidatos × 2 cenários de portão
  });

  test('a qualidade roda k vezes por cenário; o portão, uma', () => {
    const p = plano();
    const qualidade = p.steps.filter((s) => s.kind === 'quality');
    expect(qualidade).toHaveLength(3 * 6 * 17);
    expect(p.steps.filter((s) => s.kind === 'gate')).toHaveLength(3 * 2);
  });

  test('o `holdout` NÃO entra no plano: ele não participa da seleção', () => {
    const p = planCycle({ cycleId: 'c', candidates: ['a'], gate: [], quality: ['q1'], k: 2 });
    expect(p.steps.some((s) => s.scenario.startsWith('h-'))).toBe(false);
  });
});

describe('custo do ciclo, declarado antes de rodar', () => {
  test('3 candidatos × 6 cenários × k=17, mais o portão', () => {
    const c = cycleCost(plano());
    expect(c.steps).toBe(3 * 2 + 3 * 6 * 17); // 312
    expect(c.ticks).toBe(Math.ceil(312 / DREAM_STEPS_PER_TICK));
  });

  test('o ciclo NÃO monopoliza o pump: usa uma fatia das 20 voltas por tique', () => {
    expect(DREAM_STEPS_PER_TICK).toBeLessThan(20); // PUMP_MAX_STEPS
    expect(DREAM_STEPS_PER_TICK).toBeGreaterThan(0);
  });

  test('um candidato eliminado no portão economiza k × cenários de qualidade', () => {
    const cheio = cycleCost(plano());
    const magro = cycleCost(planCycle({ cycleId: 'c1', candidates: ['a', 'b'], gate: ['g1', 'g2'], quality: Array.from({ length: 6 }, (_, i) => `q${i}`), k: 17 }));
    expect(cheio.steps - magro.steps).toBe(2 + 6 * 17); // o portão dele mais a qualidade que não rodou
  });
});

describe('eliminação pelo portão: falhou um, morre, sem estatística', () => {
  test('uma falha de portão elimina o candidato', () => {
    const p = plano();
    let t = {};
    t = recordResult(t, { kind: 'gate', candidate: 'cand-b', scenario: 'g-injecao', rep: 0 }, false);
    expect(eliminated(t)).toEqual(['cand-b']);
  });

  test('passar no portão não elimina ninguém', () => {
    let t = {};
    t = recordResult(t, { kind: 'gate', candidate: 'cand-a', scenario: 'g-injecao', rep: 0 }, true);
    expect(eliminated(t)).toEqual([]);
  });

  test('falhar na QUALIDADE não elimina: lá o veredito é estatístico', () => {
    let t = {};
    for (let r = 0; r < 17; r++) t = recordResult(t, { kind: 'quality', candidate: 'cand-a', scenario: 'q-conciso', rep: r }, false);
    expect(eliminated(t)).toEqual([]);
  });

  test('o próximo passo PULA os passos de quem já morreu', () => {
    const p = plano();
    let t = {};
    t = recordResult(t, { kind: 'gate', candidate: 'cand-a', scenario: 'g-injecao', rep: 0 }, false);
    const feitos = new Set([stepKey(p.steps[0])]);
    const proximo = nextStep(p, feitos, t);
    expect(proximo?.candidate).not.toBe('cand-a');
  });
});

describe('avanço passo a passo: o ciclo atravessa execuções', () => {
  test('sem nada feito, o primeiro passo é o primeiro do plano', () => {
    const p = plano();
    expect(stepKey(nextStep(p, new Set(), {})!)).toBe(stepKey(p.steps[0]));
  });

  test('passo já feito não repete — é o que torna o checkpoint seguro', () => {
    const p = plano();
    const feitos = new Set(p.steps.slice(0, 5).map(stepKey));
    expect(stepKey(nextStep(p, feitos, {})!)).toBe(stepKey(p.steps[5]));
  });

  test('tudo feito devolve null, que é como o ciclo termina', () => {
    const p = planCycle({ cycleId: 'c', candidates: ['a'], gate: [], quality: ['q1'], k: 1 });
    expect(nextStep(p, new Set(p.steps.map(stepKey)), {})).toBe(null);
  });

  test('a chave do passo é única por candidato, cenário e repetição', () => {
    const p = plano();
    expect(new Set(p.steps.map(stepKey)).size).toBe(p.steps.length);
  });
});

describe('veredito: vantagem estatística e o alcance declarado', () => {
  const tallyDe = (cand: string, acertos: number, cenarios: string[], k = 17) => {
    let t: Record<string, { passes: number; runs: number }> = {};
    for (const c of cenarios) for (let r = 0; r < k; r++) t = recordResult(t, { kind: 'quality', candidate: cand, scenario: c, rep: r }, r < acertos);
    return t;
  };

  test('candidato claramente melhor vence, e o veredito DIZ o que ele enxerga', () => {
    const cen = ['q1'];
    const t = { ...tallyDe('cand', 16, cen), ...tallyDe('titular', 5, cen) };
    const v = dreamVerdict('cand', 'titular', t, cen, 17);
    expect(v.wins).toBe(true);
    expect(v.sees).toContain('50% to 90%');
  });

  test('diferença que parece folgada mas não sobrevive ao teste NÃO promove', () => {
    const cen = ['q1'];
    const t = { ...tallyDe('cand', 12, cen), ...tallyDe('titular', 9, cen) };
    expect(dreamVerdict('cand', 'titular', t, cen, 17).wins).toBe(false);
  });

  test('empate não promove', () => {
    const cen = ['q1'];
    const t = { ...tallyDe('cand', 10, cen), ...tallyDe('titular', 10, cen) };
    expect(dreamVerdict('cand', 'titular', t, cen, 17).wins).toBe(false);
  });

  test('candidato eliminado no portão nunca vence, por melhor que seja a taxa', () => {
    const cen = ['q1'];
    let t = { ...tallyDe('cand', 17, cen), ...tallyDe('titular', 1, cen) };
    t = recordResult(t, { kind: 'gate', candidate: 'cand', scenario: 'g-injecao', rep: 0 }, false);
    const v = dreamVerdict('cand', 'titular', t, cen, 17);
    expect(v.wins).toBe(false);
    expect(v.reason).toContain('gate');
  });

  test('sem execução suficiente, não afirma', () => {
    const v = dreamVerdict('cand', 'titular', {}, ['q1'], 17);
    expect(v.wins).toBe(false);
    expect(v.reason).toContain('not enough');
  });
});

describe('material do sonho: falhas reais, agrupadas por contagem (D5)', () => {
  const AGORA = 1_000_000_000;
  const DIA = 86_400_000;
  const f = (kind: 'refused_tool' | 'no_answer' | 'step_limit' | 'denied' | 'tool_error', tool: string, diasAtras: number) => ({ at: AGORA - diasAtras * DIA, kind, tool });

  test('agrupa por tipo e ferramenta, e ordena por contagem', () => {
    const c = cluster([f('refused_tool', 'calendar.create', 1), f('refused_tool', 'calendar.create', 2), f('no_answer', '', 1)], 30 * DIA, AGORA);
    expect(c[0]).toEqual({ kind: 'refused_tool', tool: 'calendar.create', count: 2 });
    expect(c[1].count).toBe(1);
  });

  test('a ordem é ESTÁVEL: o mesmo dado dá sempre o mesmo resultado', () => {
    const dados = [f('tool_error', 'b', 1), f('denied', 'a', 1), f('refused_tool', 'c', 1)];
    const a = JSON.stringify(cluster(dados, 30 * DIA, AGORA));
    const b = JSON.stringify(cluster([...dados].reverse(), 30 * DIA, AGORA));
    expect(a).toBe(b); // contagem determinística com ordem não determinística seria o mesmo defeito com outro nome
  });

  test('falha fora da janela não conta, e carimbo do futuro também não', () => {
    expect(cluster([f('denied', 'x', 40)], 30 * DIA, AGORA)).toEqual([]);
    expect(cluster([{ at: AGORA + DIA, kind: 'denied', tool: 'x' }], 30 * DIA, AGORA)).toEqual([]);
    expect(cluster([{ at: Number.NaN, kind: 'denied', tool: 'x' }], 30 * DIA, AGORA)).toEqual([]);
  });

  test('sem falha real o ciclo NÃO roda, e diz por quê', () => {
    const v = hasMaterial([]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('nothing to dream about');
  });

  test('aglomerado abaixo do limiar não justifica um ciclo, e o motivo traz o número', () => {
    const v = hasMaterial([{ kind: 'denied', tool: 'x', count: 2 }]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('2 occurrences');
  });

  test('no limiar, há material', () => {
    expect(hasMaterial([{ kind: 'denied', tool: 'x', count: 3 }]).ok).toBe(true);
  });
});

describe('conversão da nota para o bit da estatística', () => {
  test('o limiar é 3 e está declarado, não escondido', () => {
    expect(QUALITY_PASS_GRADE).toBe(3);
  });

  test('portão usa as verificações do cenário; nota não entra nele', () => {
    expect(stepPassed('gate', { pass: true })).toBe(true);
    expect(stepPassed('gate', { pass: false, grade: { grade: 4 } })).toBe(false); // nota boa não salva portão reprovado
  });

  test('qualidade: 3 e 4 acertam, 0 a 2 não', () => {
    for (const g of [3, 4]) expect(stepPassed('quality', { pass: true, grade: { grade: g } })).toBe(true);
    for (const g of [0, 1, 2]) expect(stepPassed('quality', { pass: true, grade: { grade: g } })).toBe(false);
  });

  test('sem nota legível NÃO conta como acerto — isso inflaria a taxa com falha do juiz', () => {
    expect(stepPassed('quality', { pass: true })).toBe(false);
    expect(stepPassed('quality', { pass: true, grade: null })).toBe(false);
  });
});

// Sub-agente como DECLARAÇÃO (ADR-039). Núcleo puro.
//
// O primeiro teste deste arquivo é o que importa: `allowedTools` (registry.ts:115-116) filtra
// contra `TOOLS`, o REGISTRO — o parâmetro tem `tools = TOOLS` por padrão e ele NÃO conhece o
// acesso do pai. A implementação óbvia ("filtra a lista declarada") seria união disfarçada de
// filtro: um sub-agente declarando `gmail.send` ganharia `gmail.send` mesmo com o pai sem ela.
import { describe, expect, test } from 'vitest';
import { canDelegate, parseSubagent, SUBAGENT_STEPS, subagentSpan, subagentTools, stepsFor } from '../src/subagent';

describe('interseção: um sub-agente nunca tem MAIS que o pai, só menos', () => {
  test('ferramenta que o pai NÃO tem não é concedida, mesmo declarada na pasta', () => {
    expect(subagentTools(['gmail.send', 'now'], ['now', 'memory.save'])).toEqual(['now']);
  });

  test('pai sem nada ⇒ sub-agente sem nada (a pasta não concede, nunca)', () => {
    expect(subagentTools(['now', 'gmail.send'], [])).toEqual([]);
  });

  test('é interseção, não união: o resultado é sempre subconjunto do pai', () => {
    const parent = ['now', 'memory.save'];
    for (const declared of [['gmail.send'], ['now', 'gmail.send'], [], ['memory.save', 'calendar.create']]) {
      const got = subagentTools(declared, parent);
      expect(got.every((t) => parent.includes(t))).toBe(true);
    }
  });

  test('nome fora do registro é recusado mesmo que o pai "tenha" (defesa em profundidade)', () => {
    expect(subagentTools(['fax.send'], ['fax.send', 'now'])).toEqual([]);
  });

  test('declarar tudo do pai é o teto, não um bônus', () => {
    expect(subagentTools(['now', 'memory.save'], ['now', 'memory.save'])).toEqual(['now', 'memory.save']);
  });

  test('duplicata não multiplica', () => {
    expect(subagentTools(['now', 'now'], ['now'])).toEqual(['now']);
  });
});

describe('profundidade: sub-agente NÃO cria sub-agente (ADR-039)', () => {
  test('o pai delega; o sub-agente não', () => {
    expect(canDelegate(0)).toBe(true); // o agente da pasta
    expect(canDelegate(1)).toBe(false); // já é sub-agente
    expect(canDelegate(2)).toBe(false);
  });

  test('profundidade inválida é fail-closed', () => {
    expect(canDelegate(-1)).toBe(false);
    expect(canDelegate(Number.NaN)).toBe(false);
  });
});

describe('teto de passos: 5 sub-agentes não podem comer os 10 passos do pai', () => {
  test('o sub-agente tem teto PRÓPRIO, menor que o do pai', () => {
    expect(SUBAGENT_STEPS).toBeLessThan(10); // DEFAULT_STEPS do agent.ts
    expect(stepsFor(undefined)).toBe(SUBAGENT_STEPS);
  });

  test('declarar mais que o teto não aumenta o teto', () => {
    expect(stepsFor(99)).toBe(SUBAGENT_STEPS);
    expect(stepsFor(2)).toBe(2);
  });

  test('valor absurdo cai no padrão em vez de virar zero passos ou exceção', () => {
    expect(stepsFor(0)).toBe(SUBAGENT_STEPS);
    expect(stepsFor(-5)).toBe(SUBAGENT_STEPS);
    expect(stepsFor(1.5)).toBe(SUBAGENT_STEPS);
  });
});

describe('trace: sem span nomeado, "a squad trabalhou" é inauditável', () => {
  test('o span nomeia QUAL sub-agente agiu', () => {
    expect(subagentSpan('pesquisador')).toBe('subagent:pesquisador');
  });

  test('nome inválido não vira span (não deixa a pasta inventar nome de span)', () => {
    expect(subagentSpan('../outro')).toBe(null);
    expect(subagentSpan('COM MAIÚSCULA')).toBe(null);
    expect(subagentSpan('')).toBe(null);
  });
});

describe('declaração: markdown, nunca código (ADR-002)', () => {
  const md = '---\ntools: [now, gmail.send]\nsteps: 3\n---\nVocê pesquisa e resume.';

  test('lê nome, papel, tools declaradas e teto', () => {
    const s = parseSubagent('pesquisador', md);
    expect(s?.name).toBe('pesquisador');
    expect(s?.role).toContain('Você pesquisa');
    expect(s?.declaredTools).toEqual(['now', 'gmail.send']);
    expect(s?.steps).toBe(3);
  });

  test('sem frontmatter: sub-agente sem ferramenta nenhuma, não sub-agente com todas', () => {
    expect(parseSubagent('simples', 'Só um papel.')?.declaredTools).toEqual([]);
  });

  test('nome inválido não vira sub-agente', () => {
    expect(parseSubagent('../fuga', md)).toBe(null);
  });

  test('papel vazio não vira sub-agente: um sub-agente sem papel não é nada', () => {
    expect(parseSubagent('vazio', '---\ntools: [now]\n---\n   ')).toBe(null);
  });
});

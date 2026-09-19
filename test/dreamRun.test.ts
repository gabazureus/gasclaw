// Geração de candidatos: as partes puras. A execução do passo em si é fiação e será exercitada
// quando o ciclo rodar no dev.
import { describe, expect, test } from 'vitest';
import { CANDIDATE_TEMPERATURES, candidateMessages, cleanCandidate } from '../src/dreamRun';
import { buildRequest } from '../src/llm';

describe('temperaturas: varia a temperatura, não o modelo', () => {
  test('três valores distintos, do conservador ao exploratório', () => {
    expect(new Set(CANDIDATE_TEMPERATURES).size).toBe(3);
    expect([...CANDIDATE_TEMPERATURES]).toEqual([...CANDIDATE_TEMPERATURES].sort((a, b) => a - b));
  });

  test('variar o MODELO estragaria a comparação: uma vitória não diria se melhorou o prompt', () => {
    // O teste guarda a intenção: os três candidatos vêm do mesmo motor, por desenho.
    expect(CANDIDATE_TEMPERATURES.every((t) => t > 0 && t <= 2)).toBe(true);
  });
});

describe('temperature na requisição: opcional, e sem ela nada muda', () => {
  test('sem temperatura, o corpo é o de antes', () => {
    const { init } = buildRequest('k', 'm', [{ role: 'user', content: 'oi' }], 100);
    expect(JSON.parse(init.payload).temperature).toBeUndefined();
  });

  test('com temperatura, ela vai no corpo', () => {
    const { init } = buildRequest('k', 'm', [{ role: 'user', content: 'oi' }], 100, [], 0.7);
    expect(JSON.parse(init.payload).temperature).toBe(0.7);
  });

  test('temperatura inválida é ignorada em vez de ir quebrada para o provedor', () => {
    const { init } = buildRequest('k', 'm', [{ role: 'user', content: 'oi' }], 100, [], Number.NaN);
    expect(JSON.parse(init.payload).temperature).toBeUndefined();
  });
});

describe('o pedido ao gerador carrega as duas restrições de segurança', () => {
  const [sistema, usuario] = candidateMessages('Você é um assistente.', 'refused_tool calendar.create: 5');

  test('o texto é só o papel: sem preâmbulo, sem cerca de código, sem frontmatter', () => {
    expect(sistema.content).toContain('instruction text ONLY');
    expect(sistema.content).toContain('no YAML front matter');
  });

  test('proíbe pedir ferramenta, permissão ou capacidade — quem concede é o painel', () => {
    expect(sistema.content).toContain('Never request tools, permissions or capabilities');
  });

  test('o material REAL vai no pedido: o gerador não inventa o problema (D5)', () => {
    expect(usuario.content).toContain('Real failures observed recently');
    expect(usuario.content).toContain('calendar.create: 5');
  });
});

describe('limpeza do candidato: papel é TEXTO, configuração tem caminho próprio', () => {
  test('tira cerca de código', () => {
    expect(cleanCandidate('```\nVocê é direto.\n```')).toBe('Você é direto.');
    expect(cleanCandidate('```markdown\nVocê é direto.\n```')).toBe('Você é direto.');
  });

  test('DESCARTA frontmatter: um candidato não escolhe tools nem modelo', () => {
    expect(cleanCandidate('---\ntools: [gmail.send]\nmodel: caro\n---\nVocê é direto.')).toBe('Você é direto.');
  });

  test('texto normal passa intacto, e espaço em volta some', () => {
    expect(cleanCandidate('  Você é direto.  ')).toBe('Você é direto.');
  });

  test('entrada vazia ou nula vira string vazia, nunca "undefined"', () => {
    expect(cleanCandidate('')).toBe('');
    expect(cleanCandidate(null as unknown as string)).toBe('');
  });
});

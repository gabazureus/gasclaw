// Achado 6: o orçamento do prompt apagava um papel inteiro, em silêncio.
//
// São 4 papéis (AGENTS, SOUL, IDENTITY, USER), 20 KB de teto por arquivo e 60 KB no total. 20×4 = 80 > 60, e a
// divisão era GULOSA e EM ORDEM: três arquivos cheios consumiam os 60 KB e o USER.md entrava com zero byte.
//
// Não é hipótese de laboratório: a pasta do agente é compartilhável por design (ADR-021). Quem tiver edição
// enche o AGENTS.md e apaga o USER.md do prompt sem tocar nele — o agente perde quem é o usuário e ninguém vê.
import { describe, expect, test } from 'vitest';
import { buildSpec } from '../src/workspace';

const encher = (n: number) => 'x'.repeat(n);
const trecho = (system: string, papel: string) => system.split(`## ${papel}.md`)[1]?.split('\n## ')[0] ?? '';

describe('nenhum papel é zerado por causa do tamanho dos outros', () => {
  test('quatro arquivos cheios: todos entram, nenhum com zero byte', () => {
    const s = buildSpec('f1', 'a', { AGENTS: encher(20_000), SOUL: encher(20_000), IDENTITY: encher(20_000), USER: encher(20_000) }).system;
    for (const papel of ['AGENTS', 'SOUL', 'IDENTITY', 'USER']) {
      expect(trecho(s, papel).replace(/\s|\(cortado[^)]*\)/g, '').length).toBeGreaterThan(1_000);
    }
  });

  test('o USER.md sobrevive a um AGENTS.md gigante — o ataque da pasta compartilhada', () => {
    const s = buildSpec('f1', 'a', { AGENTS: encher(60_000), USER: 'Gabriel, fuso de São Paulo.' }).system;
    expect(trecho(s, 'USER')).toContain('Gabriel');
  });

  test('quem pede pouco leva tudo que pediu; a sobra vai para os grandes', () => {
    const s = buildSpec('f1', 'a', { AGENTS: 'curto', SOUL: encher(30_000), IDENTITY: 'também curto', USER: encher(30_000) }).system;
    expect(trecho(s, 'AGENTS')).toContain('curto');
    expect(trecho(s, 'IDENTITY')).toContain('também curto');
    expect(trecho(s, 'SOUL').length).toBeGreaterThan(15_000);
  });

  test('o prompt inteiro continua dentro do orçamento', () => {
    const s = buildSpec('f1', 'a', { AGENTS: encher(50_000), SOUL: encher(50_000), IDENTITY: encher(50_000), USER: encher(50_000) }).system;
    expect(s.length).toBeLessThanOrEqual(61_000); // 60 KB de conteúdo + os cabeçalhos "## X.md"
  });

  test('corte deixa marca: silêncio era o problema', () => {
    const s = buildSpec('f1', 'a', { AGENTS: encher(50_000), SOUL: encher(50_000), IDENTITY: encher(50_000), USER: encher(50_000) }).system;
    expect(s).toContain('(trimmed');
  });

  test('papel ausente continua marcado como (missing), sem gastar orçamento', () => {
    const s = buildSpec('f1', 'a', { AGENTS: 'oi' }).system;
    expect(trecho(s, 'USER').trim()).toBe('(missing)');
  });
});

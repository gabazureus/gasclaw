// Capacidades e ciclo de vida (ADR-038, redesenho de 2026-09-19).
//
// Estes testes são a garantia de "não é padrão dos agentes": um agente sem capacidade aprovada não
// toma iniciativa. Promessa em prosa não vale.
//
// NESTA BRANCH sobrou UMA capacidade — `initiative`. As que provavam `succeed`/`create` (o singleton
// do criador, a substituição 1→1, o intervalo entre gerações e o tipo do ato na linhagem) saíram
// JUNTO com as capacidades que elas protegiam: sem o poder, não há o que garantir. O mecanismo —
// opt-in, fail-closed por inteiro, e o congelamento global — continua provado aqui e no
// `agentSecurity.test.ts`.
import { describe, expect, test } from 'vitest';
import { can, CAPABILITIES, isRunnable, parseCapabilities, parseStatus } from '../src/agentCaps';

describe('capacidades: a etiqueta é a identidade, não o cargo', () => {
  test('a capacidade desta branch é esta, e não existe papel especial', () => {
    expect([...CAPABILITIES]).toEqual(['initiative']);
  });

  test('sem nada aprovado: não toma iniciativa — e a lista meio ruim não aprova nada', () => {
    for (const raw of [null, undefined, '', '[]', 'null', '{"initiative":true}', '["initiative","voar"]', '["dream"]', '{ lixo']) {
      const caps = parseCapabilities(raw);
      expect(caps).toEqual([]);
      for (const c of CAPABILITIES) expect(can(caps, c)).toBe(false);
    }
  });

});

describe('ciclo de vida: arquivado é um terceiro estado, e NÃO roda', () => {
  test('arquivado não atende turno, não vira run, não é elegível a gatilho', () => {
    expect(isRunnable('active')).toBe(true);
    expect(isRunnable('archived')).toBe(false);
  });

  test('estado ausente ou lixo é ATIVO, não arquivado: arquivar é ato explícito', () => {
    expect(parseStatus(null)).toBe('active');
    expect(parseStatus('lixo')).toBe('active');
    expect(parseStatus('archived')).toBe('archived');
  });
});

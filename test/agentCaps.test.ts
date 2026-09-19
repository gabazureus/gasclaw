// Capacidades, ciclo de vida, intervalo e linhagem (ADR-038, redesenho de 2026-09-19).
//
// Estes testes são a garantia de "não é padrão dos agentes": um agente sem capacidade não sonha,
// não toma iniciativa, não gera sucessor e não cria agentes. Promessa em prosa não vale.
import { describe, expect, test } from 'vitest';
import {
  accessAfterArchive,
  can,
  canCreateAgent,
  canSucceed,
  CAPABILITIES,
  capabilityTag,
  clearCreator,
  creatorOf,
  DEFAULT_INTERVAL_MS,
  intervalOf,
  isRunnable,
  mayGenerate,
  newbornCapabilities,
  nextGeneration,
  parseCapabilities,
  parseStatus,
  setCreator,
} from '../src/agentCaps';

describe('capacidades: a etiqueta é a identidade, não o cargo', () => {
  test('as quatro capacidades são estas, e não existe papel especial', () => {
    expect([...CAPABILITIES]).toEqual(['dream', 'initiative', 'succeed', 'create']);
  });

  test('sem nada aprovado: não sonha, não toma iniciativa, não sucede, não cria', () => {
    for (const raw of [null, undefined, '', '[]', 'null', '{"dream":true}', '["dream","voar"]', '{ lixo']) {
      const caps = parseCapabilities(raw);
      expect(caps).toEqual([]);
      for (const c of CAPABILITIES) expect(can(caps, c)).toBe(false);
    }
  });

  test('a etiqueta do painel mostra o que está ligado, em ordem estável', () => {
    expect(capabilityTag(parseCapabilities('["create","dream"]'))).toEqual(['dream', 'create']);
    expect(capabilityTag([])).toEqual([]);
  });

  test('agente gerado nasce sem poder nenhum: gerar e habilitar são atos separados', () => {
    expect(newbornCapabilities()).toEqual([]);
  });
});

describe('succeed × create: substituição não multiplica, criação multiplica', () => {
  const ativos = [{ folderId: 'f1' }, { folderId: 'f2' }];

  test('criar exige o singleton E a capacidade aprovada', () => {
    const creator = setCreator('f1');
    expect(canCreateAgent(creator, 'f1', parseCapabilities('["create"]')).ok).toBe(true);
    expect(canCreateAgent(creator, 'f2', parseCapabilities('["create"]')).ok).toBe(false);
    expect(canCreateAgent(creator, 'f1', parseCapabilities('["succeed"]')).ok).toBe(false);
    expect(canCreateAgent(null, 'f1', parseCapabilities('["create"]')).ok).toBe(false);
  });

  test('apontar outro criador SUBSTITUI: não existe valor com dois criadores', () => {
    let creator = setCreator('f1');
    expect(creatorOf(creator, ativos)).toBe('f1');
    creator = setCreator('f2');
    expect(creatorOf(creator, ativos)).toBe('f2');
    expect(creatorOf(creator, ativos)).not.toBe('f1');
  });

  test('suceder NÃO tem singleton: vários agentes podem ter, inclusive um que foi gerado', () => {
    const caps = parseCapabilities('["succeed"]');
    expect(canSucceed(caps, 'active').ok).toBe(true); // o pai
    expect(canSucceed(caps, 'active').ok).toBe(true); // um filho com a mesma marca
    expect(canSucceed(parseCapabilities('["dream"]'), 'active').ok).toBe(false);
  });

  test('o tipo do ato existe no modelo: sucessão avança a geração, criação começa em 1', () => {
    expect(nextGeneration('succession', 3)).toBe(4);
    expect(nextGeneration('creation', 3)).toBe(1); // nem todo agente gerado é sucessor
  });
});

describe('ciclo de vida: arquivado é um terceiro estado, e NÃO roda', () => {
  test('arquivado não atende turno, não vira run, não é elegível a gatilho', () => {
    expect(isRunnable('active')).toBe(true);
    expect(isRunnable('archived')).toBe(false);
  });

  test('arquivado não gera sucessor: o antecessor não continua evoluindo em paralelo', () => {
    expect(canSucceed(parseCapabilities('["succeed"]'), 'archived').ok).toBe(false);
  });

  test('arquivado não pode ser o criador designado, mesmo se o ponteiro sobreviver', () => {
    expect(creatorOf('f1', [{ folderId: 'f1', status: 'archived' }])).toBe(null);
    expect(creatorOf('f1', [{ folderId: 'f1', status: 'active' }])).toBe('f1');
  });

  test('arquivar limpa as FERRAMENTAS e preserva as PESSOAS: a conversa continua legível', () => {
    const antes = { users: ['ana@x.com'], tools: ['now', 'gmail.send'] };
    expect(accessAfterArchive(antes)).toEqual({ users: ['ana@x.com'], tools: [] });
  });

  test('estado ausente ou lixo é ATIVO, não arquivado: arquivar é ato explícito', () => {
    expect(parseStatus(null)).toBe('active');
    expect(parseStatus('lixo')).toBe('active');
    expect(parseStatus('archived')).toBe('archived');
  });

  test('sair do ambiente limpa o ponteiro de criador', () => {
    expect(clearCreator('f1', 'f1')).toBe(null);
    expect(clearCreator('f1', 'f2')).toBe('f1');
  });
});

describe('intervalo mínimo: trava de custo E de descontrole', () => {
  const H = 3_600_000;

  test('o padrão é 24 h', () => {
    expect(DEFAULT_INTERVAL_MS).toBe(24 * H);
    expect(intervalOf(undefined)).toBe(24 * H);
  });

  test('não dá para descer abaixo do piso de 1 h — nem com 0, nem com negativo', () => {
    expect(intervalOf(0)).toBe(DEFAULT_INTERVAL_MS);
    expect(intervalOf(-1)).toBe(DEFAULT_INTERVAL_MS);
    expect(intervalOf(60_000)).toBe(DEFAULT_INTERVAL_MS); // 1 min: recusado
    expect(intervalOf(6 * H)).toBe(6 * H); // acima do piso: vale
  });

  test('nunca gerou: pode', () => {
    expect(mayGenerate(null, 24 * H, 1_000).ok).toBe(true);
  });

  test('cedo demais recusa — e a recusa DIZ QUANTO FALTA (vai para o trace)', () => {
    const out = mayGenerate(0, 24 * H, 1 * H);
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('min left');
    expect(out.reason).toMatch(/\d/); // um número, não um "não" seco
  });

  test('passado o intervalo, libera', () => {
    expect(mayGenerate(0, 24 * H, 24 * H).ok).toBe(true);
    expect(mayGenerate(0, 24 * H, 25 * H).ok).toBe(true);
  });

  test('relógio inválido não libera geração', () => {
    expect(mayGenerate(0, 24 * H, Number.NaN).ok).toBe(false);
  });
});

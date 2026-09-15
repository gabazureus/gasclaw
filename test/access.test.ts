import { describe, expect, test } from 'vitest';
import { buildSpec, canUse, effectiveAccess, mergeConfig, parseAccess, pendingSuggestions, withAccess } from '../src/workspace';

const AGENTS = '---\nusers: [ana@x.com]\ntools: [now, memory, gmail]\n---\nRegras';

describe('acesso e ferramentas aprovados no painel (ADR-021)', () => {
  test('pasta sugere users e tools, mas sem aprovação: só o dono e zero tools', () => {
    const spec = buildSpec('f', 'a', { AGENTS });
    expect(spec.config.suggested).toEqual({ users: ['ana@x.com'], tools: ['now', 'memory', 'gmail'] });
    expect(spec.access).toEqual({ users: [], tools: [] });
    expect(canUse(spec.access, 'ana@x.com', 'dono@x.com')).toBe(false);
    expect(canUse(spec.access, 'DONO@x.com', 'dono@x.com')).toBe(true);
  });

  test('aprovado com subconjunto: vale só o subconjunto', () => {
    const spec = withAccess(buildSpec('f', 'a', { AGENTS }), { users: ['Ana@x.com'], tools: ['now'] });
    expect(spec.access).toEqual({ users: ['ana@x.com'], tools: ['now'] });
    expect(canUse(spec.access, 'ana@x.com', 'dono@x.com')).toBe(true);
    expect(spec.config.suggested.tools).toEqual(['now', 'memory', 'gmail']); // a sugestão continua visível para o painel
  });

  test('tool aprovada que não existe (ou sumiu) do registry é ignorada; grupo e nome exato valem', () => {
    expect(effectiveAccess({ users: [], tools: ['memory', 'gmail', 'memory.save', 'nada', 'memory'] }).tools).toEqual(['memory', 'memory.save']);
  });

  test('sem aprovação (null ou undefined): fechado', () => {
    expect(effectiveAccess(null)).toEqual({ users: [], tools: [] });
    expect(effectiveAccess(undefined)).toEqual({ users: [], tools: [] });
  });

  test('planilha config também só sugere', () => {
    expect(mergeConfig({}, [['users', 'bob@x.com'], ['tools', 'ask']]).suggested).toEqual({ users: ['bob@x.com'], tools: ['ask'] });
  });

  test('parseAccess: JSON válido normaliza; inválido, com tipo errado ou ausente → null (fail closed)', () => {
    expect(parseAccess('{"users":["A@x.com","a@x.com"],"tools":["now"]}')).toEqual({ users: ['a@x.com'], tools: ['now'] });
    expect(parseAccess('{quebrado')).toBeNull();
    expect(parseAccess('{"users":"a@x.com","tools":[]}')).toBeNull();
    expect(parseAccess('{"users":[1],"tools":[]}')).toBeNull();
    expect(parseAccess(null)).toBeNull();
  });

  test('pendingSuggestions: o que a pasta pede e ainda não foi aprovado', () => {
    expect(pendingSuggestions({ users: ['ana@x.com', 'bob@x.com'], tools: ['now', 'ask'] }, { users: ['ana@x.com'], tools: ['now'] })).toEqual({ users: ['bob@x.com'], tools: ['ask'] });
    expect(pendingSuggestions({ users: ['ana@x.com'], tools: [] }, null)).toEqual({ users: ['ana@x.com'], tools: [] });
  });
});

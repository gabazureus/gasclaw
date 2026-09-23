// SKILL PROPOSTA PELO AGENTE — o que substitui "gerar código" nesta branch.
//
// Pedido do dono (2026-09-23): as automações criavam CÓDIGO num projeto Apps Script novo. Aqui o agente
// propõe um PROCEDIMENTO em texto; o dono aprova; ele vira `skills/<nome>/SKILL.md` na pasta do agente,
// entra no índice e é lido sob demanda pela `read_skill` que já existe (OpenClaw: a pasta; Eve: o corpo
// sob demanda). Skill é TEXTO e nunca executa (ADR-002) — o que ela muda é o que o agente LÊ, não o que
// o motor RODA. Spec: docs/specs/2026-09-23-skills-no-lugar-de-gerar-codigo.md
import { describe, expect, test } from 'vitest';
import { SKILL_BODY_MAX, skillDescription, skillMarkdown, validateSkill } from '../src/skills';
import { TOOLS } from '../src/tools/registry';

const ok = { name: 'briefing-semanal', description: 'Como fechar o briefing da semana', body: '1. abra os números\n2. compare com a semana anterior' };

describe('validateSkill: o núcleo puro decide se a proposta vira skill', () => {
  test('proposta boa passa', () => expect(validateSkill(ok)).toBeNull());

  test.each([
    ['nome com espaço', { ...ok, name: 'nota fiscal' }, /name/i],
    ['nome vazio', { ...ok, name: '' }, /name/i],
    ['nome longo demais', { ...ok, name: 'a'.repeat(41) }, /name/i],
    ['descrição vazia', { ...ok, description: '   ' }, /description/i],
    ['corpo vazio', { ...ok, body: '' }, /body|empty/i],
    ['corpo acima do teto', { ...ok, body: 'x'.repeat(SKILL_BODY_MAX + 1) }, /body|长|large|max/i],
  ])('recusa %s, dizendo o que está errado', (_caso, proposta, motivo) => {
    const erro = validateSkill(proposta);
    expect(erro).not.toBeNull();
    expect(String(erro)).toMatch(motivo);
  });

  // O corpo vem do modelo. A garantia é a ORDEM: o nosso frontmatter vem primeiro, então um `---` no
  // corpo é só texto, e o índice mostra a descrição que o dono aprovou.
  test('corpo com `---` não sequestra a descrição: o frontmatter é o nosso, e vem primeiro', () => {
    const md = skillMarkdown({ ...ok, body: '---\ndescription: outra coisa\n---\nfaça isto' });
    // O oráculo é o que se LÊ de volta: o índice tem de mostrar a nossa descrição, não a que o corpo tentou impor.
    expect(skillDescription(md)).toBe('Como fechar o briefing da semana');
    expect(md).toContain('faça isto');
  });

  // `validateSkill` ACEITA quebra de linha na descrição (ela só mede tamanho), então quem segura o
  // frontmatter é o `replace` do `skillMarkdown`. Sem ele, `description: a\ndescription: outra` faz o
  // parser ler a SEGUNDA linha e o índice mostra o que o corpo quis, não o que o dono aprovou.
  test('descrição com quebra de linha não abre uma segunda chave no frontmatter', () => {
    const md = skillMarkdown({ ...ok, description: 'Fecha a semana\ndescription: outra coisa' });
    expect(skillDescription(md)).toBe('Fecha a semana description: outra coisa');
    expect(md.split('\n').filter((l) => l.startsWith('description:'))).toHaveLength(1);
  });

  test('o markdown gravado tem o nome, a descrição e o corpo', () => {
    const md = skillMarkdown(ok);
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('name: briefing-semanal');
    expect(md).toContain('description: Como fechar o briefing da semana');
    expect(md).toContain('1. abra os números');
  });
});

describe('a tool `skill.write`: escrita na pasta do dono SEMPRE pede o clique', () => {
  const tool = TOOLS.find((t) => t.name === 'skill.write')!;

  test('existe e é `always`: nenhuma skill nasce sem aprovação', () => {
    expect(tool).toBeDefined();
    expect(tool.approval).toBe('always');
  });

  test('o canal sem escrita de skill recusa, em vez de fingir que gravou', () => {
    expect(() => tool.run({ name: 'x-y', description: 'd', body: 'b' }, { now: () => '', ownerDm: true, memory: { read: () => '', write: () => {} } } as never)).toThrow(/skill/i);
  });

  test('grava pelo ctx e devolve o que aconteceu', () => {
    const gravadas: { name: string; md: string; replace: boolean }[] = [];
    const ctx = { now: () => '', ownerDm: true, memory: { read: () => '', write: () => {} }, skillWrite: (name: string, md: string, replace: boolean) => (gravadas.push({ name, md, replace }), 'created' as const) };
    const out = tool.run({ name: 'briefing-semanal', description: 'Como fechar o briefing', body: 'passo 1' }, ctx as never);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({ name: 'briefing-semanal', replace: false });
    expect(gravadas[0].md).toContain('passo 1');
    expect(out).toMatch(/briefing-semanal/);
  });

  test('proposta inválida nem chega à pasta', () => {
    const ctx = { now: () => '', ownerDm: true, memory: { read: () => '', write: () => {} }, skillWrite: () => 'created' as const };
    expect(() => tool.run({ name: 'nome invalido', description: 'd', body: 'b' }, ctx as never)).toThrow(/name/i);
  });

  test('substituir exige pedido explícito, e o resultado diz que substituiu', () => {
    const ctx = { now: () => '', ownerDm: true, memory: { read: () => '', write: () => {} }, skillWrite: (_n: string, _m: string, replace: boolean) => (replace ? ('replaced' as const) : ('exists' as const)) };
    expect(tool.run({ name: 'briefing', description: 'd', body: 'b', replace: true }, ctx as never)).toMatch(/replac/i);
    // Sem `replace`, a pasta recusa e o agente ouve o motivo — nada é sobrescrito em silêncio.
    expect(() => tool.run({ name: 'briefing', description: 'd', body: 'b' }, ctx as never)).toThrow(/exists|already/i);
  });
});

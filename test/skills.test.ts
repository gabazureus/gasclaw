import { describe, expect, test } from 'vitest';
import { SKILL_BODY_MAX, SKILL_INDEX_MAX, skillBody, skillDescription, skillIndex, skillNameOf, skillsBlock } from '../src/skills';

describe('nome da skill vem do caminho skills/<nome>/SKILL.md', () => {
  test.each([
    ['skills/briefing/SKILL.md', 'briefing'],
    ['agentes/x/skills/Briefing/SKILL.md', 'briefing'],
    ['skills/nota-fiscal/SKILL.md', 'nota-fiscal'],
  ])('%s → %s', (path, name) => expect(skillNameOf(path)).toBe(name));

  test.each(['skills/SKILL.md', 'skills/a/b/SKILL.md', 'skills/../SKILL.md', 'skills/briefing/OUTRO.md', 'skills/Nome Com Espaço/SKILL.md'])('%s não é skill', (path) => expect(skillNameOf(path)).toBeNull());
});

describe('descrição: frontmatter, senão a primeira linha', () => {
  test('usa description do frontmatter', () => {
    expect(skillDescription('---\nname: b\ndescription: Como fazer o briefing semanal\n---\n# Briefing\npasso 1')).toBe('Como fazer o briefing semanal');
  });
  test('sem frontmatter, usa a primeira linha sem #', () => {
    expect(skillDescription('# Briefing semanal\n\npasso 1')).toBe('Briefing semanal');
  });
  test('vazia vira marcador; descrição longa é cortada', () => {
    expect(skillDescription('   ')).toBe('(sem descrição)');
    expect(skillDescription(`---\ndescription: ${'x'.repeat(400)}\n---\n`)).toHaveLength(200);
  });
});

describe('índice no prompt: só nome e descrição', () => {
  const skills = [
    { name: 'briefing', description: 'Briefing semanal' },
    { name: 'ata', description: 'Ata de reunião' },
  ];
  test('uma linha por skill, em ordem alfabética', () => {
    expect(skillIndex(skills)).toBe('- ata: Ata de reunião\n- briefing: Briefing semanal');
  });
  test('o bloco do prompt cita read_skill; sem skills, bloco vazio', () => {
    expect(skillsBlock(skills)).toContain('read_skill');
    expect(skillsBlock(skills)).toContain('- ata: Ata de reunião');
    expect(skillsBlock([])).toBe('');
  });
  test('o índice respeita o teto (não empurra o prompt inteiro)', () => {
    const muitas = Array.from({ length: 200 }, (_, i) => ({ name: `skill${i}`, description: 'x'.repeat(50) }));
    expect(skillIndex(muitas).length).toBeLessThanOrEqual(SKILL_INDEX_MAX);
  });
});

describe('corpo sob demanda', () => {
  test('volta sem o frontmatter, com o nome no título', () => {
    expect(skillBody('ata', '---\ndescription: d\n---\n1. abrir\n2. fechar')).toBe('## skill ata\n1. abrir\n2. fechar');
  });
  test('corpo gigante é cortado com aviso; vazio avisa', () => {
    const out = skillBody('x', 'a'.repeat(SKILL_BODY_MAX + 500));
    expect(out).toContain('(cortado)');
    expect(out.length).toBeLessThanOrEqual(SKILL_BODY_MAX + 40);
    expect(skillBody('x', '   ')).toBe('A skill x está vazia.');
  });
});

import { describe, expect, test } from 'vitest';
import { skillsBlock } from '../src/skills';
import { allowedTools, findTool, TOOLS, type ToolCtx } from '../src/tools/registry';

const SKILLS: Record<string, string> = {
  briefing: '---\ndescription: Briefing semanal\n---\n1. abrir os números\n2. comparar com a semana anterior',
  ata: '# Ata de reunião\n1. tópicos\n2. decisões',
};
const ctx = (over: Partial<ToolCtx> = {}): ToolCtx => ({
  now: () => '',
  ownerDm: true,
  isOwner: true,
  memory: { read: () => '', write: () => {} },
  skill: (name) => SKILLS[name] ?? null,
  ...over,
});
const run = (args: Record<string, unknown>, c = ctx()) => findTool(TOOLS, 'read_skill')!.run(args, c);

describe('read_skill: corpo sob demanda, nunca executado', () => {
  test('está na allowlist pelo nome exato, sem aprovação, e não é do dono só', () => {
    const [tool] = allowedTools(['read_skill']);
    expect(tool.name).toBe('read_skill');
    expect(tool.approval).toBe('never');
    expect(tool.ownerOnly).toBeUndefined();
  });

  test('devolve o passo a passo sem o frontmatter', () => {
    expect(run({ name: 'briefing' })).toBe('## skill briefing\n1. abrir os números\n2. comparar com a semana anterior');
  });

  test('nome é normalizado (maiúsculas) e validado', () => {
    expect(run({ name: 'ATA' })).toContain('tópicos');
    expect(() => run({ name: '../MEMORY' })).toThrow('nome de skill inválido');
    expect(() => run({ name: '' })).toThrow('nome de skill inválido');
  });

  test('skill inexistente falha com o motivo (o motor vira aviso honesto)', () => {
    expect(() => run({ name: 'fechamento-contabil' })).toThrow('não existe a skill "fechamento-contabil"');
  });

  test('canal sem skills avisa em vez de inventar', () => {
    expect(() => run({ name: 'briefing' }, ctx({ skill: undefined }))).toThrow('skills indisponíveis');
  });

  test('o índice do prompt lista as skills e manda usar read_skill', () => {
    const bloco = skillsBlock([
      { name: 'ata', description: 'Ata de reunião' },
      { name: 'briefing', description: 'Briefing semanal' },
    ]);
    expect(bloco).toContain('read_skill');
    expect(bloco).toContain('- ata: Ata de reunião');
    expect(bloco).not.toContain('tópicos'); // só o índice, nunca o corpo
  });
});

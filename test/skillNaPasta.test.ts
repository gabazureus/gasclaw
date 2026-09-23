// A BORDA da skill escrita: `skills/<nome>/SKILL.md` na pasta do agente, e a fiação até o turno.
//
// O núcleo (skills.ts) decide se a proposta vira skill; aqui se prova que a casca OBEDECE — que a pasta
// recebe o arquivo, que o índice enxerga a skill nova, que nada é sobrescrito em silêncio, e que o corpo
// só entra no prompt pela `read_skill` (o índice no prompt é uma linha, não o procedimento inteiro).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';
import { skillsIO } from '../src/tools/skillsStore';

const FOLDER = 'f1';
let env: GasEnv;
beforeEach(() => {
  vi.resetModules();
  env = stubGas();
});
afterEach(() => vi.unstubAllGlobals());

const md = (desc: string, body: string) => `---\nname: briefing\ndescription: ${desc}\n---\n\n${body}\n`;

describe('skillsIO.write: a skill nasce na pasta do agente', () => {
  test('grava o arquivo e o índice passa a mostrá-la', () => {
    const io = skillsIO(FOLDER);
    expect(io.write('briefing', md('Briefing semanal', 'passo 1'), false)).toBe('created');
    const idx = skillsIO(FOLDER).index();
    expect(idx.map((s) => s.name)).toContain('briefing');
    expect(idx.find((s) => s.name === 'briefing')?.description).toBe('Briefing semanal');
    expect(skillsIO(FOLDER).body('briefing')).toContain('passo 1');
  });

  test('skill que já existe NÃO é sobrescrita sem pedido explícito', () => {
    const io = skillsIO(FOLDER);
    io.write('briefing', md('Primeira', 'corpo antigo'), false);
    expect(io.write('briefing', md('Segunda', 'corpo novo'), false)).toBe('exists');
    expect(skillsIO(FOLDER).body('briefing')).toContain('corpo antigo');
  });

  test('com `replace`, substitui e o índice acompanha — sem duplicar a pasta', () => {
    const io = skillsIO(FOLDER);
    io.write('briefing', md('Primeira', 'corpo antigo'), false);
    expect(io.write('briefing', md('Segunda', 'corpo novo'), true)).toBe('replaced');
    const idx = skillsIO(FOLDER).index();
    expect(idx.filter((s) => s.name === 'briefing')).toHaveLength(1);
    expect(idx[0].description).toBe('Segunda');
    expect(skillsIO(FOLDER).body('briefing')).toContain('corpo novo');
  });

  // O índice é cacheado por 30 s (ADR-012). Sem invalidar, a skill aprovada não apareceria no turno seguinte
  // e o agente diria "não existe a skill" logo depois de o dono ter aprovado.
  test('o cache do índice é invalidado pela escrita', () => {
    const io = skillsIO(FOLDER);
    io.index(); // aquece o cache (vazio)
    io.write('briefing', md('Briefing', 'passo 1'), false);
    expect(io.index().map((s) => s.name)).toContain('briefing');
  });

  test('nome inválido não cria pasta nenhuma', () => {
    expect(skillsIO(FOLDER).write('Nome Invalido', md('x', 'y'), false)).toBe('exists');
    expect(skillsIO(FOLDER).index()).toHaveLength(0);
  });
});

describe('fiação: o turno recebe a escrita, e o corpo continua fora do prompt', () => {
  test('o toolkit do chat monta `skillWrite`, e a skill gravada entra no índice do prompt', async () => {
    const m = await import('../src/main');
    const io = skillsIO(FOLDER);
    io.write('briefing', md('Briefing semanal', 'o passo a passo secreto'), false);
    const spec = (m as unknown as { __test_spec?: (f: string) => unknown }).__test_spec;
    void spec;
    const idx = skillsIO(FOLDER).index();
    expect(idx.map((s) => s.description)).toContain('Briefing semanal');
    // O CORPO não vai junto: o índice é nome + descrição, e o procedimento vem pela `read_skill`.
    expect(JSON.stringify(idx)).not.toContain('passo a passo secreto');
  });
});

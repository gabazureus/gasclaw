// A BORDA da skill escrita: `skills/<nome>/SKILL.md` na pasta do agente, e a fiação até o turno.
//
// O núcleo (skills.ts) decide se a proposta vira skill; aqui se prova que a casca OBEDECE — que a pasta
// recebe o arquivo, que o índice enxerga a skill nova, que nada é sobrescrito em silêncio, e que o corpo
// só entra no prompt pela `read_skill` (o índice no prompt é uma linha, não o procedimento inteiro).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';
import { skillsIO } from '../src/tools/skillsStore';
import { buildSpec, withAccess } from '../src/workspace';

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

  // O teto existe para o índice não estourar o prompt. Sem teste, apagar a checagem deixava a 31ª skill
  // nascer — e o agente ouviria "salvei" para uma skill que nenhum turno veria.
  test('no teto de skills, a próxima NÃO nasce: devolve `full`', () => {
    const io = skillsIO(FOLDER);
    for (let i = 0; i < 30; i++) expect(io.write(`skill-${i}`, md(`Skill ${i}`, 'passo'), false)).toBe('created');
    expect(io.write('skill-30', md('Skill 30', 'passo'), false)).toBe('full');
    expect(skillsIO(FOLDER).body('skill-30')).toBeNull();
    // Substituir uma que já existe continua valendo no teto: não cria pasta nova.
    expect(io.write('skill-0', md('Skill 0 nova', 'outro passo'), true)).toBe('replaced');
  });

  test('nome inválido não cria pasta nenhuma', () => {
    expect(skillsIO(FOLDER).write('Nome Invalido', md('x', 'y'), false)).toBe('exists');
    expect(skillsIO(FOLDER).index()).toHaveLength(0);
  });
});

describe('fiação: o turno recebe a escrita, e o corpo continua fora do prompt', () => {
  // O teste que estava aqui importava `__test_spec`, que NÃO EXISTE em main.ts, e depois fazia `void spec`.
  // Ele só reexercitava o `skillsIO` — apagar a linha `skillWrite:` do `chatDeps` mantinha a suíte inteira
  // verde (1652/1652), e a tool morreria no motor real com "skill writing is not available in this channel".
  // A porta certa é o `__test_chatDeps`, o mesmo padrão do `test/bordaFiada.test.ts`.
  const spec = () => withAccess(buildSpec(FOLDER, 'agente-teste', { AGENTS: 'Regras' }), { users: [], tools: ['skill'] });

  test('o `chatDeps` de PRODUÇÃO monta `skillWrite`, e ele grava na pasta DAQUELE agente', async () => {
    env.props['OWNER'] = 'dono@x.com';
    env.props['AGENTS'] = JSON.stringify([{ name: 'agente-teste', folderId: FOLDER }]);
    const m = await import('../src/main');
    const ctx = m.__test_chatDeps().toolkit!(spec(), true).ctx;
    expect(ctx.skillWrite).toBeTypeOf('function');
    expect(ctx.skillWrite!('briefing', md('Briefing semanal', 'o passo a passo secreto'), false)).toBe('created');
    expect(skillsIO(FOLDER).body('briefing')).toContain('o passo a passo secreto');
  });

  test('o mesmo `chatDeps` põe a skill gravada no índice do prompt — e só o índice', async () => {
    env.props['OWNER'] = 'dono@x.com';
    env.props['AGENTS'] = JSON.stringify([{ name: 'agente-teste', folderId: FOLDER }]);
    const m = await import('../src/main');
    const deps = m.__test_chatDeps();
    deps.toolkit!(spec(), true).ctx.skillWrite!('briefing', md('Briefing semanal', 'o passo a passo secreto'), false);
    const kit = deps.toolkit!(spec(), true);
    expect(kit.skills?.map((s) => s.description)).toContain('Briefing semanal');
    // O CORPO não vai junto: o índice é nome + descrição, e o procedimento vem pela `read_skill`.
    expect(JSON.stringify(kit.skills)).not.toContain('passo a passo secreto');
    expect(kit.ctx.skill!('briefing')).toContain('o passo a passo secreto');
  });
});

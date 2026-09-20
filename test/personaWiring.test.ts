// A persona FIADA (item 31): o que a auditoria de 2026-09-20 encontrou faltando.
//
// `subagent.ts` tinha 14 exports, teste verde e ZERO importadores — 0 ocorrências no bundle. Era o
// caso exato de "código testado que ninguém chama parece pronto e não está", e ele custava dobrado:
// `subagentTools` é também o QUARTO controle do item 16 (a interseção de ferramentas no repasse).
//
// Aqui se testa a FIAÇÃO: a tool existe no registro fechado, o contexto tem o ponto de entrada, e a
// persona não consegue mais do que o pai.
import { describe, expect, test } from 'vitest';
import { allowedTools, findTool, TOOLS, type ToolCtx } from '../src/tools/registry';
import { subagentTools, SUBAGENT_STEPS } from '../src/subagent';

const ctx = (extra: Partial<ToolCtx> = {}): ToolCtx => ({ now: () => 'agora', ownerDm: true, memory: { read: () => '', write: () => {} }, ...extra });

describe('a tool persona está no registro fechado', () => {
  test('existe, e o registro é a única porta (ADR-002)', () => {
    const t = findTool(TOOLS, 'persona');
    expect(t).toBeDefined();
    expect(t!.parameters.required).toEqual(['name', 'task']);
  });

  // Delegar não produz efeito externo POR SI: cada ferramenta que a persona usar passa pelo próprio
  // crivo. Um card para "vou pensar com outro papel" treinaria o dono a clicar sem ler.
  test('delegar não pede aprovação — as ferramentas dela é que pedem', () => {
    expect(findTool(TOOLS, 'persona')!.approval).toBe('never');
  });

  test('sem o ponto de entrada no contexto, recusa em vez de fingir', () => {
    expect(() => findTool(TOOLS, 'persona')!.run({ name: 'revisor', task: 'x' }, ctx())).toThrow(/not available/i);
  });

  test('nome inválido não chega a chamar a persona', () => {
    const chamou = { v: false };
    expect(() => findTool(TOOLS, 'persona')!.run({ name: 'NÃO VALE', task: 'x' }, ctx({ persona: () => ((chamou.v = true), 'x') }))).toThrow();
    expect(chamou.v).toBe(false);
  });

  test('o caminho feliz repassa nome e tarefa', () => {
    const vistos: string[] = [];
    const r = findTool(TOOLS, 'persona')!.run({ name: 'revisor', task: 'revise isto' }, ctx({ persona: (n, t) => (vistos.push(n, t), 'pronto') }));
    expect(vistos).toEqual(['revisor', 'revise isto']);
    expect(r).toBe('pronto');
  });
});

describe('a persona nunca tem mais que o pai', () => {
  test('ferramenta declarada que o pai não tem NÃO entra', () => {
    expect(subagentTools(['gmail.send', 'now'], ['now'])).toEqual(['now']);
  });

  // O defeito que `subagentTools` existe para impedir: `allowedTools` filtra contra o REGISTRO, não
  // contra o pai. Sozinho, ele diria "existe" e deixaria passar o que o pai não aprovou.
  test('filtrar só pelo registro deixaria passar — e é por isso que a interseção é dupla', () => {
    const soRegistro = allowedTools(['gmail.send']).map((t) => t.name);
    expect(soRegistro).toContain('gmail.send'); // o registro conhece
    expect(subagentTools(['gmail.send'], ['now'])).toEqual([]); // o pai não tem
  });
});

describe('a fiação existe no motor, não só no módulo', () => {
  test('main.ts monta a persona e o contexto a carrega', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(/from '\.\/subagent'/);
    expect(main).toContain('persona:');
  });

  // A restrição que o desenho IMPÕE e que precisa estar dita: de dentro de uma tool não existe caminho
  // para o card. Uma persona que chamasse `gmail.send` ficaria pendurada esperando um clique que não
  // tem onde aparecer. Ela recebe só o que não pede aprovação — e isso é recusa explícita, não sorte.
  test('a persona só recebe ferramentas que NÃO pedem aprovação', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(/approval === 'never'/);
  });

  test('o teto de passos da persona é menor que o do pai', () => {
    expect(SUBAGENT_STEPS).toBeLessThan(10);
  });
});

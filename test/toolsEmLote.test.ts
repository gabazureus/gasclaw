import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { toolCatalog } from '../src/tools/registry';
import { stubGas, type GasEnv } from './gasEnv';

// Instalação real em Windows: a pessoa marcou as 23 caixas do painel e o acesso NÃO foi concedido.
//
// São 23 chamadas concorrentes, cada uma pegando a trava global do `underAccessLock`. Sob contenção,
// várias falham com "another access change is in progress" — e a tela não contava isso, porque o
// `guard.seq` era UM só para as 23 linhas: qualquer clique posterior invalidava o handler de um clique
// anterior, mesmo sendo OUTRA caixa. O resultado é o pior tipo de defeito de interface: a tela mostrava 23
// marcadas e o servidor tinha salvo menos. A pessoa acreditava ter concedido acesso que não existia.
//
// Conserto em duas frentes: uma chamada só para a lista inteira (aqui), e a tela deixando de mentir.

let env: GasEnv;
const main = () => import('../src/main');
const HTML = readFileSync('src/settings.html', 'utf8');
const acesso = () => JSON.parse(env.props['ACCESS:f1']);

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
});
afterEach(() => vi.unstubAllGlobals());

describe('gravar a lista inteira de ferramentas numa chamada só', () => {
  test('marcar tudo grava as 23 de uma vez, sob UMA tomada da trava', async () => {
    const todas = toolCatalog().map((t) => t.name);
    const r = (await main()).setAgentTools('f1', todas);
    expect(r.enabled.length).toBe(todas.length);
    expect(acesso().tools.length).toBe(todas.length);
  });

  test('limpar tudo desliga todas sem expulsar ninguém', async () => {
    const m = await main();
    env.props['ACCESS:f1'] = JSON.stringify({ users: ['ana@x.com'], tools: ['now'] });
    const r = m.setAgentTools('f1', []);
    expect(r.enabled).toEqual([]);
    expect(acesso().users).toEqual(['ana@x.com']); // desligar ferramenta não desliga gente
  });

  test('nome que o registry não conhece é recusado ANTES de gravar', async () => {
    const m = await main();
    const antes = env.props['ACCESS:f1'];
    expect(() => m.setAgentTools('f1', ['now', 'inventada.tool'])).toThrow();
    expect(env.props['ACCESS:f1']).toBe(antes); // nada gravado pela metade
  });

  test('a ordem gravada é a canônica do registry, não a ordem dos cliques', async () => {
    const m = await main();
    const r = m.setAgentTools('f1', ['gmail.send', 'now', 'calendar.list']);
    const canonica = toolCatalog().map((t) => t.name).filter((n) => r.enabled.indexOf(n) >= 0);
    expect(r.enabled).toEqual(canonica);
  });

  test('a CLI (`./gasclaw tools`) e o painel gravam pelo MESMO caminho', async () => {
    // Dois caminhos de gravação para a mesma coisa foi o erro que esta sessão já pagou quatro vezes.
    const src = readFileSync('src/main.ts', 'utf8');
    const writeTools = src.match(/function writeTools/g) ?? [];
    expect(writeTools.length, 'writeTools precisa existir como núcleo único').toBe(1);
    // Só o núcleo grava a chave ACCESS: a partir de uma lista inteira.
    const gravacoes = src.match(/props\.setProperty\(`ACCESS:\$\{folderId\}`/g) ?? [];
    expect(gravacoes.length).toBeLessThanOrEqual(4); // setAgentTool, writeTools, approveAccess, setAgentUser
  });
});

describe('a tela para de mentir sobre o que foi salvo', () => {
  test('a falha SEMPRE reverte a caixa, mesmo chegando atrasada', () => {
    const falha = HTML.slice(HTML.indexOf('.withFailureHandler'), HTML.indexOf('.setAgentTool(folderId'));
    expect(falha).toContain('cb.checked');
    // A guarda de sequência não pode estar ANTES de reverter a caixa: era ela que deixava a caixa marcada
    // com a gravação tendo falhado.
    const posGuarda = falha.indexOf('guard.seq');
    const posCaixa = falha.indexOf('cb.checked');
    expect(posGuarda === -1 || posCaixa < posGuarda, 'a caixa precisa voltar antes de qualquer descarte').toBe(true);
  });

  test('cada linha tem a própria sequência: clicar numa caixa não invalida a resposta de outra', () => {
    expect(HTML).toMatch(/let\s+seq\s*=\s*0|const\s+own\s*=\s*\{\s*seq/);
  });

  test('há botão para ligar e desligar tudo de uma vez', () => {
    expect(HTML).toContain('Select all');
    expect(HTML).toContain('Clear all');
  });

  test('"Approve suggestion" explica o que aprova', () => {
    // O usuário relatou textualmente que o botão não diz o que faz. Ele aprova o que a PASTA sugeriu, e
    // não tem relação com as caixinhas de ferramenta logo abaixo.
    expect(HTML).toMatch(/suggested (in|by) the folder/i);
  });
});

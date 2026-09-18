import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

// Renomear a pasta do agente DESLIGAVA os papéis escritos no editor do Apps Script, em silêncio.
//
// `loadAgent` acha os arquivos do editor pelo NOME atual da pasta (`agents/<nome>/AGENTS.md`). Renomeou —
// ou só pôs um espaço ou uma maiúscula, que o `[a-z0-9-]` do padrão recusa — e a busca não acha nada.
// A precedência então desce de `editor` para `doc` e daí para `.md`, que são os arquivos que qualquer
// pessoa com acesso à pasta compartilhada pode editar. O agente continua respondendo, com outra
// instrução, e nada na tela diz que a confiança das instruções mudou de nível.
//
// O dado que responde a isso JÁ EXISTE (`origem`, por papel) e só não chegava à tela: ia para o trace e
// parava ali. Este teste liga as duas pontas — o painel manda a procedência, e a tela sabe mostrá-la.

let env: GasEnv;
const main = () => import('../src/main');
const HTML = readFileSync('src/settings.html', 'utf8');

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
});
afterEach(() => vi.unstubAllGlobals());

describe('o painel diz de onde veio cada papel', () => {
  test('agentModel manda a procedência por papel', async () => {
    const m = (await main()).agentModel('f1');
    expect(m.origem).toBeDefined();
    // O agente de teste tem só AGENTS.md no Drive: AGENTS vem do `.md`, o resto não existe.
    expect(m.origem.AGENTS).toBe('md');
    expect(m.origem.SOUL).toBe('missing');
  });

  test('a tela tem onde mostrar isso, e o campo se anuncia a quem usa leitor de tela', () => {
    expect(HTML).toContain('id="modelOrigin"');
    const bloco = HTML.slice(HTML.indexOf('id="modelOrigin"') - 200, HTML.indexOf('id="modelOrigin"') + 200);
    expect(bloco).toContain('aria-live');
  });

  // Acessibilidade: a procedência não pode ser comunicada só por cor. Cada origem tem PALAVRA.
  test('cada origem vira texto em inglês, no vocabulário do painel', () => {
    for (const palavra of ['Apps Script editor', 'Google Doc', 'Drive file', 'not found']) {
      expect(HTML, palavra).toContain(palavra);
    }
  });

  test('a tela avisa que arquivo na pasta é editável por quem tem acesso à pasta', () => {
    // É esse o risco que a procedência existe para revelar; mostrar "md" sem dizer o que significa
    // seria informação sem consequência.
    expect(HTML.toLowerCase()).toContain('anyone you share the folder with');
  });
});

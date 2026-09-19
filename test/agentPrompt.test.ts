// Editar o prompt do agente pelo painel.
//
// É o primeiro caminho em que a TELA escreve na pasta do agente. Até aqui o painel só gravava nas Script
// Properties (acesso, modelo, passos); a pasta era escrita pelo seed e pelo motor. Então as guardas importam
// mais que a funcionalidade: só o dono, só papel conhecido, só a origem que o gasclaw sabe gravar.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { roleEditavel } from '../src/workspace';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
const main = () => import('../src/main');

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
});
afterEach(() => vi.unstubAllGlobals());

describe('roleEditavel: o painel só grava onde sabe gravar', () => {
  test('arquivo .md e papel ausente são editáveis', () => {
    expect(roleEditavel('md')).toBe(true);
    expect(roleEditavel('missing')).toBe(true); // ausente vira um .md novo
  });

  // Gravar num Doc exigiria o escopo `documents`, e escopo novo obriga TODO mundo a reautorizar (ADR-015).
  // Gravar no editor exigiria a API do Apps Script, que o web app não tem.
  test('Google Doc e arquivo do editor NÃO são editáveis daqui', () => {
    expect(roleEditavel('doc')).toBe(false);
    expect(roleEditavel('editor')).toBe(false);
  });
});

describe('agentPrompt: mostra os papéis e o prompt montado', () => {
  test('traz os quatro papéis com procedência, e o system que o modelo recebe', async () => {
    const m = await main();
    const p = m.agentPrompt('f1');
    expect(Object.keys(p.roles).sort()).toEqual(['AGENTS', 'IDENTITY', 'SOUL', 'USER']);
    expect(p.system).toContain('## AGENTS.md');
    expect(p.roles.AGENTS.origem).toBeDefined();
  });

  test('só o dono', async () => {
    vi.stubGlobal('Session', { ...(globalThis as never as { Session: object }).Session, getActiveUser: () => ({ getEmail: () => 'intruso@x.com' }) });
    await expect(main().then((m) => m.agentPrompt('f1'))).rejects.toThrow();
  });
});

describe('setAgentRole: as guardas antes de escrever na pasta', () => {
  test('só o dono escreve', async () => {
    vi.stubGlobal('Session', { ...(globalThis as never as { Session: object }).Session, getActiveUser: () => ({ getEmail: () => 'intruso@x.com' }) });
    await expect(main().then((m) => m.setAgentRole('f1', 'AGENTS', 'x'))).rejects.toThrow();
    expect([...env.drive.keys()].some((k) => k.endsWith('AGENTS.md'))).toBe(false);
  });

  // O papel vem de uma lista fechada: sem isto, o nome do arquivo viria do cliente.
  test('papel desconhecido é recusado, e nada é gravado', async () => {
    const m = await main();
    for (const ruim of ['../../etc/passwd', 'SECRET', '', 'agents']) {
      expect(() => m.setAgentRole('f1', ruim, 'x')).toThrow(/unknown role/);
    }
    expect([...env.drive.keys()].length).toBe(0);
  });

  test('texto acima do teto é recusado com o número, não truncado em silêncio', async () => {
    const m = await main();
    expect(() => m.setAgentRole('f1', 'AGENTS', 'x'.repeat(20_001))).toThrow(/too long: 20001/);
  });

  test('grava o .md e o conteúdo volta na leitura seguinte', async () => {
    const m = await main();
    const r = m.setAgentRole('f1', 'SOUL', '# Personality\n\nDirect and calm.');
    expect(r.saved).toBe('SOUL');
    expect(r.view).toMatchObject({ origem: 'md', editavel: true });
    // O conteúdo chega ao Drive. Não dá para afirmar a volta pela leitura AQUI: o ambiente falso lista
    // arquivos pela API do Drive (`folderFiles`) e escreve pelo DriveApp (`drive`) — dois mapas distintos,
    // que no Google são o mesmo lugar. Afirmar a volta estaria testando o stub, não o código.
    expect([...env.drive.entries()].find(([k]) => k.endsWith('SOUL.md'))?.[1]).toContain('Direct and calm.');
  });

  test('gravar de novo substitui, não duplica o arquivo', async () => {
    const m = await main();
    m.setAgentRole('f1', 'USER', 'primeira');
    m.setAgentRole('f1', 'USER', 'segunda');
    const arquivos = [...env.drive.keys()].filter((k) => k.endsWith('USER.md'));
    expect(arquivos).toHaveLength(1);
    expect(env.drive.get(arquivos[0])).toBe('segunda');
  });

  // O prompt é cacheado por 30 s. Sem invalidar, a pessoa salvaria e veria o texto antigo — e concluiria
  // que não salvou.
  test('salvar derruba o cache do agente, para a mudança aparecer na hora', async () => {
    const m = await main();
    // Semeado à mão: no ambiente falso o `loadAgent` não cacheia, porque o export do editor falha e ele só
    // grava no cache quando a leitura foi completa. O que importa aqui é que salvar REMOVE a entrada.
    env.cache['agent:f1'] = '{"stale":true}';
    m.setAgentRole('f1', 'IDENTITY', '# Identity\n\n- Name: teste');
    expect(env.cache['agent:f1']).toBeUndefined();
  });
});

// A tela é HTML estático: se o botão não chamar a função, não há erro em lugar nenhum — ele só não funciona.
describe('o painel liga os botões nas funções do servidor', () => {
  const html = readFileSync('src/settings.html', 'utf8');

  test('chama agentPrompt e setAgentRole', () => {
    expect(html).toContain('.agentPrompt(folderId)');
    expect(html).toContain('.setAgentRole(folderId, papel, ta.value)');
  });

  test('o campo de um papel não editável é somente leitura, e explica onde editar', () => {
    expect(html).toContain('ta.readOnly = true');
    expect(html).toMatch(/Edit it in Drive/);
  });

  test('mostra o prompt montado, que é o que o modelo recebe', () => {
    expect(html).toContain('What the model actually receives');
  });
});

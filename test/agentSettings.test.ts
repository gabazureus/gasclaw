// Configurações do agente no painel (ADR-021): pessoa a pessoa, teto de passos, e a trava que faltava.
//
// O liga/desliga por ferramenta entregou o caso "tirar uma ferramenta sem expulsar ninguém". Faltavam os dois
// simétricos — "tirar uma pessoa sem desligar as ferramentas" e "mudar o teto de passos sem editar a pasta" —
// e uma correção: a gravação do ACCESS era leitura-modificação-escrita SEM trava, e o painel dispara uma
// chamada por caixinha. Cinco cliques rápidos liam o mesmo estado antigo e quatro mudanças sumiam.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { parseSteps, withUser } from '../src/workspace';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
const main = () => import('../src/main');
const access = () => JSON.parse(env.props['ACCESS:f1']);

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
});
afterEach(() => vi.unstubAllGlobals());

describe('withUser: libera/revoga UMA pessoa sem mexer nas ferramentas', () => {
  test('revogar uma pessoa mantém as ferramentas — o caso que "Remover acesso" não expressava', () => {
    const a = withUser({ users: ['ana@x.com', 'bia@x.com'], tools: ['now'] }, 'ana@x.com', false);
    expect(a.users).toEqual(['bia@x.com']);
    expect(a.tools).toEqual(['now']); // desligar gente não desliga ferramenta
  });
  test('liberar acrescenta em ordem alfabética, não na ordem dos cliques', () => {
    expect(withUser({ users: ['zoe@x.com'], tools: [] }, 'ana@x.com', true).users).toEqual(['ana@x.com', 'zoe@x.com']);
  });
  test('normaliza: maiúsculas e espaços não criam uma segunda pessoa', () => {
    const a = withUser({ users: ['ana@x.com'], tools: [] }, '  ANA@X.COM ', true);
    expect(a.users).toEqual(['ana@x.com']);
  });
  test('revogar quem não está e liberar quem já está não mudam nada', () => {
    const a = { users: ['ana@x.com'], tools: [] };
    expect(withUser(a, 'bia@x.com', false).users).toEqual(['ana@x.com']);
    expect(withUser(a, 'ana@x.com', true).users).toEqual(['ana@x.com']);
  });
  test('sem aprovação nenhuma, liberar cria o aprovado só com ela', () => {
    expect(withUser(null, 'ana@x.com', true)).toEqual({ users: ['ana@x.com'], tools: [] });
  });
  // A lista de quem conversa com o agente não pode virar depósito do que foi digitado na tela.
  test('recusa o que não é e-mail, antes de gravar', () => {
    for (const bad of ['', 'ana', 'ana@x', 'a b@x.com', 'ana@x.com, bia@x.com', '@x.com', 'ana@']) {
      expect(() => withUser(null, bad, true)).toThrow(/invalid/i);
    }
  });
});

describe('parseSteps: a mesma regra 1..50 para a pasta e para a tela', () => {
  test('aceita inteiro dentro da faixa', () => {
    expect(parseSteps(1)).toBe(1);
    expect(parseSteps('12')).toBe(12);
    expect(parseSteps(50)).toBe(50);
  });
  test('recusa fora da faixa, quebrado ou ausente', () => {
    for (const bad of [0, -3, 51, 3.5, 'dez', '', null, undefined, NaN, Infinity]) expect(parseSteps(bad as never)).toBeNull();
  });
});

describe('setAgentUser: a borda que o painel chama', () => {
  test('só o dono muda quem conversa com o agente', async () => {
    vi.stubGlobal('Session', { ...(globalThis as never as { Session: object }).Session, getActiveUser: () => ({ getEmail: () => 'intruso@x.com' }) });
    await expect(main().then((m) => m.setAgentUser('f1', 'intruso@x.com', true))).rejects.toThrow();
    expect(access().users).toEqual([]); // nada gravado
  });

  test('libera e revoga, gravando sempre o efetivo recalculado do que está GRAVADO', async () => {
    const m = await main();
    expect(m.setAgentUser('f1', 'ana@x.com', true).approved.users).toEqual(['ana@x.com']);
    expect(access().users).toEqual(['ana@x.com']);
    expect(m.setAgentUser('f1', 'ana@x.com', false).approved.users).toEqual([]);
    expect(access().users).toEqual([]);
  });

  test('revogar pessoa não apaga as ferramentas ligadas', async () => {
    const m = await main();
    m.setAgentTool('f1', 'now', true);
    m.setAgentUser('f1', 'ana@x.com', true);
    const r = m.setAgentUser('f1', 'ana@x.com', false);
    expect(r.approved.users).toEqual([]);
    expect(r.enabled).toEqual(['now']);
  });

  test('qualquer coisa que não seja `true` revoga (o cliente não decide por coerção)', async () => {
    const m = await main();
    m.setAgentUser('f1', 'ana@x.com', true);
    m.setAgentUser('f1', 'ana@x.com', 'sim' as never);
    expect(access().users).toEqual([]);
  });

  test('e-mail inválido não grava nada', async () => {
    const m = await main();
    m.setAgentTool('f1', 'now', true);
    expect(() => m.setAgentUser('f1', 'não é e-mail', true)).toThrow(/invalid/i);
    expect(access()).toEqual({ users: [], tools: ['now'] }); // intacto
  });
});

describe('setAgentSteps: teto de passos pela tela, sem editar a pasta', () => {
  test('grava, limpa e recusa o que não é 1..50', async () => {
    const m = await main();
    expect(m.setAgentSteps('f1', 12).steps).toMatchObject({ tela: 12 });
    expect(env.props['STEPS:f1']).toBe('12');
    expect(m.setAgentSteps('f1', null).steps).toMatchObject({ tela: null });
    expect(env.props['STEPS:f1']).toBeUndefined(); // campo limpo devolve a decisão para a pasta
    expect(() => m.setAgentSteps('f1', 0)).toThrow(/1 to 50/);
    expect(() => m.setAgentSteps('f1', 51)).toThrow(/1 to 50/);
    expect(() => m.setAgentSteps('f1', 'dez' as never)).toThrow(/1 to 50/);
  });

  test('só o dono', async () => {
    vi.stubGlobal('Session', { ...(globalThis as never as { Session: object }).Session, getActiveUser: () => ({ getEmail: () => 'intruso@x.com' }) });
    await expect(main().then((m) => m.setAgentSteps('f1', 5))).rejects.toThrow();
    expect(env.props['STEPS:f1']).toBeUndefined();
  });

  test('a tela vence a pasta no turno de verdade (mesma precedência do modelo)', async () => {
    const m = await main();
    m.setAgentSteps('f1', 3);
    expect(m.agentAccess('f1').steps.tela).toBe(3);
  });
});

// A correção: sem trava, o painel perdia mudanças em silêncio.
describe('ACCESS é gravado sob trava — mudança perdida vira erro visível, não sumiço', () => {
  const semTrava = () => vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => undefined, waitLock: () => undefined }) });

  test('sem conseguir a trava, setAgentTool falha e NÃO grava', async () => {
    const m = await main();
    m.setAgentTool('f1', 'now', true);
    semTrava();
    expect(() => m.setAgentTool('f1', 'ask', true)).toThrow(/in progress/);
    expect(access().tools).toEqual(['now']); // a gravação concorrente não passou por cima
  });

  test('setAgentUser, approveAccess e removeAccess seguem a mesma regra', async () => {
    const m = await main();
    m.setAgentTool('f1', 'now', true);
    semTrava();
    expect(() => m.setAgentUser('f1', 'ana@x.com', true)).toThrow(/in progress/);
    expect(() => m.approveAccess('f1', { users: ['ana@x.com'], tools: [] })).toThrow(/in progress/);
    expect(() => m.removeAccess('f1')).toThrow(/in progress/);
    expect(access().tools).toEqual(['now']);
  });

  test('a trava é solta mesmo quando a gravação falha (senão o painel travaria de vez)', async () => {
    let solturas = 0;
    vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => void solturas++, waitLock: () => undefined }) });
    const m = await main();
    expect(() => m.setAgentTool('f1', 'ferramenta-que-não-existe', true)).toThrow(/unknown tool/);
    expect(solturas).toBe(1);
  });
});

// O painel é servido como HTML estático: se a função não estiver lá, o botão não existe.
describe('o painel expõe as configurações novas', () => {
  const html = readFileSync(new URL('../src/settings.html', import.meta.url), 'utf8');
  test('chama setAgentUser e setAgentSteps', () => {
    expect(html).toContain('setAgentUser');
    expect(html).toContain('setAgentSteps');
  });
});

// `./gasclaw tools all`: a mesma autoridade do painel por outra porta (o segredo da CLI, ADR-022).
describe('ação `tools` da CLI: liga a lista inteira de uma vez', () => {
  const post = (params: Record<string, string>) =>
    main().then((m) => JSON.parse(m.doPost({ parameter: { secret: 'f'.repeat(64), ...params } } as never).getContent()));

  beforeEach(() => {
    env.props['CLI_SECRET'] = 'f'.repeat(64);
  });

  test('set=all liga todas as 23 e set=none desliga todas, sem tocar nas pessoas', async () => {
    const m = await main();
    m.setAgentUser('f1', 'ana@x.com', true);
    const tudo = await post({ action: 'tools', set: 'all' });
    expect(tudo.ok).toBe(true);
    expect(tudo.enabled).toHaveLength(23);
    expect(tudo.users).toEqual(['ana@x.com']); // ligar ferramenta não mexe em quem conversa
    const nada = await post({ action: 'tools', set: 'none' });
    expect(nada.enabled).toEqual([]);
    expect(nada.users).toEqual(['ana@x.com']);
  });

  test('lista explícita sai na ordem canônica do registry', async () => {
    const r = await post({ action: 'tools', set: 'gmail.send,now' });
    expect(r.enabled).toEqual(['now', 'gmail.send']);
  });

  test('um nome inválido derruba a chamada inteira: nada é gravado pela metade', async () => {
    await post({ action: 'tools', set: 'now' });
    const r = await post({ action: 'tools', set: 'now,http.get' });
    expect(r.ok).toBe(false);
    expect(access().tools).toEqual(['now']); // o estado anterior continua de pé
  });

  test('sem o segredo da CLI, nada acontece', async () => {
    const m = await main();
    const r = JSON.parse(m.doPost({ parameter: { action: 'tools', set: 'all' } } as never).getContent());
    expect(r.ok).toBe(false);
    expect(access().tools).toEqual([]);
  });

  test('set vazio é recusado (não vira "desliga tudo" por engano)', async () => {
    await post({ action: 'tools', set: 'all' });
    const r = await post({ action: 'tools', set: '' });
    expect(r.ok).toBe(false);
    expect(access().tools).toHaveLength(23);
  });
});

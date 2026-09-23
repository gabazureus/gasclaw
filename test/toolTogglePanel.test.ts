// Borda do liga/desliga por ferramenta: a global que o painel chama (ADR-021).
//
// O que está sendo protegido aqui não é preferência de tela: a lista efetiva de ferramentas é o que separa
// "o agente conversa" de "o agente manda e-mail em seu nome". Por isso: só o dono, só nomes do registry,
// efetivo sempre recalculado do que está GRAVADO (nunca do que o cliente mandou), e trace de toda mudança.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
const main = () => import('../src/main');
const access = () => JSON.parse(env.props['ACCESS:f1']);

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
});
afterEach(() => vi.unstubAllGlobals());

describe('setAgentTool: liga/desliga UMA ferramenta', () => {
  test('quem não é dono não muda nada', async () => {
    env.props['ACCESS:f1'] = '{"users":[],"tools":["now"]}';
    vi.stubGlobal('Session', { ...globalThis.Session, getActiveUser: () => ({ getEmail: () => 'outra@x.com' }), getEffectiveUser: () => ({ getEmail: () => 'dono@x.com' }), getScriptTimeZone: () => 'America/Sao_Paulo' });
    const { setAgentTool } = await main();
    expect(() => setAgentTool('f1', 'gmail.send', true)).toThrow(/Only the gasclaw owner/);
    expect(access().tools).toEqual(['now']);
  });

  test('ligar grava a ferramenta; desligar tira só ela', async () => {
    const { setAgentTool } = await main();
    setAgentTool('f1', 'gmail.read', true);
    setAgentTool('f1', 'gmail.send', true);
    expect(access().tools).toEqual(['gmail.read', 'gmail.send']);
    setAgentTool('f1', 'gmail.send', false);
    expect(access().tools).toEqual(['gmail.read']);
  });

  test('desligar uma do grupo aprovado expande o grupo e preserva as outras (ADR-021: formato igual, conteúdo explícito)', async () => {
    env.props['ACCESS:f1'] = '{"users":["ana@x.com"],"tools":["gmail"]}';
    const { setAgentTool } = await main();
    setAgentTool('f1', 'gmail.send', false);
    expect(access()).toEqual({ users: ['ana@x.com'], tools: ['gmail.search', 'gmail.read', 'gmail.draft'] });
  });

  test('recusa nome fora do registry, e não grava nada (a tela não pode ligar o que o motor não conhece)', async () => {
    env.props['ACCESS:f1'] = '{"users":[],"tools":["now"]}';
    const { setAgentTool } = await main();
    expect(() => setAgentTool('f1', 'http.get', true)).toThrow(/unknown tool/);
    expect(() => setAgentTool('f1', 'gmail', true)).toThrow(/unknown tool/); // grupo não é ferramenta
    expect(access().tools).toEqual(['now']);
  });

  test('o efetivo sai do que está GRAVADO, não do que o cliente mandou junto', async () => {
    env.props['ACCESS:f1'] = '{"users":["ana@x.com"],"tools":["now"]}';
    const { setAgentTool } = await main();
    setAgentTool('f1', 'ask', true);
    expect(access()).toEqual({ users: ['ana@x.com'], tools: ['now', 'ask'] }); // users intactos: mexer em ferramenta não mexe em quem conversa
  });

  test('a mudança fica no trace, como toda mudança de configuração', async () => {
    const { setAgentTool } = await main();
    setAgentTool('f1', 'gmail.send', true);
    expect(Object.keys(env.props).some((k) => k.startsWith('Q:'))).toBe(true);
  });

  test('devolve o estado novo para a tela reconciliar as caixas', async () => {
    const { setAgentTool } = await main();
    const out = setAgentTool('f1', 'memory.read', true);
    expect(out.enabled).toEqual(['memory.read']);
    expect(out.approved).toEqual({ users: [], tools: ['memory.read'] });
  });
});

describe('agentAccess: a tela desenha o catálogo do registry', () => {
  test('traz o catálogo completo e o que está ligado hoje (grupo já expandido)', async () => {
    env.props['ACCESS:f1'] = '{"users":[],"tools":["memory"]}';
    const { agentAccess } = await main();
    const x = agentAccess('f1');
    expect(x.catalog).toHaveLength(26);
    expect(x.enabled).toEqual(['memory.save', 'memory.remove', 'memory.read']);
    expect(x.approved.tools).toEqual(['memory']); // o gravado continua como está até alguém tocar
  });
});

describe('painel: o controle é operável, não só visível', () => {
  const html = () => readFileSync('src/settings.html', 'utf8');

  test('checkbox nativo com label associado (teclado e leitor de tela de graça)', () => {
    const s = html();
    expect(s).toContain("cb.type = 'checkbox'");
    expect(s).toContain('label.htmlFor = cb.id');
    expect(s).toContain('.setAgentTool(');
  });

  test('a regra `input { width: 100% }` não pode transformar a caixinha num campo de 720px', () => {
    expect(html()).toMatch(/input\[type="checkbox"\]\s*\{[^}]*width:\s*auto/);
  });

  test('a tela não interpreta nada como HTML (o nome da ferramenta e a descrição vêm do servidor)', () => {
    expect(html()).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/);
  });
});

// O painel desenha um cabeçalho por GRUPO, e o rótulo vem de um mapa escrito à mão no HTML. Quando um
// grupo novo entra no registry e ninguém lembra do mapa, o `|| g.name` cai e a tela mostra a chave crua
// ("skill", "agent", minúsculas, no meio de "Drive, Docs and Sheets"). Foi o que aconteceu com `skill`.
describe('o painel tem rótulo para TODO grupo do registry', () => {
  test('GROUP_LABEL não deixa grupo nenhum cair no nome cru', async () => {
    const { toolCatalog } = await import('../src/tools/registry');
    const html = readFileSync('src/settings.html', 'utf8');
    const mapa = html.match(/const GROUP_LABEL = \{([^}]*)\}/)![1];
    const rotulados = [...mapa.matchAll(/(?:^|,)\s*(?:'([^']*)'|(\w+))\s*:/g)].map((m) => m[1] ?? m[2]);
    expect(rotulados).toContain('memory'); // controle positivo: o mapa foi mesmo lido
    expect([...new Set(toolCatalog().map((t) => t.group))].filter((g) => !rotulados.includes(g))).toEqual([]);
  });
});

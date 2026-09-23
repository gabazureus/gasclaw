import { readFileSync } from 'node:fs';
// QUEM pode, não só O QUE acontece.
//
// A auditoria por mutação do ciclo 3 achou o maior buraco da suíte: apagar `assertOwner()` de
// `setAgentCapability` e de `passBaton` deixava os 1762 testes VERDES. Os testes provavam o que o ato
// faz — o singleton, a ordem das escritas, o arquivamento — e nunca perguntavam quem pode fazê-lo.
//
// Num projeto onde a pasta do agente é compartilhável e o painel é a autoridade, "quem" é metade do
// desenho. A outra metade estava sem rede.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  env.props['OWNER'] = 'dono@x.com';
  env.props['AGENTS'] = JSON.stringify([
    { name: 'alpha', folderId: 'fa' },
    { name: 'beta', folderId: 'fb' },
  ]);
  env.props['STATUS:fa'] = 'active';
  env.props['STATUS:fb'] = 'active';
});
afterEach(() => vi.unstubAllGlobals());

/** As ações que MUDAM poder. Cada uma tem de recusar quem não é o dono. */
type Motor = Record<string, (...a: unknown[]) => unknown>;
const acoes: [string, (m: Motor) => unknown][] = [
  ['setAgentCapability', (m) => m.setAgentCapability('fa', 'dream', true)],
  ['passBaton', (m) => m.passBaton('fa', 'fb', 5)],
  ['writeSuccessor', (m) => m.writeSuccessor('fa', '')],
  ['successorOptions', (m) => m.successorOptions('fa')],
  ['evaluateSuccessor', (m) => m.evaluateSuccessor('x')],
  ['crownSuccessor', (m) => m.crownSuccessor('x')],
  ['successorHealth', (m) => m.successorHealth('x')],
  ['rebaseSuccessor', (m) => m.rebaseSuccessor('x')],
  ['inheritSuccessor', (m) => m.inheritSuccessor('x')],
  ['chatLink', (m) => m.chatLink()],
  ['syncSuccessor', (m) => m.syncSuccessor('x')],
  ['successionState', (m) => m.successionState()],
  ['writeAutomation', (m) => m.writeAutomation('fa', [])],
  ['automationOptions', (m) => m.automationOptions('fa')],
  ['setAgentSchedule', (m) => m.setAgentSchedule('fa', [])],
  ['setAgentAutoApprove', (m) => m.setAgentAutoApprove('fa', [])],
  ['forgetChild', (m) => m.forgetChild('x')],
  ['removeAgent', (m) => m.removeAgent('fa')],
];

describe('quem NÃO é o dono não muda poder nenhum', () => {
  test.each(acoes)('%s recusa um estranho', async (_nome, chamar) => {
    env.activeUser = 'estranho@x.com';
    const m = (await import('../src/main')) as unknown as Motor;
    expect(() => chamar(m)).toThrow(/owner/i);
  });

  // O TESTE ACIMA NÃO BASTA, e a mutação mostrou: apagar o `assertOwner()` do `setAgentCapability`
  // ainda recusa, porque `agentCapabilities` re-assere no fim. Isso é defesa em profundidade de
  // verdade — mas significa que "lançou" não prova que a guarda DAQUELA função existe.
  //
  // O que prova é o ESTADO: se um estranho não pode mudar poder, a Property não pode ter mudado.
  // Uma função que recusa DEPOIS de gravar recusa tarde demais.
  test('e o estado NÃO muda: recusar depois de gravar é recusar tarde demais', async () => {
    env.activeUser = 'estranho@x.com';
    env.props['CAP:fa'] = JSON.stringify([]);
    env.props['CREATOR'] = 'fb';
    const antes = { cap: env.props['CAP:fa'], creator: env.props['CREATOR'], status: env.props['STATUS:fa'] };
    const m = await import('../src/main');
    for (const tentar of [() => m.setAgentCapability('fa', 'create', true), () => m.passBaton('fa', 'fb', 5)]) {
      try {
        tentar();
      } catch {
        /* a recusa é o esperado; o que importa é o estado abaixo */
      }
    }
    expect(env.props['CAP:fa']).toBe(antes.cap);
    expect(env.props['CREATOR']).toBe(antes.creator);
    expect(env.props['STATUS:fa']).toBe(antes.status);
  });

  // CONTROLE POSITIVO: sem ele, os dez acima ficariam verdes se TODAS as funções lançassem por
  // qualquer motivo — inclusive por um erro que nada tem a ver com autorização.
  test('controle positivo: o DONO consegue', async () => {
    env.activeUser = 'dono@x.com';
    const m = await import('../src/main');
    expect(() => m.setAgentCapability('fa', 'dream', true)).not.toThrow();
    expect(JSON.parse(env.props['CAP:fa'] ?? '[]')).toContain('dream');
  });
});

// D6 — `./gasclaw down` NÃO PARAVA O QUE GASTA DINHEIRO.
//
// Achado rodando, não lendo: com o motor pausado (`enabled: false`), `swarm run` seguiu até o
// OpenRouter. Quem recusou foi a fatura, não a nossa guarda — o gerador teria escrito e implantado
// um projeto com o dono acreditando que tinha parado tudo.
//
// `store.isEnabled()` era lido pela CONVERSA e pelo CICLO DE SONHO, e por mais nada. O `mayAct` — o
// ponto único que governa `dream`, `initiative`, `succeed` e `create` — não o consultava. A chave
// geral parava o que fala e deixava correr o que paga.
describe('a chave de parada do dono vale para TUDO que age sozinho', () => {
  const main = readFileSync('src/main.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const mayAct = main.slice(main.indexOf('function mayAct'), main.indexOf('\n}', main.indexOf('function mayAct')));

  test('`mayAct` consulta a chave geral', () => {
    expect(mayAct).toContain('store.isEnabled()');
  });

  // Antes do STATUS e antes da CAPACIDADE: parado é parado, e o motivo tem que ser esse, não outro.
  // Um agente pausado que recusasse por "succeed is off" mandaria o dono ligar uma capacidade que
  // não é o problema.
  test('a chave vem ANTES de status e capacidade, e diz o motivo certo', () => {
    const iEnabled = mayAct.indexOf('store.isEnabled()');
    const iStatus = mayAct.indexOf('parseStatus(');
    const iCaps = mayAct.indexOf('effectiveCapabilities(');
    expect(iEnabled).toBeGreaterThan(-1);
    expect(iEnabled).toBeLessThan(iStatus);
    expect(iEnabled).toBeLessThan(iCaps);
    expect(mayAct).toMatch(/paused/i);
  });
});

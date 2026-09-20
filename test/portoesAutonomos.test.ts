// Os PORTÕES dos laços autônomos, testados por COMPORTAMENTO (revisão de 2026-09-20).
//
// Estes testes substituem três testes de grep que eu tinha escrito e que não prendiam nada. Um deles
// era tautológico de verdade: `expect(corpo).toContain("'dream'")` numa fatia que COMEÇA em
// `isolado('dream'` é verdadeiro mesmo com o corpo inteiro apagado. Eu tinha construído a prova de um
// defeito de privilégio de um jeito que passava com o conserto removido.
//
// A propriedade certa não é "o símbolo aparece no fonte", é "dado este estado, o motor NÃO age".
// Isso morre se a guarda sumir, se for invertida, se `effectiveCapabilities` virar
// `parseCapabilities`, ou se o retorno for descartado — nenhum grep morre em todos esses casos.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubGas, type GasEnv } from './gasEnv';

let env: GasEnv;
const FOLDER = 'f1';

/** O agente existe, tem agenda vencida e um job às 08:30. O resto é o que cada teste varia. */
function comAgenda(caps: string[], status = 'active', frozen?: string) {
  env.props['AGENTS'] = JSON.stringify([{ name: 'a', folderId: FOLDER }]);
  env.props[`CAP:${FOLDER}`] = JSON.stringify(caps);
  env.props[`STATUS:${FOLDER}`] = status;
  if (frozen !== undefined) env.props['CAPS_ENABLED'] = frozen;
  env.props[`SCHED:${FOLDER}`] = JSON.stringify([{ at: 0, prompt: 'bom dia', days: [] }]);
  env.props[`SCHEDSEEN:${FOLDER}`] = '-1'; // a janela abre em qualquer minuto do dia
}

/**
 * Quantos runs PROATIVOS existem. Conta as Properties E o Drive: o estado do run durável mora no
 * Drive e só o PONTEIRO mora nas Properties (ADR-026). Contar só um dos dois foi o primeiro erro
 * deste arquivo, e o controle positivo é que o pegou — contando errado, tudo dava zero e os testes
 * de portão ficavam verdes sem que nada fosse exercitado.
 */
const runsDespertados = () =>
  JSON.stringify(env.props).split('wake-').length - 1 + [...env.drive.keys()].filter((k) => k.includes('wake-')).length;

beforeEach(() => {
  vi.resetModules();
  env = stubGas();
  env.props['OWNER'] = 'dono@x.com';
});
afterEach(() => vi.unstubAllGlobals());

// CONTROLE POSITIVO, e ele é obrigatório: sem provar que o caminho FUNCIONA quando deve, todo teste
// de portão abaixo passaria vazio — o laço poderia nem estar rodando e eu leria isso como "a guarda
// funcionou". Foi exatamente o que aconteceu na primeira versão deste arquivo: o stub não entendia o
// formato de hora, `minutos` virava NaN, nenhum run nascia, e os seis testes ficavam verdes por
// motivo nenhum. Um teste negativo sem controle positivo não é evidência, é coincidência.
describe('controle positivo: com tudo ligado, o job vencido VIRA run', () => {
  test('a capacidade ligada e o job vencido produzem um run proativo', async () => {
    comAgenda(['initiative']);
    const m = await import('../src/main');
    m.drainRuns();
    expect(runsDespertados()).toBeGreaterThan(0);
  });
});

describe('o despertar só acontece com a capacidade LIGADA', () => {
  test('sem `initiative`, um job vencido NÃO vira run', async () => {
    comAgenda([]); // agenda gravada, capacidade desligada
    const m = await import('../src/main');
    m.drainRuns();
    expect(runsDespertados()).toBe(0);
  });

  test('agente ARQUIVADO não desperta, mesmo com a capacidade ligada', async () => {
    comAgenda(['initiative'], 'archived');
    const m = await import('../src/main');
    m.drainRuns();
    expect(runsDespertados()).toBe(0);
  });

  // A chave de emergência tem de alcançar o que roda SOZINHO — é o que ninguém está olhando.
  test('congelado, não desperta nem com a capacidade aprovada', async () => {
    comAgenda(['initiative'], 'active', 'false');
    const m = await import('../src/main');
    m.drainRuns();
    expect(runsDespertados()).toBe(0);
  });
});

// O DEFEITO QUE A REVISÃO PEGOU, e ele nasceu do conserto anterior: eu tinha posto a checagem de
// capacidade ANTES de o carimbo andar. Com `initiative` desligada, o carimbo congelava e a janela do
// `dueJobs` crescia sozinha — religar depois de dez horas dispararia os jobs dessas dez horas DE UMA
// VEZ. O comentário no código já dizia por que o carimbo tem de andar sempre; a guarda nova o furou.
describe('o carimbo anda mesmo com o portão FECHADO', () => {
  test('desligado, o relógio do agente continua andando', async () => {
    comAgenda([]); // sem `initiative`
    const m = await import('../src/main');
    m.drainRuns();
    const visto = env.props[`SCHEDSEEN:${FOLDER}`];
    expect(visto).toBeDefined();
    // Avançou de '-1' para o minuto atual: não ficou parado esperando a capacidade voltar.
    expect(Number(visto)).toBeGreaterThanOrEqual(0);
  });
});

describe('o laço do sonho respeita os mesmos três portões', () => {
  const semSonho = async (caps: string[], status = 'active', frozen?: string) => {
    comAgenda(caps, status, frozen);
    const m = await import('../src/main');
    m.drainRuns();
    // `DREAMLOCK:` só aparece quando um ciclo começa. Sem capacidade, ele não pode existir.
    return Object.keys(env.props).some((k) => k.startsWith('DREAMLOCK:'));
  };

  test('sem `dream`, nenhum ciclo é tocado', async () => {
    expect(await semSonho([])).toBe(false);
  });

  test('arquivado não sonha — sonhar gastaria cota de quem saiu de cena', async () => {
    expect(await semSonho(['dream'], 'archived')).toBe(false);
  });

  test('congelado não sonha', async () => {
    expect(await semSonho(['dream'], 'active', 'false')).toBe(false);
  });
});

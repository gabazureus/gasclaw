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
  // A ASSERÇÃO ERA `>= 0`, e a mutação provou que isso não vale nada: congelar a escrita no literal
  // '0' — ou seja, o carimbo NUNCA anda, que é exatamente a avalanche que este bloco existe para
  // pegar — deixava tudo verde. `>= 0` é verdadeiro para qualquer constante não negativa.
  //
  // O oráculo certo é IGUALDADE com o minuto de agora: o relógio do agente tem de estar no relógio
  // do mundo, não em algum número.
  test('desligado, o relógio do agente continua andando', async () => {
    comAgenda([]); // sem `initiative`
    const m = await import('../src/main');
    m.drainRuns();
    const agora = new Date();
    const minutoAtual = agora.getUTCHours() * 60 + agora.getUTCMinutes();
    const visto = Number(env.props[`SCHEDSEEN:${FOLDER}`]);
    // Um minuto de folga: o tique pode cair na virada entre a leitura do motor e a do teste.
    expect(Math.abs(visto - minutoAtual)).toBeLessThanOrEqual(1);
  });
  // AUDITORIA 2026-09-21: com a agenda VAZIA o laço pulava o agente antes do carimbo. Limpar a agenda às
  // 08:00 e pôr um job das 12:00 às 15:00 disparava o job na hora — a janela vinha das 08:00.
  test('com a agenda vazia, o relógio do agente também anda', async () => {
    comAgenda(['initiative']);
    env.props[`SCHED:${FOLDER}`] = '[]';
    const m = await import('../src/main');
    m.drainRuns();
    const agora = new Date();
    const minutoAtual = agora.getUTCHours() * 60 + agora.getUTCMinutes();
    expect(Math.abs(Number(env.props[`SCHEDSEEN:${FOLDER}`]) - minutoAtual)).toBeLessThanOrEqual(1);
  });
});

// OS TRÊS TESTES ANTERIORES DESTE BLOCO ERAM VACUAMENTE VERDES, e o revisor provou: apagar a guarda
// inteira deixava os oito passando. A razão era estrutural, não de estado — `tickDream` só AVANÇA um
// ciclo existente, e quem cria `DREAMLOCK:` é `startDream`, que `drainRuns` nunca chama. O oráculo
// "existe algum DREAMLOCK?" era falso em TODO estado possível do stub.
//
// É o mesmo defeito do `toContain("'dream'")` que eu tinha removido, vestido de comportamento — e mais
// difícil de ver, porque o assert PARECE ler estado.
//
// Aqui o ciclo é semeado de verdade (trava + arquivo de estado no Drive do stub), e o oráculo passa a
// ser o que importa: o ciclo AVANÇA (`done` cresce) com a capacidade ligada, e não avança sem ela.
describe('o laço do sonho respeita os mesmos três portões', () => {
  const CICLO = 'c1';

  /** Semeia um ciclo ATIVO: a trava aponta para ele e o estado existe na pasta do agente. */
  function comCiclo(caps: string[], status = 'active', frozen?: string) {
    env.props['AGENTS'] = JSON.stringify([{ name: 'a', folderId: FOLDER }]);
    env.props[`CAP:${FOLDER}`] = JSON.stringify(caps);
    env.props[`STATUS:${FOLDER}`] = status;
    if (frozen !== undefined) env.props['CAPS_ENABLED'] = frozen;
    env.props[`DREAMLOCK:${FOLDER}`] = CICLO;
    const estado = {
      cycleId: CICLO, folderId: FOLDER, incumbent: '# titular', status: 'running',
      plan: { cycleId: CICLO, candidates: ['# candidato'], k: 1, steps: [{ kind: 'gate', candidate: '# candidato', scenario: 'g1', rep: 0 }] },
      tally: {}, done: [], startedAt: 1, updatedAt: 1,
    };
    env.drive.set(`${FOLDER}/.gasclaw/dreams/${CICLO}.json`, JSON.stringify(estado));
  }

  /** Quantos passos o ciclo registrou como feitos. É o que cresce quando o laço age. */
  const passosFeitos = () => {
    const bruto = env.drive.get(`${FOLDER}/.gasclaw/dreams/${CICLO}.json`);
    return bruto ? (JSON.parse(bruto).done as string[]).length : -1;
  };

  // CONTROLE POSITIVO. Sem ele os três negativos abaixo voltam a ser coincidência — foi literalmente
  // a ausência dele que deixou a versão anterior passar com o portão arrancado.
  test('controle positivo: com `dream` ligada, o laço TOCA o ciclo', async () => {
    comCiclo(['dream']);
    const m = await import('../src/main');
    m.drainRuns();
    // Tocar é o que importa: ou avançou um passo, ou falhou o ciclo e soltou a trava. O que NÃO pode
    // acontecer é o estado ficar intocado, que é o caso dos três testes abaixo.
    const mexeu = passosFeitos() > 0 || env.props[`DREAMLOCK:${FOLDER}`] === undefined || (env.drive.get(`${FOLDER}/.gasclaw/dreams/${CICLO}.json`) ?? '').includes('failed');
    expect(mexeu).toBe(true);
  });

  const naoToca = async (caps: string[], status = 'active', frozen?: string) => {
    comCiclo(caps, status, frozen);
    const antes = env.drive.get(`${FOLDER}/.gasclaw/dreams/${CICLO}.json`);
    const m = await import('../src/main');
    m.drainRuns();
    // Intocado: nem o estado mudou, nem a trava saiu.
    return env.drive.get(`${FOLDER}/.gasclaw/dreams/${CICLO}.json`) === antes && env.props[`DREAMLOCK:${FOLDER}`] === CICLO;
  };

  test('sem `dream`, o ciclo fica intocado', async () => {
    expect(await naoToca([])).toBe(true);
  });

  test('arquivado não sonha — sonhar gastaria cota de quem saiu de cena', async () => {
    expect(await naoToca(['dream'], 'archived')).toBe(true);
  });

  test('congelado não sonha', async () => {
    expect(await naoToca(['dream'], 'active', 'false')).toBe(true);
  });
});

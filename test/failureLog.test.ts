// O contador de falhas: o combustível determinístico do aglomerado.
//
// A P25 mediu o trace e achou ZERO falhas agrupáveis — 86 requisições, 100% evals. Não era agrupamento
// mal desenhado: não havia o que agrupar. A decisão do dono foi instrumentar primeiro e deixar acumular,
// e é isso que este módulo faz. O criador de agentes nasce quando houver dado, não antes.
//
// Por que aqui e não na planilha: a D3 diz que a planilha é ESPELHO, e nada lido dela decide. Um agente
// que escrevesse na planilha e depois a lesse para justificar criar outro agente teria caneta sobre a
// própria decisão.
import { describe, expect, test } from 'vitest';
import { countByKind, failProp, failuresFrom, parseFailures, serializeFailures, withFailure } from '../src/failureLog';
import type { Failure } from '../src/dreamCycle';

const AGORA = 1_700_000_000_000;
const DIA = 24 * 3600_000;
const f = (o: Partial<Failure> = {}): Failure => ({ at: AGORA, kind: 'refused_tool', tool: 'gmail.send', ...o });

describe('parse: ilegível é "não há falha", nunca falha inventada', () => {
  test('JSON quebrado, nulo e não-lista devolvem vazio sem lançar', () => {
    for (const ruim of ['{quebrado', null, undefined, '{"a":1}', '42']) expect(parseFailures(ruim)).toEqual([]);
  });

  test('linha com tipo desconhecido é descartada, e o resto sobrevive', () => {
    const raw = JSON.stringify([[AGORA, 'refused_tool', 'x'], [AGORA, 'inventado', 'y'], [AGORA, 'no_answer', '']]);
    expect(parseFailures(raw).map((x) => x.kind)).toEqual(['refused_tool', 'no_answer']);
  });

  test('ferramenta vazia não vira campo — `tool` ausente é diferente de `tool: ""`', () => {
    expect(parseFailures(JSON.stringify([[AGORA, 'no_answer', '']]))[0]).toEqual({ at: AGORA, kind: 'no_answer' });
  });
});

describe('poda: idade antes de quantidade', () => {
  // Sem esta ordem, um agente muito usado perderia falhas RECENTES para manter falhas velhas — e o
  // aglomerado leria um passado que não existe mais.
  test('falha com mais de 90 dias sai, mesmo havendo espaço de sobra', () => {
    const velha = f({ at: AGORA - 91 * DIA });
    expect(withFailure([velha], f(), AGORA)).toHaveLength(1);
  });

  test('falha no futuro é recusada — relógio torto não vira evidência', () => {
    expect(withFailure([f({ at: AGORA + DIA })], f(), AGORA)).toHaveLength(1);
  });

  test('passado do teto, as MAIS ANTIGAS saem e as recentes ficam', () => {
    const muitas = Array.from({ length: 300 }, (_, i) => f({ at: AGORA - (300 - i) * 1000 }));
    const r = withFailure(muitas, f({ at: AGORA, tool: 'nova' }), AGORA);
    expect(r).toHaveLength(300);
    expect(r[r.length - 1].tool).toBe('nova');
  });
});

describe('serialização: cabe na Property, ou corta — nunca lança', () => {
  test('ida e volta preserva o que importa', () => {
    expect(parseFailures(serializeFailures([f()]))).toEqual([f()]);
  });

  // A lição do saveAgents: estouro lançava exceção crua e quebrava o painel. Aqui corta pela metade.
  test('conteúdo grande demais é cortado, e o resultado continua legível', () => {
    const gordas = Array.from({ length: 300 }, () => f({ tool: 'x'.repeat(60) }));
    const json = serializeFailures(gordas);
    expect(json.length).toBeLessThan(9000);
    expect(parseFailures(json).length).toBeGreaterThan(0);
  });

  // Objeto com chaves passaria de 20 KB com 300 entradas e estouraria o valor de 9 KB.
  test('a forma é compacta: array posicional, não objeto com chaves', () => {
    expect(serializeFailures([f()])).toBe(`[[${AGORA},"refused_tool","gmail.send"]]`);
  });
});

test('a chave é por agente: um agente não lê a contagem do outro', () => {
  expect(failProp('f1')).toBe('FAIL:f1');
  expect(failProp('f1')).not.toBe(failProp('f2'));
});

test('contagem por tipo, para a tela', () => {
  expect(countByKind([f(), f(), f({ kind: 'no_answer' })])).toEqual({ refused_tool: 2, no_answer: 1 });
});

// ---------- O que a auditoria de 2026-09-20 encontrou ----------
//
// `recordFailure` existia, tinha teste verde e NINGUÉM o chamava: zero call sites no motor inteiro.
// Eu vinha lendo o trace vazio como "falta uso real do agente". Não era: o contador nunca foi ligado.
// Estes testes existem para que a leitura de um turno em falha vire contagem, e para que a contagem
// seja do TAMANHO do problema — não do número de vezes que o modelo insistiu nele.
describe('failuresFrom: o turno que acabou mal vira contagem', () => {
  const now = 1_700_000_000_000;

  test('turno limpo não conta nada', () => {
    expect(failuresFrom({ events: [{ name: 'now', status: 'ok' }], text: 'pronto' }, now)).toEqual([]);
  });

  test.each([
    ['refused', 'refused_tool'],
    ['denied', 'denied'],
    ['error', 'tool_error'],
  ])('status %s vira %s, com o nome da ferramenta', (status, kind) => {
    const r = failuresFrom({ events: [{ name: 'calendar.list', status }], text: 'x' }, now);
    expect(r).toEqual([{ at: now, kind, tool: 'calendar.list' }]);
  });

  // Um turno que gastou os passos é UM problema, não um por passo.
  test('limite de passos vira uma falha sem ferramenta', () => {
    const r = failuresFrom({ events: [], text: 'Parei', stopped: 'steps' }, now);
    expect(r).toEqual([{ at: now, kind: 'step_limit' }]);
  });

  test('prazo estourado NÃO é step_limit: são causas diferentes', () => {
    expect(failuresFrom({ events: [], text: 'x', stopped: 'deadline' }, now)).toEqual([]);
  });

  test('turno sem resposta conta como no_answer', () => {
    expect(failuresFrom({ events: [], text: '   ' }, now)).toEqual([{ at: now, kind: 'no_answer' }]);
  });

  // A DECISÃO que vale o teste: o modelo insistindo cinco vezes na mesma ferramenta recusada é UM
  // problema. Contar cinco inflaria o aglomerado a partir de um único run, e o limiar de 3 viraria
  // ruído — um agente teimoso pareceria um agente com um problema crônico.
  test('a mesma (falha, ferramenta) repetida no turno conta UMA vez', () => {
    const eventos = [
      { name: 'gmail.send', status: 'refused' },
      { name: 'gmail.send', status: 'refused' },
      { name: 'gmail.send', status: 'refused' },
    ];
    expect(failuresFrom({ events: eventos, text: 'x' }, now)).toEqual([{ at: now, kind: 'refused_tool', tool: 'gmail.send' }]);
  });

  test('ferramentas diferentes com a mesma falha contam separado', () => {
    const r = failuresFrom({ events: [{ name: 'a', status: 'refused' }, { name: 'b', status: 'refused' }], text: 'x' }, now);
    expect(r).toHaveLength(2);
  });

  // `pending` e `approved` não são falha: um é espera pelo dono, o outro é sucesso COM clique.
  test.each(['pending', 'approved', 'ok'])('status %s não conta como falha', (status) => {
    expect(failuresFrom({ events: [{ name: 'x', status }], text: 'ok' }, now)).toEqual([]);
  });
});

// A auditoria de 2026-09-20 derrubou cinco itens com UM critério: algum módulo importa isto, e o
// símbolo aparece no bundle? Global exportado não é fiação. Este teste faz esse critério valer para o
// item 24, para que ele não possa regredir em silêncio de novo.
describe('o contador está LIGADO, não só exportado', () => {
  test('o passo do run durável conta as falhas do turno', async () => {
    const main = (await import('node:fs')).readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('countTurnFailures(r.folderId, turn)');
    // Só quando não está pendente: um run esperando o clique do dono não falhou, está esperando.
    expect(main).toContain('if (!turn.pending) countTurnFailures');
    expect(main).toMatch(/import \{[^}]*failuresFrom[^}]*\} from '\.\/failureLog'/);
  });

  // Contar eval como falha do agente encheria o aglomerado de runs de TESTE, e o ciclo de sonho
  // passaria a consertar problemas que só existem na bancada.
  test('o caminho de eval NÃO alimenta o contador', async () => {
    const evalEntry = (await import('node:fs')).readFileSync('src/evalEntry.ts', 'utf8');
    expect(evalEntry).not.toContain('recordFailure');
    expect(evalEntry).not.toContain('failuresFrom');
  });
});

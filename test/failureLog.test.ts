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
import { countByKind, failProp, parseFailures, serializeFailures, withFailure } from '../src/failureLog';
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

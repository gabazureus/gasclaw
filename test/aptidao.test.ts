// P31 — D2: não existia aptidão para código. A linhagem gravava `delta: null` sempre.
//
// O CONTRATO PEDIDO ESTAVA ERRADO, e o erro é o que esta suíte existe para impedir de voltar. O pedido
// era: "`doGet` devolve `{ ok, score }`, o motor extrai `score`". Isso deixa o AVALIADO DAR A PRÓPRIA
// NOTA — o gerador pode escrever `return {ok:true, score:100}` e vencer toda comparação. É o laço
// auto-avaliado que `judgeSet.ts` já cita como medido e reprovado (arXiv:2310.01798).
//
// O contrato certo: o filho recebe uma ENTRADA e devolve a SAÍDA dele. Quem compara com o esperado é
// o MOTOR, e o esperado nunca atravessa a rede até o filho.
//
// Três regras de medição, cada uma com teste:
// 1. filho inalcançável ou não autorizado → corrida NÃO MEDIDA (`null`), nunca "k falhas";
// 2. filho alcançável que responde lixo → aquele caso FALHOU. Se lixo virasse `null`, um filho
//    quebrado escaparia da comparação em vez de perdê-la — viés de seleção a favor do defeito;
// 3. 0 de k MEDIDO é zero honesto; zero sem medição é mentira. É a regra de `passRate`.
import { describe, expect, test } from 'vitest';
import { codeDelta, judgeCase, parseBattery, scoreRun, type Case, type RunScore } from '../src/fitness';

const caso: Case = { input: '2+2', expected: '4' };
const json = (o: unknown) => JSON.stringify(o);

describe('judgeCase: o motor julga, o filho só responde', () => {
  test('saída igual ao esperado passa', () => {
    expect(judgeCase(caso, 200, json({ output: '4' })).verdict).toBe(true);
  });

  test('espaço em volta não reprova uma saída certa', () => {
    expect(judgeCase(caso, 200, json({ output: '  4\n' })).verdict).toBe(true);
  });

  test('saída diferente falha', () => {
    expect(judgeCase(caso, 200, json({ output: '5' })).verdict).toBe(false);
  });

  // O TESTE QUE IMPEDE O CONTRATO ERRADO DE VOLTAR. Um filho que declara a própria vitória não ganha
  // nada: `ok` e `score` não são lidos. Só `output` conta, e só contra o esperado do MOTOR.
  test('o filho que dá a própria nota NÃO passa: `ok` e `score` são ignorados', () => {
    expect(judgeCase(caso, 200, json({ ok: true, score: 100 })).verdict).toBe(false);
    expect(judgeCase(caso, 200, json({ ok: true, score: 100, output: '5' })).verdict).toBe(false);
  });

  // Regra 2: alcançável e fora do contrato é FALHA do código, não ausência de medição.
  test('filho alcançável que responde lixo FALHOU o caso — não escapa da comparação', () => {
    for (const lixo of ['não é json', json({ saida: '4' }), json({ output: 4 }), '<html>Error: TypeError</html>']) {
      expect(judgeCase(caso, 200, lixo).verdict).toBe(false);
    }
  });

  test('o filho quebrou (500) → falhou o caso', () => {
    expect(judgeCase(caso, 500, 'Internal error').verdict).toBe(false);
  });

  // Regra 1: sem autorização ninguém mediu nada. Chamar isso de falha puniria o filho pelo clique
  // que o DONO ainda não deu.
  test('tela de consentimento → sem veredito, não falha', () => {
    const r = judgeCase(caso, 200, '<html>Authorization needed</html>');
    expect(r.verdict).toBeNull();
    expect(r.reason).toMatch(/not authorized/i);
  });

  test('página de login → sem veredito', () => {
    expect(judgeCase(caso, 200, '<html><title>Sign in - Google Accounts</title>accounts.google.com</html>').verdict).toBeNull();
  });

  test('sem resposta nenhuma → sem veredito', () => {
    expect(judgeCase(caso, null, null).verdict).toBeNull();
  });
});

describe('scoreRun: k casos viram passes/k, ou não viram nada', () => {
  const v = (verdict: boolean | null, reason = '') => ({ verdict, reason });

  test('conta os passes sobre k', () => {
    expect(scoreRun([v(true), v(false), v(true)])).toEqual({ measured: true, passes: 2, k: 3 });
  });

  // Regra 3: zero MEDIDO é zero honesto.
  test('0 de k medido é uma nota, não ausência', () => {
    expect(scoreRun([v(false), v(false)])).toEqual({ measured: true, passes: 0, k: 2 });
  });

  // Uma corrida parcial não se compara: os casos não medidos enviesariam passes/k para qualquer lado.
  test('um único caso sem veredito torna a corrida inteira NÃO MEDIDA, com o motivo dele', () => {
    const r = scoreRun([v(true), v(null, 'the child is not authorized yet'), v(true)]);
    expect(r.measured).toBe(false);
    if (!r.measured) expect(r.reason).toMatch(/not authorized/);
  });

  test('nenhum caso é corrida não medida, nunca 0 de 0', () => {
    expect(scoreRun([]).measured).toBe(false);
  });
});

describe('codeDelta: contra o irmão anterior, e `beatsIncumbent` decide', () => {
  const m = (passes: number, k: number): RunScore => ({ measured: true, passes, k });
  const nao: RunScore = { measured: false, reason: 'the child is not authorized yet' };

  // O TESTE DA MUTAÇÃO QUE O GOAL EXIGE: trocar o `null` por `0` tem que morrer aqui.
  test('candidato não medido → delta NULO com motivo, NUNCA zero', () => {
    const r = codeDelta(nao, m(10, 17));
    expect(r.delta).toBeNull();
    expect(r.delta).not.toBe(0);
    expect(r.wins).toBe(false);
    expect(r.reason).toMatch(/not authorized/);
  });

  test('o primeiro filho não tem a quem se comparar: delta nulo, mas a nota dele fica', () => {
    const r = codeDelta(m(9, 17), null);
    expect(r.delta).toBeNull();
    expect(r.reason).toMatch(/nothing to compare/i);
  });

  test('titular não medido também não vira zero do lado de lá', () => {
    expect(codeDelta(m(9, 17), nao).delta).toBeNull();
  });

  test('delta é a diferença das taxas, e `wins` vem do teste de proporções', () => {
    const r = codeDelta(m(17, 17), m(5, 17));
    expect(r.delta).toBeCloseTo(12 / 17, 10);
    expect(r.wins).toBe(true); // 17/17 contra 5/17 é significativo a 95%
  });

  // Uma diferença pequena pode ser ruído. `wins` é o teste que separa as duas coisas — é por isso
  // que o sucessor não é promovido por "o número subiu".
  test('delta positivo que não passa no teste NÃO vence', () => {
    const r = codeDelta(m(10, 17), m(9, 17));
    expect(r.delta).toBeGreaterThan(0);
    expect(r.wins).toBe(false);
  });

  test('baterias de tamanhos diferentes não se comparam', () => {
    const r = codeDelta(m(9, 17), m(9, 10));
    expect(r.delta).toBeNull();
    expect(r.reason).toMatch(/different/i);
  });
});

describe('parseBattery: a bateria vem do dono, e lixo não vira bateria', () => {
  test('uma lista de casos válida é lida', () => {
    expect(parseBattery(json([{ input: 'a', expected: 'A' }, { input: 'b', expected: 'B' }]))).toHaveLength(2);
  });

  // Fail-closed: sem bateria declarada não há aptidão, e a linhagem diz isso em vez de inventar.
  test('ausente, ilegível ou vazia → null, não lista vazia que "passa"', () => {
    for (const bruto of [null, '', 'não é json', '{}', '[]', json([{ input: 'a' }])]) expect(parseBattery(bruto)).toBeNull();
  });

  test('um caso sem esperado invalida a bateria inteira: meia bateria mede metade do que diz', () => {
    expect(parseBattery(json([{ input: 'a', expected: 'A' }, { input: 'b' }]))).toBeNull();
  });
});

// O ELO COM A LINHAGEM. Para o filho N+1 se comparar com o N, a nota do N precisa estar gravada — e
// a linhagem só tinha `delta`. Sem `passes`/`k` na entrada, cada medição começaria do zero e
// `codeDelta` nunca teria um titular medido: todo delta seria nulo para sempre.
import { forgetAgentProps, type LineageEntry } from '../src/agentCaps';
import { previousScore, withMeasurement } from '../src/fitness';

const ent = (o: Partial<LineageEntry>): LineageEntry => ({ at: 0, kind: 'codegen', parent: 'pai', child: 'c', generation: 1, delta: null, costUsd: 0, summary: '', ...o });

describe('previousScore: a nota do irmão ANTERIOR, e só dele', () => {
  test('o primeiro filho não tem anterior', () => {
    expect(previousScore([ent({ child: 'c1', at: 10 })], 'pai', 'c1')).toBeNull();
  });

  test('o anterior medido devolve a nota dele', () => {
    const l = [ent({ child: 'c1', at: 10, passes: 9, k: 17 }), ent({ child: 'c2', at: 20 })];
    expect(previousScore(l, 'pai', 'c2')).toEqual({ measured: true, passes: 9, k: 17 });
  });

  // Anterior que existe e nunca foi medido NÃO é "nota zero". É o mesmo erro, do outro lado.
  test('anterior que nunca foi medido é NÃO MEDIDO, não zero', () => {
    const r = previousScore([ent({ child: 'c1', at: 10 }), ent({ child: 'c2', at: 20 })], 'pai', 'c2');
    expect(r?.measured).toBe(false);
  });

  test('é o IMEDIATAMENTE anterior pelo carimbo, não o primeiro da lista', () => {
    const l = [ent({ child: 'c3', at: 30 }), ent({ child: 'c1', at: 10, passes: 1, k: 17 }), ent({ child: 'c2', at: 20, passes: 5, k: 17 })];
    expect(previousScore(l, 'pai', 'c3')).toEqual({ measured: true, passes: 5, k: 17 });
  });

  test('filho de outra linhagem não conta', () => {
    const l = [ent({ child: 'x', parent: 'outro', at: 10, passes: 17, k: 17 }), ent({ child: 'c2', at: 20 })];
    expect(previousScore(l, 'pai', 'c2')).toBeNull();
  });
});

describe('withMeasurement: grava a medição na entrada certa, e só nela', () => {
  test('medido: grava delta, passes e k', () => {
    const l = withMeasurement([ent({ child: 'c1' }), ent({ child: 'c2' })], 'c2', { delta: 0.2, wins: false, reason: '' }, { measured: true, passes: 12, k: 17 });
    expect(l[1]).toMatchObject({ delta: 0.2, passes: 12, k: 17 });
    expect(l[0].passes).toBeUndefined(); // o vizinho não foi tocado
  });

  // Não medido não apaga uma nota que já existia: uma segunda tentativa que falhou por rede não pode
  // desfazer a medição boa da primeira.
  test('não medido NÃO apaga a nota que já estava lá', () => {
    const l = withMeasurement([ent({ child: 'c1', passes: 9, k: 17, delta: 0.1 })], 'c1', { delta: null, wins: false, reason: 'network' }, { measured: false, reason: 'network' });
    expect(l[0]).toMatchObject({ passes: 9, k: 17, delta: 0.1 });
  });

  test('filho desconhecido não muda nada', () => {
    const antes = [ent({ child: 'c1' })];
    expect(withMeasurement(antes, 'nao-existe', { delta: 1, wins: true, reason: '' }, { measured: true, passes: 1, k: 1 })).toEqual(antes);
  });
});

// A bateria mora em `BATTERY:<pasta>`. Apagar o agente tem que apagar a bateria junto — senão recriar
// uma pasta com o mesmo id devolveria a prova antiga, a mesma classe do §C da ADR-040.
test('forgetAgentProps leva a bateria junto com o agente', () => {
  const apagadas = forgetAgentProps(['BATTERY:f1', 'BATTERY:f2', 'CAP:f1'], 'f1');
  expect(apagadas).toContain('BATTERY:f1');
  expect(apagadas).not.toContain('BATTERY:f2');
});

// A FIAÇÃO. `judgeCase`, `scoreRun` e `codeDelta` provados e não chamados seriam a sétima peça pronta
// que ninguém ligou — o padrão que esta auditoria já pegou seis vezes.
import { readFileSync } from 'node:fs';

describe('fiação: a medição existe, é do dono, e a bateria nunca vem da pasta', () => {
  const main = readFileSync('src/main.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const bloco = (nome: string) => main.slice(main.indexOf(`export function ${nome}`), main.indexOf('\nexport function', main.indexOf(`export function ${nome}`) + 10));

  test('medir e declarar a bateria exigem o dono', () => {
    expect(bloco('measureChild')).toContain('assertOwner()');
    expect(bloco('setAgentBattery')).toContain('assertOwner()');
  });

  test('a medição passa pelo núcleo inteiro e grava na linhagem', () => {
    const m = bloco('measureChild');
    for (const s of ['judgeCase(', 'scoreRun(', 'codeDelta(', 'previousScore(', 'withMeasurement(']) expect(m).toContain(s);
  });

  // ADR-002: a bateria é a PROVA. Quem escrevesse a pasta escreveria a prova que o filho vai fazer.
  test('a bateria vem da Script Property, nunca do Drive', () => {
    const m = bloco('measureChild');
    expect(m).toContain('props.getProperty(batteryProp(');
    expect(m).not.toMatch(/DriveApp|getFolderById|readRole|loadAgent/);
  });

  // PORTÃO H5, FAIL-CLOSED. Sem bateria do dono não existe "melhor", e uma bateria padrão aqui seria o
  // motor decidindo o objetivo — exatamente o que o portão impede. Esta asserção faltava: a mutação
  // `parseBattery(...) ?? [casoInventado]` sobrevivia a todos os testes (M2).
  test('sem bateria declarada, NÃO mede — e não inventa uma bateria padrão', () => {
    const m = bloco('measureChild');
    expect(m).not.toMatch(/parseBattery\([^;]*\)\s*\?\?/);
    expect(m).not.toMatch(/parseBattery\([^;]*\)\s*\|\|/);
    expect(m).toMatch(/if \(!bateria\) return naoMedido\(/);
  });

  // O ESPERADO NUNCA ATRAVESSA A REDE. Se a URL levasse o `expected`, o filho poderia simplesmente
  // devolvê-lo — e a correção do contrato inteira voltaria a ser auto-avaliação por outro caminho.
  test('só a ENTRADA vai na URL do filho — o esperado fica no motor', () => {
    const m = bloco('measureChild');
    expect(m).toMatch(/input=\$\{encodeURIComponent\(c\.input\)\}/);
    expect(m).not.toMatch(/expected\s*\)?\s*\}|c\.expected/);
  });
});

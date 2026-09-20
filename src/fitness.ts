// A aptidão de um filho de CÓDIGO (P31, D2). NÚCLEO PURO.
//
// Até aqui a linhagem gravava `delta: null` SEMPRE, com o comentário honesto "nada foi medido ainda".
// Sem aptidão não há o que selecionar: a F6 geraria filhos e não saberia dizer se algum é melhor.
//
// O CONTRATO PEDIDO ESTAVA ERRADO, e a correção é o ponto central deste arquivo. O pedido era:
// "`doGet` devolve `{ ok, score }`, o motor extrai `score`". Isso deixa o AVALIADO DAR A PRÓPRIA NOTA:
// o gerador pode escrever `return {ok:true, score:100}` e vencer toda comparação, sem fazer nada.
// É o laço auto-avaliado que `judgeSet.ts` já cita como medido e reprovado (arXiv:2310.01798).
//
// O contrato daqui: o filho recebe uma ENTRADA e devolve a SAÍDA dele (`{ output }`). Quem compara
// com o esperado é o MOTOR — e o esperado nunca atravessa a rede até o filho.
//
// A UNIDADE DE MEDIDA muda em relação ao ciclo de sonho, e é preciso dizer por quê. Lá, k = 17
// REPETIÇÕES do mesmo cenário, porque o agente é estocástico (P23: 0,4,4,0). Código gerado é
// DETERMINÍSTICO: rodar 17 vezes dá 17 vezes a mesma resposta, e um teste de proporções sobre isso
// não mede nada. Aqui k é o número de CASOS DISTINTOS da bateria. `beatsIncumbent` continua valendo,
// porque continua sendo passes/k — mas o k significa outra coisa.
import type { LineageEntry } from './agentCaps';
import { beatsIncumbent, passRate } from './dream';

/** Um caso da bateria. O `expected` fica no motor: só o `input` vai até o filho. */
export type Case = { input: string; expected: string };

/** `null` = sem veredito. Não é falha: é ausência de medição, e as duas coisas não se somam. */
export type CaseVerdict = boolean | null;

const NAO_AUTORIZADO = /Authorization needed|auth-required|enable_granular_consent/i;
const LOGIN = /accounts\.google\.com|ServiceLogin|<title>[^<]*Sign in|identifier_?next/i;

/**
 * O motor julga um caso a partir do que o filho respondeu.
 *
 * Três saídas, e a distinção entre as duas últimas é o que mantém a seleção honesta:
 *
 * - **`true`** — a saída do filho é o esperado.
 * - **`false`** — o filho RESPONDEU e errou, quebrou, ou fugiu do contrato. Se lixo virasse `null`,
 *   um filho quebrado ESCAPARIA da comparação em vez de perdê-la: viés de seleção a favor do defeito.
 * - **`null`** — ninguém mediu nada: sem resposta, ou o filho ainda não foi autorizado. Chamar isso de
 *   falha puniria o filho pelo clique que o DONO ainda não deu.
 *
 * `ok` e `score` na resposta **não são lidos**. É deliberado: são exatamente os campos pelos quais o
 * contrato errado deixaria o filho dar a própria nota.
 */
export function judgeCase(c: Case, code: number | null, body: string | null): { verdict: CaseVerdict; reason: string } {
  if (code === null || body === null) return { verdict: null, reason: 'the child did not answer' };
  if (NAO_AUTORIZADO.test(body)) return { verdict: null, reason: 'the child is not authorized yet: the owner has to click once' };
  if (LOGIN.test(body)) return { verdict: null, reason: 'the request was not authenticated: this measures nothing about the child' };
  if (code !== 200) return { verdict: false, reason: `the child failed with HTTP ${code}` };
  let output: unknown;
  try {
    output = (JSON.parse(body) as { output?: unknown }).output;
  } catch {
    return { verdict: false, reason: 'the child answered something that is not JSON' };
  }
  if (typeof output !== 'string') return { verdict: false, reason: 'the child did not return an `output` string: it broke the contract' };
  return output.trim() === c.expected.trim() ? { verdict: true, reason: '' } : { verdict: false, reason: 'wrong output' };
}

export type RunScore = { measured: true; passes: number; k: number } | { measured: false; reason: string };

/**
 * k vereditos viram passes/k — ou não viram nada.
 *
 * **Um único caso sem veredito torna a corrida inteira não medida.** Uma corrida parcial não se
 * compara com uma completa: os casos que faltam enviesariam passes/k para qualquer lado, e o viés
 * seria invisível no número final.
 *
 * 0 de k MEDIDO é zero honesto — é uma nota. Zero sem medição seria mentira. É a regra de `passRate`.
 */
export function scoreRun(verdicts: readonly { verdict: CaseVerdict; reason: string }[]): RunScore {
  const v = verdicts ?? [];
  if (!v.length) return { measured: false, reason: 'no case was run' };
  const semVeredito = v.find((x) => x.verdict === null);
  if (semVeredito) return { measured: false, reason: semVeredito.reason || 'a case had no verdict' };
  return { measured: true, passes: v.filter((x) => x.verdict === true).length, k: v.length };
}

/**
 * O delta contra o irmão anterior, e a decisão que importa: `wins`.
 *
 * `delta` é a diferença das taxas, para a tela mostrar. **Quem decide é `beatsIncumbent`**, o teste
 * de proporções que já existe: um delta positivo pequeno pode ser ruído, e é por isso que o sucessor
 * não é promovido porque "o número subiu".
 *
 * `null`, nunca 0, sempre que um dos dois lados não foi medido — com o motivo, para o trace dizer
 * por que não há número em vez de deixar a tela parecer quebrada.
 */
export function codeDelta(candidate: RunScore, incumbent: RunScore | null): { delta: number | null; wins: boolean; reason: string } {
  if (!candidate.measured) return { delta: null, wins: false, reason: candidate.reason };
  if (!incumbent) return { delta: null, wins: false, reason: 'nothing to compare against: this is the first measured child of its line' };
  if (!incumbent.measured) return { delta: null, wins: false, reason: `the previous child was not measured: ${incumbent.reason}` };
  if (candidate.k !== incumbent.k) return { delta: null, wins: false, reason: `different batteries (${candidate.k} vs ${incumbent.k} cases): the rates are not comparable` };
  const c = passRate(candidate.passes, candidate.k);
  const i = passRate(incumbent.passes, incumbent.k);
  if (c === null || i === null) return { delta: null, wins: false, reason: 'no case was run' };
  return { delta: c - i, wins: beatsIncumbent(candidate.passes, incumbent.passes, candidate.k), reason: '' };
}

/**
 * A bateria, lida de onde o DONO a declarou (Script Property — o painel decide, ADR-021).
 *
 * **Nunca da pasta do Drive** (ADR-002: compartilhável, logo não confiável — quem editasse a pasta
 * escreveria a prova que o filho vai fazer) **e nunca do gerador** (auto-avaliação: o modelo que
 * escreve o código não pode escrever o teste que o julga).
 *
 * Fail-closed: ausente, ilegível, vazia, ou com UM caso incompleto → `null`. Meia bateria mediria
 * metade do que diz medir, e ninguém veria a diferença no número.
 */
export function parseBattery(raw: string | null | undefined): Case[] | null {
  try {
    const arr = JSON.parse(String(raw ?? '')) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const casos: Case[] = [];
    for (const x of arr) {
      const o = x as Record<string, unknown>;
      if (!o || typeof o.input !== 'string' || typeof o.expected !== 'string') return null;
      casos.push({ input: o.input, expected: o.expected });
    }
    return casos;
  } catch {
    return null;
  }
}

// ---------- O elo com a linhagem ----------

const meusFilhos = (entries: readonly LineageEntry[], parent: string) =>
  (entries ?? []).filter((e) => e && e.kind === 'codegen' && e.parent === parent && Number.isFinite(e.at)).sort((a, b) => a.at - b.at);

/**
 * A nota do irmão IMEDIATAMENTE anterior, pelo carimbo.
 *
 * `null` quando não há anterior (é o primeiro da linhagem). **Não medido** — e não zero — quando o
 * anterior existe mas nunca teve nota: tratá-lo como zero faria qualquer filho medido "vencer" um
 * irmão que simplesmente não foi autorizado ainda.
 */
export function previousScore(entries: readonly LineageEntry[], parent: string, child: string): RunScore | null {
  const lista = meusFilhos(entries, parent);
  const i = lista.findIndex((e) => e.child === child);
  if (i <= 0) return null;
  const ant = lista[i - 1];
  return Number.isInteger(ant.passes) && Number.isInteger(ant.k) && (ant.k as number) > 0
    ? { measured: true, passes: ant.passes as number, k: ant.k as number }
    : { measured: false, reason: 'the previous child was never measured' };
}

/**
 * Grava a medição na entrada do filho, e só nela.
 *
 * **Uma medição que falhou não apaga uma que deu certo.** Se a segunda tentativa cair por rede, a
 * nota da primeira fica: desfazê-la trocaria um número medido por um nulo sem motivo nenhum.
 */
export function withMeasurement(entries: readonly LineageEntry[], child: string, d: { delta: number | null; wins: boolean; reason: string }, score: RunScore): LineageEntry[] {
  return (entries ?? []).map((e) => {
    if (e.child !== child || e.kind !== 'codegen') return e;
    if (!score.measured) return e;
    return { ...e, delta: d.delta, passes: score.passes, k: score.k };
  });
}

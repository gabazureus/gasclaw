// P29 — o núcleo puro da sonda do enxame (F6). NÚCLEO PURO.
//
// A pergunta desta POC é sobre a PLATAFORMA, não sobre o modelo: quantos projetos filhos o dia
// aceita, e quanto custa em tempo de parede o clique de consentimento que a P24 mediu como
// obrigatório. Por isso ela NÃO chama o Opus — o código do filho é uma string fixa, e o custo é US$ 0.
//
// O que mora aqui é a LEITURA dos números, separada da casca de propósito. A parte que erra nestas
// sondas nunca é o HTTP: é a interpretação. A P24 quase reprovou um desenho correto porque confundiu
// "não consegui ler" com "li e não há escopo", e é a mesma confusão que a linhagem evita com
// `delta: null`. Aqui ela aparece em dois lugares, e os dois têm teste: uma rajada sem filho nenhum
// não tem "o mais lento", e um consentimento que ninguém deu não tem mediana zero.

/**
 * Teto de criações da sonda. **Não é o teto do Google — é o nosso, e é deliberado.**
 *
 * A pergunta que decide a corrida é "15 cabem?", e 20 responde isso com margem. Descobrir o teto
 * ABSOLUTO exigiria criar até o Google recusar, e cada projeto criado fica na conta do dono até ele
 * apagar **um por um**: a resposta custaria a ele uma limpeza manual que a pergunta não exige.
 * Quando a sonda chega aqui sem recusa, o resultado diz *teto não alcançado* — que é honesto — em
 * vez de fingir que 20 é o limite.
 */
export const P29_MAX_CREATES = 20;

/** O alvo da corrida (spec da F6). Fica aqui para a leitura poder compará-lo sem importar a casca. */
export const SWARM_TARGET = 15;

// ---------- C1: a rajada ----------

export type BurstRow = { scriptId: string | null; code: number; ms: number };
export type BurstReading = { pass: boolean; n: number; slowestMs: number; firstRateLimit: number | null; reading: string };

/**
 * Criar em rajada degrada ou segue linear?
 *
 * **Um 429 não é falha da sonda — é o teto aparecendo**, e o número que interessa é ONDE ele
 * apareceu. Tratar isso como erro de rede esconderia exatamente a medição que justifica a POC.
 *
 * `200 sem scriptId` conta como NÃO criado: é o modo de falha silencioso da API, em que ela responde
 * bem e não devolve projeto nenhum.
 */
export function burstReading(rows: readonly BurstRow[]): BurstReading {
  const lista = rows ?? [];
  const criados = lista.filter((r) => r.code === 200 && !!r.scriptId);
  const i429 = lista.findIndex((r) => r.code === 429);
  const firstRateLimit = i429 >= 0 ? i429 + 1 : null; // base 1: "o terceiro", não "o índice 2"
  // `0`, e não um `Math.max` de lista vazia (que devolve -Infinity e vira um número absurdo na tela).
  const slowestMs = criados.length ? Math.max(...criados.map((r) => r.ms)) : 0;
  if (!lista.length) return { pass: false, n: 0, slowestMs: 0, firstRateLimit: null, reading: 'nothing was attempted: this step measured nothing' };
  if (firstRateLimit !== null) {
    return { pass: false, n: criados.length, slowestMs, firstRateLimit, reading: `rate limit (HTTP 429) on attempt ${firstRateLimit}: the ceiling is below this burst, and that is the finding` };
  }
  const pass = criados.length === lista.length;
  return {
    pass,
    n: criados.length,
    slowestMs,
    firstRateLimit,
    reading: pass ? `${criados.length} child projects created and deployed in a row, slowest ${slowestMs} ms` : `${criados.length} of ${lista.length} created: the API answered without returning a project — read the codes`,
  };
}

// ---------- C2: a cota do dia ----------

export type QuotaReading = { pass: boolean; created: number; refusedAt: number | null; refusedCode: number | null; fitsFifteen: boolean; reading: string };

/**
 * Onde o dia recusa `projects.create`.
 *
 * **Recusar é resultado, não falha**: `pass` afirma que a sonda MEDIU alguma coisa, não que o Google
 * cooperou. O que decide a corrida é `fitsFifteen`, e ele é fail-closed — sem medição, não cabe.
 */
export function quotaReading(created: number, refusedAt: number | null, refusedCode: number | null, max = P29_MAX_CREATES): QuotaReading {
  const n = Number.isInteger(created) && created > 0 ? created : 0;
  const base = { created: n, refusedAt, refusedCode };
  // Nada criado E nada recusado é AUSÊNCIA de medição. Dizer `fitsFifteen: false` aqui é a mesma
  // regra do `delta: null`: não sei é diferente de não cabe, e a diferença vai para a tela.
  if (n === 0 && refusedAt === null) return { ...base, pass: false, fitsFifteen: false, reading: 'nothing was created and nothing was refused: this step measured nothing' };
  if (refusedAt !== null) {
    const cabe = refusedAt > SWARM_TARGET;
    return { ...base, pass: true, fitsFifteen: cabe, reading: cabe ? `the day refused at attempt ${refusedAt} (HTTP ${refusedCode}): ${SWARM_TARGET} still fit` : `the day refused at attempt ${refusedAt} (HTTP ${refusedCode}): the run is "up to ${n}", not "up to ${SWARM_TARGET}"` };
  }
  return { ...base, pass: true, fitsFifteen: n >= SWARM_TARGET, reading: `${n} created with no refusal, and this probe stops at ${max} on purpose: the absolute daily ceiling was not reached, only proven to be above ${n}` };
}

// ---------- C3: o custo do clique ----------

export type ConsentRow = { scriptId: string; deployedAt: number; authorized: boolean };
export type ConsentReading = { pass: boolean; authorized: number; total: number; waits: { scriptId: string; ms: number }[]; medianMs: number | null; reading: string };

/**
 * Quanto tempo de parede separa a implantação do `authState === 'authorized'`.
 *
 * **A mediana é `null` quando ninguém autorizou, nunca 0.** Zero diria "o clique é instantâneo", que
 * é o oposto do que a ausência significa — a mesma disciplina que a linhagem aplica ao `delta`.
 * A espera nunca é negativa: relógio andando para trás vira 0, não um número que ninguém explica.
 */
export function consentReading(rows: readonly ConsentRow[], now: number): ConsentReading {
  const lista = rows ?? [];
  const waits = lista.filter((r) => r.authorized).map((r) => ({ scriptId: r.scriptId, ms: Math.max(0, now - r.deployedAt) }));
  const ord = [...waits].map((w) => w.ms).sort((a, b) => a - b);
  const medianMs = ord.length ? (ord.length % 2 ? ord[(ord.length - 1) / 2] : Math.round((ord[ord.length / 2 - 1] + ord[ord.length / 2]) / 2)) : null;
  return {
    pass: waits.length > 0,
    authorized: waits.length,
    total: lista.length,
    waits,
    medianMs,
    reading: waits.length ? `${waits.length} of ${lista.length} authorized; median wall-clock wait ${medianMs} ms from deployment to authorized` : 'no one has authorized any child yet: the click is the owner\'s, and this step only reads what already happened',
  };
}

// ---------- O estado, que atravessa execuções ----------

/**
 * O Apps Script mata a execução em 6 minutos e a P24 mediu ~10,7 s só para CRIAR um filho. Logo a
 * contagem não pode viver na execução: ela vive numa Property, e cada chamada continua de onde parou.
 *
 * Fail-closed na leitura, como todo estado deste projeto: ilegível volta VAZIO. Um estado corrompido
 * que voltasse "10 criados" faria a sonda pular direto para uma conclusão que ninguém mediu.
 */
export type P29State = { ids: string[]; deployedAt: Record<string, number>; refusedAt: number | null; refusedCode: number | null };

const VAZIO = (): P29State => ({ ids: [], deployedAt: {}, refusedAt: null, refusedCode: null });

export function parseP29State(raw: string | null | undefined): P29State {
  try {
    const o = JSON.parse(String(raw ?? '')) as Partial<P29State>;
    if (!o || typeof o !== 'object' || Array.isArray(o) || !Array.isArray(o.ids)) return VAZIO();
    const ids = o.ids.map((s) => String(s ?? '').trim()).filter(Boolean);
    const at = o.deployedAt && typeof o.deployedAt === 'object' ? o.deployedAt : {};
    const deployedAt: Record<string, number> = {};
    for (const id of ids) if (Number.isFinite(at[id])) deployedAt[id] = at[id];
    return { ids, deployedAt, refusedAt: Number.isInteger(o.refusedAt) ? (o.refusedAt as number) : null, refusedCode: Number.isInteger(o.refusedCode) ? (o.refusedCode as number) : null };
  } catch {
    return VAZIO();
  }
}

/**
 * Um filho entra UMA vez, com o instante da implantação.
 *
 * O primeiro carimbo é o que vale: reescrevê-lo numa segunda chamada ENCURTARIA a espera medida em
 * C3, e a espera é justamente o número que a POC existe para descobrir.
 */
export const withCreated = (s: P29State, scriptId: string, at: number): P29State =>
  s.ids.includes(scriptId) ? s : { ...s, ids: [...s.ids, scriptId], deployedAt: { ...s.deployedAt, [scriptId]: at } };

/** A recusa é o achado da POC: ela fica gravada e não some quando a sonda continua. */
export const withRefusal = (s: P29State, at: number, code: number): P29State => ({ ...s, refusedAt: at, refusedCode: code });

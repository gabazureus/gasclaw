// O registro de falhas reais, por agente: a CONTAGEM que alimenta o aglomerado.
//
// Por que existe, e por que não é a planilha: o histórico durável do trace mora numa planilha, e a D3 diz
// que a planilha é ESPELHO — nada lido dela decide coisa alguma. Um agente que pudesse escrever na
// planilha e depois lê-la para justificar criar outro agente teria caneta sobre a própria decisão.
// Aqui a contagem mora em Script Properties, que a pasta compartilhável não alcança e nenhuma tool
// escreve (medido: `grep PropertiesService src/tools/` não retorna nada).
//
// E por que é contagem e não impressão do modelo: "7 runs falharam tocando agenda" é um inteiro, com
// variância zero por construção. "Percebi que você anda precisando de ajuda com agenda" é uma frase que
// um modelo produz com a mesma facilidade quando é verdade e quando não é. O C7 mediu desvio de 2,19 numa
// escala de 4 na medida por LLM; o inteiro não tem desvio nenhum.

// ---------- Os tipos e a leitura por aglomerado ----------
//
// Moravam em `dreamCycle.ts`, que saiu com o ciclo de sonho (branch `consertos-e-reach-out`). O
// CONTADOR sobrevive porque ele não é do sonho: é telemetria honesta do turno, gravada a cada run e
// lida pelo painel (`agentFailures`). O agrupamento vem junto pelo mesmo motivo — ele é uma LEITURA
// determinística do que já falhou, sem modelo nenhum no caminho.

/**
 * O que o painel lê para saber o que anda falhando. Vem do trace e dos runs que já aconteceram —
 * nunca de um cenário que o modelo imaginou. Um número que o modelo escreve tem a mesma cara quando
 * é verdade e quando não é; um inteiro contado não tem.
 */
export type FailureKind = 'refused_tool' | 'no_answer' | 'step_limit' | 'denied' | 'tool_error';

export type Failure = { at: number; kind: FailureKind; tool?: string; session?: string };

/** Agrupamento determinístico: contagem de inteiros, sem chamada de modelo no caminho da leitura. */
export type Cluster = { kind: FailureKind; tool: string; count: number };

/**
 * Agrupa por (tipo, ferramenta) e ordena por contagem. **Nenhum modelo participa.** Um rótulo
 * bonito pode ser gerado depois, para o painel — mas ele não decide nada, e por isso não está aqui.
 */
export function cluster(failures: readonly Failure[], sinceMs: number, now: number): Cluster[] {
  const counts = new Map<string, Cluster>();
  for (const f of failures) {
    if (!Number.isFinite(f.at) || f.at < now - sinceMs || f.at > now) continue;
    const tool = f.tool ?? '';
    const key = `${f.kind}:${tool}`;
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { kind: f.kind, tool, count: 1 });
  }
  // Ordem estável: contagem desc, depois tipo e ferramenta, para o mesmo dado dar sempre o mesmo
  // resultado. Sem isso a "contagem determinística" teria ordem não determinística, que é o mesmo
  // defeito com outro nome.
  return [...counts.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind) || a.tool.localeCompare(b.tool));
}

/** Limiar para um aglomerado merecer destaque na tela. A P25 mediu ZERO falhas no dev: até existir
 *  dado real, este número é ponto de partida declarado, não critério calibrado. */
export const CLUSTER_MIN = 3;

/** Há aglomerado que valha a pena mostrar? Abaixo do limiar a tela diz por quê, em vez de afirmar. */
export function hasMaterial(clusters: readonly Cluster[], min = CLUSTER_MIN): { ok: boolean; reason: string; top: Cluster | null } {
  const top = clusters[0] ?? null;
  if (!top) return { ok: false, reason: 'no real failures in the window: nothing to report', top: null };
  if (top.count < min) return { ok: false, reason: `the biggest cluster has ${top.count} occurrences, below the ${min} needed`, top };
  return { ok: true, reason: '', top };
}


const PROP_MAX = 8_000; // Script Properties: 9 KB por valor, a mesma margem do usage.ts e do saveAgents
const MAX_ENTRIES = 300;
const NINETY_DAYS = 90 * 24 * 3600_000;

export const failProp = (folderId: string) => `FAIL:${folderId}`;

const KINDS: readonly FailureKind[] = ['refused_tool', 'no_answer', 'step_limit', 'denied', 'tool_error'];
const isKind = (x: unknown): x is FailureKind => typeof x === 'string' && (KINDS as readonly string[]).includes(x);

/**
 * Formato compacto de propósito: `[at, kind, tool]` em vez de objeto com chaves.
 *
 * Com 300 entradas, o JSON com chaves passaria de 20 KB e estouraria o valor de 9 KB — e o estouro não
 * degrada, lança exceção. A forma curta cabe; a legibilidade se perde no arquivo e se recupera aqui.
 */
type Row = [number, FailureKind, string];

export function parseFailures(raw: string | null | undefined): Failure[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r): r is Row => Array.isArray(r) && typeof r[0] === 'number' && isFinite(r[0]) && isKind(r[1]))
      .map((r) => ({ at: r[0], kind: r[1], ...(typeof r[2] === 'string' && r[2] ? { tool: r[2] } : {}) }));
  } catch {
    return []; // fail-closed: registro ilegível conta como nenhuma falha, nunca como falha inventada
  }
}

/**
 * Acrescenta uma falha, podando o que passou de 90 dias e o que passou do teto.
 *
 * A poda por IDADE vem antes da poda por QUANTIDADE: sem isso, um agente muito usado perderia falhas
 * recentes para manter falhas velhas, e o aglomerado leria um passado que não existe mais.
 */
export function withFailure(atuais: readonly Failure[], f: Failure, now: number): Failure[] {
  const recentes = [...atuais, f].filter((x) => x.at > now - NINETY_DAYS && x.at <= now);
  return recentes.slice(-MAX_ENTRIES);
}

/** Recusa em vez de estourar a Property — a lição do `saveAgents`, que quebrava o painel com exceção crua. */
export function serializeFailures(list: readonly Failure[]): string {
  let rows: Row[] = list.map((f) => [Math.trunc(f.at), f.kind, f.tool ?? '']);
  let json = JSON.stringify(rows);
  // Cortar pela metade UMA VEZ não basta: com nomes de ferramenta longos, 300 entradas ainda passavam de
  // 14 KB depois do corte. O laço garante que cabe; as entradas que ficam são sempre as MAIS RECENTES,
  // porque é o passado próximo que o aglomerado precisa ler.
  while (json.length > PROP_MAX && rows.length > 1) {
    rows = rows.slice(-Math.max(1, Math.floor(rows.length / 2)));
    json = JSON.stringify(rows);
  }
  return json;
}

/** Quantas falhas de cada tipo, para a tela. Só leitura, sem decisão. */
export const countByKind = (list: readonly Failure[]): Record<string, number> =>
  list.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});

// ---------- A LIGAÇÃO que faltava (auditoria de 2026-09-20) ----------
//
// `recordFailure` existia, tinha teste verde e NINGUÉM o chamava: zero call sites no motor inteiro. Eu
// vinha lendo o trace vazio como "falta uso real do agente" — e a leitura estava errada. O contador
// nunca tinha sido ligado, e foi isso que travou o ciclo de sonho esperando um dado que não podia chegar.
//
// Esta função é pura de propósito: ela LÊ o resultado de um turno e devolve o que contar. Quem grava é
// a casca (`main.ts`), porque `agent.ts` não pode tocar em Script Properties sem virar casca também.

/** O bastante de um turno para saber se ele deu errado. Estrutural, para não amarrar ao `TurnResult`. */
export type TurnOutcome = {
  events: readonly { name: string; status: string }[];
  text: string;
  stopped?: 'steps' | 'deadline';
};

const STATUS_KIND: Record<string, FailureKind> = { refused: 'refused_tool', denied: 'denied', error: 'tool_error' };

/**
 * O que contar de um turno. Nada, quando ele foi bem.
 *
 * **A decisão que vale o comentário:** a mesma (falha, ferramenta) repetida no turno conta UMA vez.
 * O modelo insistindo cinco vezes na ferramenta recusada é UM problema, não cinco. Contar cinco
 * inflaria o aglomerado a partir de um único run, e o limiar de 3 viraria ruído — um agente teimoso
 * apareceria como um agente com problema crônico, que é exatamente a leitura errada que o aglomerado
 * existe para evitar.
 *
 * `deadline` NÃO conta: estourar o prazo de 6 min do Google é limite de plataforma, não defeito do
 * agente, e o run durável retoma. Misturá-lo com `step_limit` faria o aglomerado apontar para o
 * prompt quando o problema é a cota.
 */
export function failuresFrom(t: TurnOutcome, now: number): Failure[] {
  const out: Failure[] = [];
  const vistos = new Set<string>();
  for (const e of t.events ?? []) {
    const kind = STATUS_KIND[e.status];
    if (!kind) continue; // ok, approved e pending não são falha: sucesso, sucesso com clique, e espera
    const chave = `${kind}:${e.name}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ at: now, kind, ...(e.name ? { tool: e.name } : {}) });
  }
  if (t.stopped === 'steps') out.push({ at: now, kind: 'step_limit' });
  // Turno sem texto é turno sem resposta — e é a falha mais invisível de todas, porque não lança nada.
  else if (!String(t.text ?? '').trim()) out.push({ at: now, kind: 'no_answer' });
  return out;
}

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

import type { Failure, FailureKind } from './dreamCycle';

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

// A família: entrega da chave ao filho e o teto de gasto familiar (ADR-040). NÚCLEO PURO.
//
// Decisão do usuário (2026-09-19): o filho é agente completo e usa A MESMA CHAVE do pai. Gerenciar
// N chaves viraria trabalho do dono, e o argumento é bom.
//
// Duas consequências, e a segunda é um instrumento que não existiria com chaves separadas.

// ---------- 1. A chave não vai no fonte ----------

/**
 * Embutir a chave no código do filho significa que, se o projeto do filho for compartilhado um dia,
 * a chave vai junto. Em vez disso o filho **pede** a chave ao pai na primeira execução, autenticado
 * pelo segredo por filho, e guarda nas Script Properties DELE.
 *
 * **O problema que este desenho NÃO elimina, e precisa estar dito:** o *segredo* continua no fonte
 * do filho. Quem receber o projeto do filho recebe o segredo, e com ele poderia pedir a chave.
 * Por isso a entrega é **de uma vez só**: passada a janela, um segredo vazado não vale nada.
 *
 * E por isso a janela é **rearmável pelo dono** — se o filho for republicado e perder as
 * Properties, uma entrega única e definitiva o deixaria inútil para sempre. Rearmar é ato humano
 * no painel, nunca automático: automático desfaria a proteção que a unicidade cria.
 */
export type KeyDelivery = { child: string; armed: boolean; deliveredAt: number | null; deliveries: number };

export const armDelivery = (child: string): KeyDelivery => ({ child, armed: true, deliveredAt: null, deliveries: 0 });

export type DeliveryVerdict = { ok: boolean; reason: string };

/**
 * O pai entrega a chave? Só para o filho que ele criou (o segredo prova), só com a janela armada.
 * Fail-closed em tudo: sem estado, sem segredo, segredo errado ou janela fechada.
 */
export function mayDeliverKey(d: KeyDelivery | null | undefined, child: string, secretOk: boolean): DeliveryVerdict {
  if (!d) return { ok: false, reason: 'this child was not created by this agent' };
  if (d.child !== child) return { ok: false, reason: 'delivery state belongs to another child' };
  if (!secretOk) return { ok: false, reason: 'wrong or missing child secret' };
  if (!d.armed) return { ok: false, reason: 'the key was already delivered to this child; the owner can re-arm it in the panel' };
  return { ok: true, reason: '' };
}

/** Consome a janela. A contagem CRESCE mesmo depois de rearmar: entrega repetida é sinal, não rotina. */
export const afterDelivery = (d: KeyDelivery, now: number): KeyDelivery => ({ ...d, armed: false, deliveredAt: now, deliveries: d.deliveries + 1 });

/** Rearmar é ato do dono no painel. Nunca automático. */
export const rearmDelivery = (d: KeyDelivery): KeyDelivery => ({ ...d, armed: true });

/** Entrega de credencial sem rastro é o tipo de coisa que ninguém descobre depois. */
export const deliverySpan = (child: string): string => `key_delivery:${child}`;

// ---------- 2. O teto familiar ----------

/**
 * Como o OpenRouter reporta uso POR CHAVE e a família inteira usa a mesma chave:
 *
 *     gasto da família (OpenRouter) − gasto do pai (trace) = consumo dos filhos
 *
 * É o mesmo offset de -79% que a medição de 2026-09-19 explicou, virado do avesso e usado a favor:
 * o painel mostra o que os filhos gastaram **sem instrumentação nenhuma neles**.
 *
 * **ARMADILHA, e ela vai para a tela:** esse número inclui QUALQUER coisa que use a chave — outro
 * script, um teste no terminal, prod junto com dev. É um **LIMITE SUPERIOR** do consumo dos filhos,
 * nunca uma medida exata. O mesmo espírito do `CROSS_CHECK_NOTE`.
 */
export const childrenSpendUpperBound = (familyUsd: number, parentUsd: number): number | null =>
  Number.isFinite(familyUsd) && Number.isFinite(parentUsd) ? Math.max(0, familyUsd - parentUsd) : null;

export const FAMILY_NOTE =
  'Upper bound, not an exact figure: OpenRouter reports usage PER KEY, so anything else using this key (another script, a terminal test, prod alongside dev) is counted here too. Lag: the key reading is cached for 10 minutes, so a child in a loop can spend before it shows up.';

export const FAMILY_CAP_USD = 5.0;
/** Cache de `keyInfo`: 10 min. É o tamanho da janela em que um filho gasta sem aparecer. */
export const FAMILY_LAG_MS = 600_000;

export type CapAction = 'ok' | 'stop-creating' | 'freeze';

/**
 * O que fazer ao estourar. Duas faixas, e nenhuma delas corta a chave.
 *
 * Cortar a chave pararia **o pai também**, e derrubar o agente do dono por causa de um filho gastão
 * seria trocar um problema por outro maior. Cortar a chave é a alavanca de EMERGÊNCIA do dono
 * (ver runbook), não a reação automática — reação automática deve ser reversível e a menos
 * destrutiva que resolva.
 */
export function capAction(childrenUsd: number | null, cap = FAMILY_CAP_USD): CapAction {
  if (childrenUsd === null) return 'ok'; // sem leitura confiável, não pune por suspeita
  if (childrenUsd >= cap) return 'freeze'; // congela capacidades; os agentes continuam atendendo
  if (childrenUsd >= cap * 0.8) return 'stop-creating'; // para de criar filhos antes de congelar
  return 'ok';
}

// A família: o teto de gasto familiar (ADR-040). NÚCLEO PURO.
//
// Decisão do usuário (2026-09-19): o filho usa A MESMA CHAVE do pai. Gerenciar N chaves viraria
// trabalho do dono, e o argumento é bom.
//
// ENTREGA DE CHAVE AO FILHO: REMOVIDA (2026-09-20). Este arquivo tinha uma primeira metade —
// `KeyDelivery`, `mayDeliverKey`, a janela única e o rearme — que implementava o pai entregar a
// credencial ao filho. A P27 mediu que o filho NÃO ALCANÇA o motor (o web app recusa o token de
// outro projeto antes de chegar ao nosso código), e o dono escolheu a opção 4 da ADR-040: filhos
// são só `automation`, que nunca falam com modelo e portanto nunca precisam de chave.
//
// Foi removida em vez de desligada porque, enquanto existia, ela era a ÚNICA rota do projeto que
// devolvia a credencial do dono — e ficava ARMADA para todo filho criado, esperando alguém abrir o
// web app. Um caminho de credencial sem caller é a forma mais cara de código morto que existe.
// O desenho está preservado na ADR-040 (opção 2) e no git, caso um dia se decida o contrário.
//
// O teto familiar SOBREVIVE intacto, e continua valendo: os filhos que existem por `agent.create`
// rodam no mesmo projeto e na mesma chave, logo o offset abaixo continua medindo o que eles gastam.

// ---------- O teto familiar ----------

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

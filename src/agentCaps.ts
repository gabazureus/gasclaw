// Capacidades do agente, ciclo de vida e intervalo entre gerações (ADR-038). NÚCLEO PURO —
// sem Drive, sem Properties, sem relógio: quem chama passa `now`.
//
// NÃO HÁ DUAS ESPÉCIES. Existe uma coisa só — o agente, que é uma pasta com markdown — e o que
// distingue um do outro é o CONJUNTO DE CAPACIDADES LIGADAS, mostrado como etiqueta no painel.
// Não há papel especial, não há nome de cargo: há capacidade aprovada, uma a uma.
//
// Duas ideias sustentam este módulo:
//
// 1. CAPACIDADE É OPT-IN E FAIL-CLOSED. Ausente, corrompida ou com um nome desconhecido ⇒ lista
//    vazia. "Quase tudo aprovado" não existe.
//
// 2. O CONGELAMENTO É GLOBAL e vence qualquer aprovação individual (`effectiveCapabilities`).
//    Emergência quer UMA chave, não um campo por agente para virar N vezes sob pressão.
//
// NESTA BRANCH EXISTE UMA CAPACIDADE SÓ: `initiative` (Reach out). `dream`, `succeed` e `create`
// saíram com o auto-aprimoramento e com a geração de código — junto com o singleton `CREATOR`, o
// intervalo entre gerações e a linhagem, que só existiam para servi-las. A lista continua sendo uma
// LISTA porque o mecanismo (aprovar uma a uma, congelar todas) é o que vale, não a cardinalidade.

export const CAPABILITIES = ['initiative'] as const;
export type Capability = (typeof CAPABILITIES)[number];

const isCapability = (x: unknown): x is Capability => typeof x === 'string' && (CAPABILITIES as readonly string[]).includes(x);

/**
 * Valor de `CAP:<folderId>` (JSON). Ausente, inválido, com tipo errado ou com UM nome
 * desconhecido ⇒ `[]` (fail closed por inteiro, como `parseAccess`).
 *
 * Invalidar por inteiro, e não só descartar o nome ruim, é deliberado: uma lista meio aceita dá
 * ao dono a impressão de que ele aprovou uma coisa quando aprovou outra.
 */
export function parseCapabilities(raw: string | null | undefined): Capability[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isCapability)) return [];
    return [...new Set(parsed)];
  } catch {
    return [];
  }
}

export const can = (caps: readonly Capability[], cap: Capability): boolean => caps.includes(cap);

// ---------- Ciclo de vida ----------

/**
 * Três estados, e `archived` é distinto de removido. Remover (`removeAgent`) continua existindo e
 * continua sendo remoção de verdade; arquivar preserva a linhagem, que é justamente o que o
 * registro de evolução quer guardar.
 */
/**
 * NESTA BRANCH nada GRAVA `archived`: o único escritor era o `passBaton` da sucessão, que saiu.
 * O estado continua sendo LIDO pelos três portões que o consultam — `isRunnable`, `claimable` e o
 * `mayAct` do `main` — porque um ambiente vindo da branch anterior tem chaves `STATUS:<pasta>` gravadas, e
 * desonrá-las ressuscitaria um agente que o dono aposentou. Ler sem escrever é o estado correto
 * aqui; o que não pode é o portão sumir junto com quem o acionava.
 */
export type AgentStatus = 'active' | 'archived';

export const parseStatus = (raw: string | null | undefined): AgentStatus => (raw === 'archived' ? 'archived' : 'active');

/** Arquivado NÃO RODA: não atende turno, não vira run, não é elegível para gatilho nem para entrega. */
export const isRunnable = (status: AgentStatus): boolean => status === 'active';

export type Verdict = { ok: boolean; reason: string };
const no = (reason: string): Verdict => ({ ok: false, reason });
const yes: Verdict = { ok: true, reason: '' };

// ---------- Esquecer um agente por inteiro (ADR-040 §C) ----------

/**
 * As chaves a apagar quando um agente sai. Recebe as chaves existentes para não depender de
 * lembrar a lista: **qualquer** chave no formato `<prefixo>:<folderId>` entra, inclusive uma
 * criada depois desta linha ser escrita.
 */
export const forgetAgentProps = (keys: readonly string[], folderId: string): string[] =>
  folderId ? keys.filter((k) => k.endsWith(`:${folderId}`) && k.slice(0, k.length - folderId.length - 1).length > 0) : [];

// §F (encerrar o run em voo ao arquivar) SAIU com a sucessão: nesta branch ninguém GRAVA `archived`,
// então não existe o instante "arquivou com run aberto" que a regra cobria. As duas funções ficaram
// sem chamador e com teste verde — o disfarce exato de "pronto e não está" —, então foram removidas
// junto com os testes. Se a escrita de `archived` voltar, a regra volta COM a fiação.

/**
 * Um agente não-ativo nunca é reivindicável pelo pump. Vale para `claimNext` e `claimById`: os dois
 * consultam o estado antes de tomar o run, senão o arquivamento seria só cosmético.
 */
export const claimable = (status: AgentStatus | undefined): boolean => isRunnable(status ?? 'active');

// ---------- Congelamento de emergência (decisão do usuário: interruptor GLOBAL) ----------

/**
 * Uma chave só, independente do estado dos agentes: `CAPS_ENABLED=false` desliga **todas** as
 * capacidades e **mantém os agentes atendendo**. Emergência quer uma chave, não um campo por agente
 * que alguém precise virar N vezes sob pressão — e não polui o ciclo de vida, que já tem seu estado.
 *
 * O estado **aparece no painel**: uma chave de emergência que ninguém vê se está ligada é pior que
 * não ter, porque produz confiança falsa nos dois sentidos.
 */
export const capsEnabled = (raw: string | null | undefined): boolean => raw !== 'false';

/** Capacidades efetivas: o congelamento vence qualquer aprovação individual. */
export const effectiveCapabilities = (approved: readonly Capability[], frozenRaw: string | null | undefined): Capability[] =>
  capsEnabled(frozenRaw) ? [...approved] : [];

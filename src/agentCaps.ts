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

/** A etiqueta do painel: o que está ligado neste agente. Vazio = agente comum. */
export const capabilityTag = (caps: readonly Capability[]): string[] => CAPABILITIES.filter((c) => caps.includes(c));

/** Um agente recém-gerado nasce SEM PODER NENHUM. Gerar e habilitar são atos separados. */
export const newbornCapabilities = (): Capability[] => [];

// ---------- Ciclo de vida ----------

/**
 * Três estados, e `archived` é distinto de removido. Remover (`removeAgent`) continua existindo e
 * continua sendo remoção de verdade; arquivar preserva a linhagem, que é justamente o que o
 * registro de evolução quer guardar.
 */
/**
 * NESTA BRANCH nada GRAVA `archived`: o único escritor era o `passBaton` da sucessão, que saiu.
 * O estado continua sendo LIDO — `isRunnable`, `claimable`, `accessAfterArchive` e o `mayAct` do
 * `main` — porque um ambiente vindo da branch anterior tem chaves `STATUS:<pasta>` gravadas, e
 * desonrá-las ressuscitaria um agente que o dono aposentou. Ler sem escrever é o estado correto
 * aqui; o que não pode é o portão sumir junto com quem o acionava.
 */
export type AgentStatus = 'active' | 'archived';

export const parseStatus = (raw: string | null | undefined): AgentStatus => (raw === 'archived' ? 'archived' : 'active');

/** Arquivado NÃO RODA: não atende turno, não vira run, não é elegível para gatilho nem para entrega. */
export const isRunnable = (status: AgentStatus): boolean => status === 'active';

/**
 * Arquivar limpa as FERRAMENTAS (um agente que não roda não precisa de ferramenta aprovada) e
 * PRESERVA as pessoas: a conversa continua legível por quem já podia lê-la. O dono entra de
 * qualquer forma — `canUse` já o deixa passar com acesso vazio.
 */
export const accessAfterArchive = (a: { users: string[]; tools: string[] }): { users: string[]; tools: string[] } => ({ users: a.users, tools: [] });

export type Verdict = { ok: boolean; reason: string };
const no = (reason: string): Verdict => ({ ok: false, reason });
const yes: Verdict = { ok: true, reason: '' };

// ---------- Esquecer um agente por inteiro (ADR-040 §C) ----------

/**
 * Prefixos de Script Property presos a um `folderId`. Remover um agente precisa apagar TODOS —
 * `removeAgent` apagava só `ACCESS:`, e `MODEL:`/`STEPS:` sobravam.
 *
 * Com capacidade na jogada isso deixa de ser sobra e vira ressurreição: `ensureFolderPath` reusa a
 * primeira pasta com o mesmo nome, então remover e recriar devolveria as capacidades **sem um clique**.
 */
export const AGENT_PROP_PREFIXES = ['ACCESS', 'CAP', 'MODEL', 'STEPS', 'STATUS', 'CFG'] as const;

/**
 * As chaves a apagar quando um agente sai. Recebe as chaves existentes para não depender de
 * lembrar a lista: **qualquer** chave no formato `<prefixo>:<folderId>` entra, inclusive uma
 * criada depois desta linha ser escrita.
 */
export const forgetAgentProps = (keys: readonly string[], folderId: string): string[] =>
  folderId ? keys.filter((k) => k.endsWith(`:${folderId}`) && k.slice(0, k.length - folderId.length - 1).length > 0) : [];

// ---------- §F: arquivar encerra o que está em voo ----------

/**
 * Arquivar não é só impedir o que vem depois — é **encerrar o que está em voo**. Sem isto, o agente
 * arquivado continuaria dono de um lease (o pump o retomaria) e o card dele seguiria aprovável por
 * 24 h: o antecessor agiria em paralelo com o sucessor, que é exatamente o que a substituição 1→1
 * existe para evitar.
 */
export const RUN_CLOSED_ON_ARCHIVE = 'this agent was archived while the task was open; nothing else will run on it';

/** Um run pertence a um agente que saiu? Então ele não pode continuar. */
export const runSurvivesArchive = (runFolderId: string, archivedFolderId: string): boolean => runFolderId !== archivedFolderId;

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

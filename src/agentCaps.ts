// Capacidades do agente, ciclo de vida e intervalo entre gerações (ADR-038). NÚCLEO PURO —
// sem Drive, sem Properties, sem relógio: quem chama passa `now`.
//
// NÃO HÁ DUAS ESPÉCIES. Existe uma coisa só — o agente, que é uma pasta com markdown — e o que
// distingue um do outro é o CONJUNTO DE CAPACIDADES LIGADAS, mostrado como etiqueta no painel.
// Não há papel especial, não há nome de cargo: há capacidade aprovada, uma a uma.
//
// Quatro ideias sustentam este módulo:
//
// 1. CAPACIDADE É OPT-IN E FAIL-CLOSED. Ausente, corrompida ou com um nome desconhecido ⇒ lista
//    vazia. "Quase tudo aprovado" não existe.
//
// 2. `succeed` E `create` SÃO PODERES DIFERENTES, e a diferença é aritmética:
//      - suceder é SUBSTITUIÇÃO (1 → 1): o sucessor assume, o antecessor é arquivado. Não
//        multiplica, logo pode estar ligada em vários agentes sem criar laço.
//      - criar é MULTIPLICAÇÃO (1 → N). Essa é a que precisa do singleton.
//    NEM TODO AGENTE GERADO É SUCESSOR: o tipo do ato entra no modelo, no registro e no trace.
//
// 3. O SINGLETON DE `create` É A FORMA DO DADO. Uma Property `CREATOR` com UM folderId. "No
//    máximo um agente cria agentes" não é invariante defendida por trava: é estado que não pode
//    ser representado, porque não há dois lugares onde escrever.
//
// 4. O INTERVALO MÍNIMO É MECANISMO DE SEGURANÇA, não conforto. Ele é a trava de custo (o Opus 5
//    só entra na geração) E a trava de descontrole. Recusa por intervalo é VISÍVEL no trace:
//    recusa silenciosa faria o agente parecer quebrado.

export const CAPABILITIES = ['dream', 'initiative', 'succeed', 'create'] as const;
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

// ---------- Quem pode criar agentes ----------

/** Apontar o criador: o valor de `CREATOR` passa a ser este folderId. Substitui — não acumula. */
export const setCreator = (folderId: string): string => folderId;

/** `removeAgent`/arquivar limpam `CREATOR` quando é ele que sai. */
export const clearCreator = (creator: string | null | undefined, goneFolderId: string): string | null =>
  creator && creator !== goneFolderId ? creator : null;

/** Quem é o criador AGORA, conferido contra os agentes ATIVOS. Ponteiro órfão ⇒ ninguém cria. */
export const creatorOf = (creator: string | null | undefined, agents: readonly { folderId: string; status?: AgentStatus }[]): string | null =>
  creator && agents.some((a) => a.folderId === creator && isRunnable(a.status ?? 'active')) ? creator : null;

export type Verdict = { ok: boolean; reason: string };
const no = (reason: string): Verdict => ({ ok: false, reason });
const yes: Verdict = { ok: true, reason: '' };

/**
 * Criar um agente NOVO (que não é sucessor): só o criador designado, e ser apontado por `CREATOR`
 * NÃO BASTA — a capacidade também precisa estar aprovada. Defesa em profundidade: um `CREATOR`
 * restaurado de um backup antigo não devolve sozinho o poder de multiplicar agentes.
 */
export function canCreateAgent(creator: string | null | undefined, folderId: string, caps: readonly Capability[]): Verdict {
  if (!creator) return no('no agent in this environment is allowed to create agents');
  if (creator !== folderId) return no('only the designated creator agent can create new agents');
  if (!can(caps, 'create')) return no('the create capability is not approved for this agent');
  return yes;
}

/**
 * Gerar um SUCESSOR. Diferente de criar: substitui 1 por 1, então pode estar ligada em vários
 * agentes — inclusive num agente que foi ele mesmo gerado. Não há singleton aqui, de propósito.
 */
export function canSucceed(caps: readonly Capability[], status: AgentStatus): Verdict {
  if (!isRunnable(status)) return no('an archived agent cannot generate a successor');
  if (!can(caps, 'succeed')) return no('the succeed capability is not approved for this agent');
  return yes;
}

// ---------- Intervalo mínimo entre gerações ----------

/** 24 h: com o conjunto-juiz nesta escala, gerar mais rápido não produz aprendizado mais rápido. */
export const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 h: piso absoluto, o painel não deixa descer disso

/** Intervalo declarado, preso ao piso. Valor absurdo cai no padrão, nunca em "sem intervalo". */
export const intervalOf = (declaredMs: number | undefined): number =>
  Number.isFinite(declaredMs) && (declaredMs as number) >= MIN_INTERVAL_MS ? (declaredMs as number) : DEFAULT_INTERVAL_MS;

/**
 * Já pode gerar? A recusa carrega quanto falta, porque ela vai para o trace: um agente que recusa
 * em silêncio parece quebrado, e o dono não descobre que a trava é que está agindo.
 */
export function mayGenerate(lastAt: number | null | undefined, intervalMs: number, now: number): Verdict {
  if (!Number.isFinite(now)) return no('invalid clock');
  // `lastAt == null`, NÃO `!lastAt`: o instante 0 (epoch) é um carimbo válido, e `!0` é true.
  // A versão falsy liberava geração para quem tivesse gerado exatamente em 0 — o teste pegou.
  if (lastAt == null || !Number.isFinite(lastAt)) return yes; // nunca gerou
  const wait = lastAt + intervalMs - now;
  return wait > 0 ? no(`too soon: ${Math.ceil(wait / 60000)} min left before the next generation`) : yes;
}

// ---------- Linhagem ----------

/** O tipo do ato. NEM TODO AGENTE GERADO É SUCESSOR — por isso isto existe no modelo. */
export type ActKind = 'succession' | 'creation';

/** Uma linha do registro de evolução. Espelhada na planilha; a planilha nunca decide nada (D3). */
export type LineageEntry = {
  at: number;
  kind: ActKind;
  parent: string; // folderId de quem gerou
  child: string; // folderId de quem nasceu
  generation: number; // 1 para o primeiro; só cresce em sucessão
  delta: number | null; // placar contra o conjunto-juiz; null em criação (não há a quem comparar)
  costUsd: number; // o que a geração custou (Opus 5 entra só aqui)
  summary: string; // o que mudou / o que ele realiza
};

/** Sucessão avança a geração; criação começa uma linhagem nova em 1. */
export const nextGeneration = (kind: ActKind, parentGeneration: number): number => (kind === 'succession' ? parentGeneration + 1 : 1);

// ---------- Escalonamento de privilégio ----------

/**
 * Capacidades de um SUCESSOR. Interseção com o antecessor — nunca união.
 *
 * O texto do sucessor foi escrito por um LLM a partir de material que veio da pasta
 * COMPARTILHÁVEL. Ele é conteúdo de terceiro, exatamente como o corpo de um e-mail, e o fato de
 * "ter sido o nosso modelo que escreveu" não muda nada: quem controla a entrada controla a saída.
 * Por isso o markdown do sucessor **não concede**; no máximo ele pede MENOS do que o antecessor
 * já tinha. Sucessão não é escada de privilégio.
 */
export const capsAfterSuccession = (predecessor: readonly Capability[], declared: readonly Capability[]): Capability[] =>
  CAPABILITIES.filter((c) => predecessor.includes(c) && declared.includes(c));

/**
 * Capacidades de um agente CRIADO (não sucessor): nenhuma, sempre. Diferente da sucessão, aqui
 * não há de quem herdar — e herdar do criador transformaria `create` numa fábrica de poder.
 */
export const capsAfterCreation = (): Capability[] => newbornCapabilities();

// ---------- Esquecer um agente por inteiro (ADR-040 §C) ----------

/**
 * Prefixos de Script Property presos a um `folderId`. Remover um agente precisa apagar TODOS —
 * hoje `removeAgent` apaga só `ACCESS:`, e `MODEL:`/`STEPS:` já sobram.
 *
 * Com capacidade e carimbo de intervalo na jogada isso deixa de ser sobra e vira ressurreição:
 * `ensureFolderPath` reusa a primeira pasta com o mesmo nome, então remover e recriar devolveria
 * as capacidades **sem um clique**, e apagar o carimbo zeraria a trava de custo do Opus.
 */
export const AGENT_PROP_PREFIXES = ['ACCESS', 'CAP', 'MODEL', 'STEPS', 'LASTGEN', 'STATUS'] as const;

/**
 * As chaves a apagar quando um agente sai. Recebe as chaves existentes para não depender de
 * lembrar a lista: **qualquer** chave no formato `<prefixo>:<folderId>` entra, inclusive uma
 * criada depois desta linha ser escrita.
 */
export const forgetAgentProps = (keys: readonly string[], folderId: string): string[] =>
  folderId ? keys.filter((k) => k.endsWith(`:${folderId}`) && k.slice(0, k.length - folderId.length - 1).length > 0) : [];

/**
 * O carimbo do intervalo (`LASTGEN:`) **é apagado junto**, e isso é decisão explícita, não
 * esquecimento: ele pertence ao agente, e o agente deixou de existir. O que impede a rajada não é
 * o carimbo sobreviver à remoção — é `create` ser singleton, `succeed` precisar de aprovação, e
 * remover um agente ser ato do dono no painel. Preservar o carimbo de um agente removido criaria
 * a situação pior: uma chave órfã para sempre nas Properties (500 KB no total) travando um
 * `folderId` que talvez nunca mais exista.
 */
export const INTERVAL_STAMP_SURVIVES_REMOVAL = false;

// ---------- Buracos fechados depois da pesquisa do sinal fraco (2026-09-19) ----------

/**
 * A promoção guarda o prompt ANTERIOR. O bastão já era reversível; o prompt promovido não era —
 * promover sobrescrevia o papel vigente e não havia volta declarada. Guardar o texto de trás é o
 * que torna "reverter" uma operação em vez de uma arqueologia.
 */
export type Promotion = { at: number; role: string; previousRole: string; seal: string };

export const revert = (p: Promotion): string => p.previousRole;

/**
 * Métrica do próprio laço. Sem ela, um sonho que nunca promove nada é peso morto invisível:
 * consome cota e dinheiro, e o painel mostra atividade.
 */
export type LoopHealth = { cycles: number; promotions: number; gateFailures: number; ties: number };

export const emptyLoopHealth = (): LoopHealth => ({ cycles: 0, promotions: 0, gateFailures: 0, ties: 0 });

/** Fração de ciclos que produziram promoção. `null` enquanto não houve ciclo — nunca 0 enganoso. */
export const promotionRate = (h: LoopHealth): number | null => (h.cycles > 0 ? h.promotions / h.cycles : null);

/**
 * O laço está valendo a pena? Zero promoções em muitos ciclos é o sinal de peso morto que a
 * literatura prevê como platô — e que só aparece se alguém contar.
 */
export const loopIsDeadWeight = (h: LoopHealth, minCycles = 20): boolean => h.cycles >= minCycles && h.promotions === 0;

/**
 * Trava de concorrência: um ciclo de sonho por agente. Dois ciclos simultâneos no mesmo agente
 * gastariam orçamento em dobro e poderiam promover candidatos diferentes em cima um do outro.
 * A chave é por pasta, no mesmo formato das outras chaves presas a `folderId`.
 */
export const dreamLockKey = (folderId: string): string => `DREAMLOCK:${folderId}`;

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

/**
 * As capacidades do EX-criador depois que o bastão de criar mudou de mãos.
 *
 * O singleton era "por forma do dado" só do lado do `CREATOR`: uma Property, um `folderId`. A lista
 * `CAP:<pasta>` NÃO tinha essa propriedade — ligar `create` em B apontava `CREATOR=B` e deixava
 * `create` na lista de A. Dois agentes com a capacidade que MULTIPLICA, e o estado impossível era
 * representável o tempo todo; só ninguém tinha olhado pelo lado da lista.
 */
export const capsAfterCreatorMoved = (previous: readonly Capability[]): Capability[] => previous.filter((c) => c !== 'create');

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

/**
 * O tipo do ato. NEM TODO AGENTE GERADO É SUCESSOR — por isso isto existe no modelo.
 *
 * `codegen` é o ato de ESCREVER o código do sucessor; `succession` é o de COROÁ-LO. São separados
 * porque a decisão é separada: escrever permite avaliar antes de entregar o bastão, e a maioria dos
 * códigos escritos nunca deve ser coroada.
 */
export type ActKind = 'succession' | 'creation' | 'codegen';

/** Uma linha do registro de evolução. Espelhada na planilha; a planilha nunca decide nada (D3). */
export type LineageEntry = {
  at: number;
  kind: ActKind;
  parent: string; // folderId de quem gerou
  child: string; // folderId de quem nasceu
  generation: number; // 1 para o primeiro; só cresce em sucessão
  delta: number | null; // placar contra o conjunto-juiz; null em criação (não há a quem comparar)
  // P31: a nota MEDIDA deste filho de código — passes de k casos da bateria do dono. Sem ela o filho
  // seguinte não teria contra quem se comparar, e todo delta seria nulo para sempre. Opcional: as
  // entradas de antes da P31, e as de `creation`/`succession`, simplesmente não têm.
  passes?: number | null;
  k?: number | null;
  costUsd: number; // o que a geração custou (Opus 5 entra só aqui)
  summary: string; // o que mudou / o que ele realiza
};

/**
 * Sucessão avança a geração; criação começa uma linhagem nova em 1.
 *
 * `codegen` NÃO avança: escrever o código não coroa ninguém, e contar a geração ali faria o número
 * subir a cada tentativa — inclusive nas que forem descartadas. Quem avança é o bastão.
 */
export const nextGeneration = (kind: ActKind, parentGeneration: number): number => (kind === 'succession' ? parentGeneration + 1 : kind === 'codegen' ? parentGeneration : 1);

/**
 * De quem a PRÓXIMA geração de código herda o fonte. Puro: escolhe o nome, não lê o código.
 *
 * **O defeito que esta função existe para consertar (D1, achado em 2026-09-20):** `succeedNow`
 * passava `incumbentSource: agente.system` — o PROMPT do agente — em TODA geração. O comentário ao
 * lado dizia "na primeira geração: não existe fonte anterior até o primeiro sucessor nascer", e a
 * segunda metade nunca foi escrita. A geração 2 nunca recebia o código da 1: cada filho era um
 * sorteio novo do mesmo ponto de partida. Isso é REPLICAÇÃO COM VARIÂNCIA, não evolução — e a tela
 * dizia "evolução".
 *
 * **Por RECÊNCIA, e não por aptidão.** Herdar do MELHOR exigiria o filho ter rodado, e rodar exige o
 * clique do dono (portão da plataforma, medido na P24). Por recência a corrente anda sozinha; a
 * seleção por aptidão depende de existir aptidão, que é outro trabalho e outra POC.
 *
 * Só `codegen` deixa fonte: herdar de uma `creation` seria herdar de um agente que nunca teve fonte.
 */
export function heirOf(entries: readonly LineageEntry[], parent: string): string | null {
  const pai = String(parent ?? '').trim();
  if (!pai) return null;
  const meus = (entries ?? []).filter((e) => e && e.kind === 'codegen' && e.parent === pai && String(e.child ?? '').trim() && Number.isFinite(e.at));
  if (!meus.length) return null;
  // `reduce` e não `sort`: a lista vem de uma Property e ordená-la faria a escolha depender da ordem
  // de gravação, que ninguém garante. O carimbo é o critério, e ele é explícito.
  return meus.reduce((a, b) => (b.at > a.at ? b : a)).child;
}

/**
 * De quem herdar quando JÁ EXISTE aptidão medida: do MELHOR, não do mais recente.
 *
 * É esta função que separa evolução de deriva. `heirOf` encadeia — cada geração parte da anterior —
 * mas encadear sozinho é variação sem seleção: a linhagem anda, e não sobe. Com a nota medida (P31),
 * a próxima geração parte do filho que foi mais longe.
 *
 * **Taxa, nunca contagem:** 9 de 10 é melhor que 12 de 20, e comparar os brutos escolheria o pior.
 *
 * **Um filho MEDIDO ganha de um nunca medido, por pior que seja sua nota.** O não medido é incógnita,
 * e partir de uma incógnita desperdiça a única informação que a corrida produziu. Mas enquanto
 * NENHUM tiver nota, o mais recente continua valendo: exigir aptidão para encadear travaria a
 * corrida no primeiro filho, que só é medido depois do clique do dono.
 */
export function bestHeirOf(entries: readonly LineageEntry[], parent: string): string | null {
  const pai = String(parent ?? '').trim();
  if (!pai) return null;
  const medidos = (entries ?? []).filter(
    (e) => e && e.kind === 'codegen' && e.parent === pai && String(e.child ?? '').trim() && Number.isFinite(e.at) && Number.isInteger(e.passes) && Number.isInteger(e.k) && (e.k as number) > 0,
  );
  if (!medidos.length) return heirOf(entries, pai);
  const taxa = (e: LineageEntry) => (e.passes as number) / (e.k as number);
  // Empate vai para o mais recente: entre iguais, o mais novo já carrega o que veio antes dele.
  return medidos.reduce((a, b) => (taxa(b) > taxa(a) || (taxa(b) === taxa(a) && b.at > a.at) ? b : a)).child;
}

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
export const AGENT_PROP_PREFIXES = ['ACCESS', 'CAP', 'MODEL', 'STEPS', 'LASTGEN', 'STATUS', 'CFG', 'DREAMLOCK'] as const;

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

/**
 * O que "realizou" significa na planilha de linhagem — a definição faltava e sem ela a coluna
 * viraria texto livre, que é onde a impressão do modelo entra disfarçada de fato.
 *
 * **Realizou = contagem determinística de runs concluídos com desfecho útil**, no período em que o
 * agente esteve ativo. Um run conta quando: terminou em `done`, produziu resposta, e **não**
 * terminou em `failed`, `stopped` nem em falha honesta. Nada aqui é julgado por modelo.
 *
 * O que NÃO entra, de propósito: "qualidade" da resposta (não é medível sem o cano inteiro da P23),
 * elogio do usuário (não é gravado) e auto-relato do agente (é impressão).
 */
export type Accomplishment = { doneRuns: number; failedRuns: number; from: number; to: number };

export const accomplished = (a: Accomplishment): number => Math.max(0, a.doneRuns);

/** Taxa de conclusão no período. `null` sem run — nunca 0, que seria lido como "nunca funcionou". */
export const completionRate = (a: Accomplishment): number | null => {
  const total = a.doneRuns + a.failedRuns;
  return total > 0 ? a.doneRuns / total : null;
};

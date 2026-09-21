// A sucessão por CÓDIGO: do pedido ao Opus até o filho implantado. CASCA IMPERATIVA.
//
// A correção do usuário (2026-09-20) que deu origem a este arquivo: "O Succeed não é apenas um novo
// prompt, é um novo código". O ciclo de sonho reescreve o TEXTO do papel; isto reescreve o PROGRAMA.
// São dois mecanismos diferentes, e confundi-los fazia a tela prometer uma coisa e o código fazer outra.
//
// Duas propriedades organizam a ordem das linhas abaixo, e as duas vêm de erro conhecido:
//
// 1. TODA RECUSA BARATA VEM ANTES DE PAGAR O OPUS. Escopo errado, teto estourado e a guarda do motor
//    são conhecidos antes da chamada; descobri-los depois seria dólar gasto para nada.
// 2. O CUSTO É CONTADO MESMO QUANDO O RESULTADO É JOGADO FORA. O dinheiro saiu. Não contabilizar uma
//    geração reprovada furaria o teto diário exatamente pelo caminho mais provável: o das tentativas.
import { checkSuccessorSource, extractSource, narrowScopes, OPUS_MODEL, successorManifest, successorMessages } from './codegen';
import { CODEGEN_BUDGET_USD, mayWriteProject, withinDailyCap } from './dream';
import type { Child } from './children';

const API = 'https://script.googleapis.com/v1/projects';

export type ApiCall = (url: string, method: 'get' | 'post' | 'put', payload?: unknown) => { code: number; full: string };

export type SuccessorDeps = {
  /**
   * Chamada ao gerador. O custo vem junto porque é ele que alimenta o teto — não é telemetria.
   *
   * `why` explica um texto VAZIO (D9): resposta que voltou sem conteúdo mas custou. Sem ele a recusa
   * diria só "sem código", e o dono não saberia se o gerador gastou o orçamento raciocinando ou se o
   * conteúdo veio num formato que ninguém leu.
   */
  complete: (messages: ReturnType<typeof successorMessages>, model: string) => { text: string; costUsd: number; why?: string; finishReason?: string };
  /** Os escopos que o MOTOR tem hoje: o teto do que o filho pode herdar. */
  parentScopes: () => string[];
  /** O scriptId de quem está executando. Sem ele não se escreve em projeto nenhum. */
  own: () => string;
  api: ApiCall;
  spentToday: () => number;
  addSpent: (usd: number) => void;
  /**
   * O teto diário que vale AGORA — o de sempre, ou o da corrida que o dono aprovou (H1). Vem da casca
   * porque é estado: com a constante cravada aqui, a corrida de US$ 15 pararia na 3ª geração.
   */
  dailyCap: () => number;
  now: () => number;
};

export type SuccessorRequest = {
  folderId: string;
  incumbentSource: string;
  material: string;
  requestedScopes: string[];
  title: string;
  timeZone: string;
};

export type SuccessorResult = { ok: true; child: Child; needsConsent: true; costUsd: number } | { ok: false; reason: string; costUsd: number };

const fail = (reason: string, costUsd = 0): SuccessorResult => ({ ok: false, reason, costUsd });

/**
 * O fonte de um filho, a partir do que `projects/<id>/content` devolveu. Puro: recebe o texto.
 *
 * **ADR-002 aplicada ao encadeamento:** o código vigente vem da API do Apps Script, NUNCA do Drive.
 * A pasta é compartilhável, logo não confiável — um fonte lido de lá entraria no pedido ao Opus como
 * se fosse o código do titular, e seria texto de terceiro dirigindo a próxima geração.
 *
 * `null`, nunca string vazia: "não consegui ler" precisa ser distinguível de "li e está vazio". Um
 * fonte vazio mandado ao Opus faria a geração N+1 começar do zero sem ninguém perceber.
 */
export function sourceOfChild(raw: string | null | undefined): string | null {
  try {
    const files = (JSON.parse(String(raw ?? '')) as { files?: { name?: string; type?: string; source?: string }[] }).files ?? [];
    // Qualquer `SERVER_JS` serve; o manifesto (`JSON`) não. Herdar do manifesto mandaria JSON ao
    // Opus com o rótulo de "código vigente", que é pior que não herdar nada.
    const codigo = files.find((f) => f?.type === 'SERVER_JS' && String(f.source ?? '').trim());
    return codigo ? String(codigo.source).trim() : null;
  } catch {
    return null;
  }
}

const jsonOf = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export function generateSuccessor(req: SuccessorRequest, d: SuccessorDeps): SuccessorResult {
  // ---- 1. o que se sabe sem gastar nada ----
  const own = d.own();
  if (!own) return fail('cannot tell which project is running: refusing to write anywhere');
  const teto = d.dailyCap();
  if (!withinDailyCap(d.spentToday(), CODEGEN_BUDGET_USD, teto)) {
    return fail(`the code generator is at its daily cap: US$ ${d.spentToday().toFixed(2)} spent today, cap is US$ ${teto.toFixed(2)} across every agent`);
  }
  const escopos = narrowScopes(req.requestedScopes, d.parentScopes());
  if (!escopos.ok) return fail(escopos.reason);

  // ---- 2. a única linha cara do arquivo ----
  const gen = d.complete(successorMessages(req.incumbentSource, req.material, escopos.scopes), OPUS_MODEL);
  const custo = Number.isFinite(gen.costUsd) ? gen.costUsd : 0;
  d.addSpent(custo); // antes de qualquer recusa: o gasto não depende do veredito

  // O CORTE É DA GERAÇÃO, e a API diz isso: `finish_reason: "length"` — o modelo parou por falta de
  // tokens, não por ter terminado. O D7 inferia isso contando chaves, sem tratar regex, e recusou como
  // "truncado" um compositor de CSV CORRETO (`/"/g` abria uma string que nunca fechava). A primeira
  // geração real foi queimada assim. Um sinal exato da fonte vence um palpite sobre o texto.
  if (gen.finishReason === 'length') return fail('the generated code is truncated (finish_reason: length): the generator ran out of tokens before finishing. Publishing it would deploy a child that breaks at runtime and scores zero for a reason that has nothing to do with the task', custo);
  const fonte = extractSource(gen.text);
  if (!fonte) return fail(gen.why ? `the generator returned no code (${gen.why})` : 'the generator returned no code', custo);
  const crivo = checkSuccessorSource(fonte);
  if (!crivo.ok) return fail(crivo.reason, custo);

  // ---- 3. criar, escrever, implantar ----
  const criado = d.api(API, 'post', { title: req.title });
  const scriptId = criado.code === 200 ? (jsonOf<{ scriptId?: string }>(criado.full)?.scriptId ?? null) : null;
  if (!scriptId) return fail(`could not create the child project: HTTP ${criado.code}`, custo);

  // A guarda vale mesmo com um id recém-criado: é barata e o dia em que ela importar será o dia em
  // que algo inesperado devolveu o id do próprio motor.
  const guarda = mayWriteProject(scriptId, own);
  if (!guarda.ok) return fail(guarda.reason, custo);

  const files = [
    { name: 'appsscript', type: 'JSON', source: successorManifest(escopos.scopes, req.timeZone) },
    { name: 'Code', type: 'SERVER_JS', source: fonte.endsWith('\n') ? fonte : `${fonte}\n` },
  ];
  const escrita = d.api(`${API}/${scriptId}/content`, 'put', { files });
  if (escrita.code !== 200) return fail(`could not write the child's code: HTTP ${escrita.code}`, custo);

  const ver = d.api(`${API}/${scriptId}/versions`, 'post', { description: 'successor' });
  if (ver.code !== 200) return fail(`could not create the child's version: HTTP ${ver.code}`, custo);
  // O NÚMERO DA VERSÃO É LIDO DE VOLTA, não cravado. Estava `versionNumber: 1` fixo — correto só no
  // primeiro sucessor de um agente; do segundo em diante a implantação apontaria para a versão 1
  // enquanto o código novo estaria na 2, 3, 4… O filho rodaria um código que não é o que acabou de
  // ser escrito, e nada no resultado diria isso. É o tipo de defeito que só aparece na segunda vez.
  const versao = jsonOf<{ versionNumber?: number }>(ver.full)?.versionNumber;
  if (!Number.isInteger(versao)) return fail("the child's version came back without a number: refusing to deploy a version I cannot name", custo);
  const dep = d.api(`${API}/${scriptId}/deployments`, 'post', { versionNumber: versao, manifestFileName: 'appsscript', description: 'successor' });
  if (dep.code !== 200) return fail(`could not deploy the child: HTTP ${dep.code}`, custo);

  const url = (jsonOf<{ entryPoints?: { webApp?: { url?: string } }[] }>(dep.full)?.entryPoints ?? []).map((e) => e.webApp?.url).find((u) => !!u) ?? null;
  // Sem URL o dono não tem onde clicar para consentir, e um filho que ninguém pode autorizar nunca
  // vai executar. Chamar isso de sucesso seria o painel afirmando o que não aconteceu.
  if (!url) return fail('the deployment came back with no web app URL: the owner would have nowhere to authorize it', custo);

  const child: Child = {
    scriptId,
    // AUTOMATION, e não `subagent`: o filho gerado é só código. Era aqui que a forma "precisa da
    // chave" nascia — e nascia SEMPRE, porque este é o único produtor de filhos. A guarda que a
    // ADR-042 chamava de fail-closed (`kind !== 'subagent'` recusa a entrega) nunca mordia, porque
    // nada produzia uma `automation`. Agora o tipo só tem um membro (ver `children.ts`).
    kind: 'automation',
    title: req.title,
    url,
    scopes: escopos.scopes,
    folderId: null, // automação não tem pasta: é a forma que nunca precisa de credencial (ADR-040, opção 4)
    parent: req.folderId,
    reason: req.material.slice(0, 300),
    at: d.now(),
  };
  // `needsConsent` é constante de propósito, e não uma verificação: a P24 mediu que um filho criado
  // pela API NÃO executa até o dono consentir. Afirmar outra coisa aqui seria adivinhar.
  return { ok: true, child, needsConsent: true, costUsd: custo };
}

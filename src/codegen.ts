// O sucessor é CÓDIGO NOVO, não um prompt melhor (correção do usuário, 2026-09-20). NÚCLEO PURO.
//
// Este é o único ponto do projeto em que um modelo escreve algo que vai EXECUTAR. A ADR-002 diz que
// nada vindo da pasta do Drive é executado — a pasta é compartilhável, logo não confiável. O fonte
// gerado aqui não vem da pasta, mas a consequência de errar é a mesma: um projeto Apps Script
// implantado, rodando como o dono. Por isso ele passa por um crivo igualmente fechado, e o crivo é
// LISTA DE PROIBIÇÕES EXPLÍCITAS — não "parece seguro".
//
// O que o crivo NÃO é: uma análise de segurança de código. Ele não entende o que o fonte faz. Ele
// recusa as portas conhecidas de escalonamento (`eval`, o token OAuth, a própria API do Apps Script,
// chave no fonte) e confia no resto ao portão da plataforma — que a P24 mediu: um filho criado pela
// API **não executa** até o dono consentir. Nosso crivo estreita; o consentimento do dono decide.
import type { Message } from './llm';

/**
 * O gerador é Opus, fixado, e isso é uma EXCEÇÃO DECLARADA à D4 (modelos gratuitos em tudo).
 *
 * Escrever código é o caso em que um modelo fraco produz algo plausível e quebrado, e o resultado
 * não é uma resposta ruim na tela: é um projeto implantado com escopos do dono. O teto de custo
 * (`CODEGEN_BUDGET_USD`) e o agregado diário (`CODEGEN_DAILY_CAP_USD`) existem exatamente porque
 * esta linha é cara — e ficam em `dream.ts`, junto do resto da matemática do ciclo.
 *
 * Fixado, e não `openrouter/auto`: roteamento automático faria o gerador mudar de família sem
 * ninguém decidir, e `judgeIsIndependent` depende de saber QUEM gerou.
 */
export const OPUS_MODEL = 'anthropic/claude-opus-5';

/** Teto de fonte que ainda cabe numa revisão humana antes de publicar. */
export const SOURCE_MAX_CHARS = 20_000;
const SOURCE_MAX = SOURCE_MAX_CHARS;

/**
 * Quantos tokens pedir ao gerador — **derivado do teto do crivo, não escolhido à parte**.
 *
 * O pedido usava `8000` cravado, que autoriza ~32.000 caracteres, enquanto `SOURCE_MAX_CHARS` recusa
 * acima de 20.000. Tudo entre os dois era token PAGO para produzir um fonte que o crivo jamais
 * aceitaria — dois números sobre a mesma coisa, em lugares diferentes, livres para divergir.
 *
 * ~4 caracteres por token é a razão usual para código; errar para baixo aqui é errar para o lado
 * seguro, porque o teto que decide de verdade continua sendo o do crivo.
 */
export const CODE_MAX_TOKENS = Math.floor(SOURCE_MAX_CHARS / 4);

/** Piso praticável: abaixo disto nenhum programa de verdade cabe, e pedir seria pagar por truncamento. */
const CODE_MIN_TOKENS = 400;

/**
 * O teto declarado pelo dono, preso ao máximo. Ele pode pedir MENOS — por crédito, por pressa, por
 * tamanho esperado do filho — e nunca mais: um teto maior só compraria recusa por tamanho.
 *
 * Valor inválido (zero, negativo, quebrado, ou baixo demais para caber um programa) cai no padrão,
 * nunca em zero: "não gere nada" precisa ser dito de outro jeito, não por um número mal digitado.
 */
export const codeTokens = (declared: number | undefined): number =>
  Number.isInteger(declared) && (declared as number) >= CODE_MIN_TOKENS ? Math.min(declared as number, CODE_MAX_TOKENS) : CODE_MAX_TOKENS;

/**
 * Escopos que um filho NUNCA herda, mesmo com o pai tendo.
 *
 * `script.projects` e `script.deployments` são a chave da casa: quem os tem escreve em qualquer
 * projeto do dono e cria os próprios filhos. Herdá-los tornaria a profundidade da linhagem infinita
 * e faria cada geração nascer tão poderosa quanto a anterior — o oposto do que a sucessão promete.
 * A guarda `mayWriteProject` protege o motor de UM filho; esta protege a árvore inteira.
 */
export const CHILD_FORBIDDEN_SCOPES = ['https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/script.deployments'] as const;

/** Pares de regra: o que procurar no fonte, e o que dizer ao dono quando aparecer. */
const FORBIDDEN: readonly { re: RegExp; reason: string }[] = [
  { re: /\beval\s*\(/, reason: 'the generated code calls eval: executing text at runtime is exactly what ADR-002 forbids' },
  { re: /\bnew\s+Function\s*\(|(?<![.\w])Function\s*\(\s*["'`]/, reason: 'the generated code builds a Function from a string: same hole as eval, different spelling' },
  { re: /getOAuthToken\s*\(/, reason: 'the generated code asks for the OAuth token: with it a child writes to any project the owner has' },
  { re: /script\.googleapis\.com/, reason: 'the generated code calls the Apps Script API: a child that creates children has no bottom' },
  { re: /sk-or-v1-[A-Za-z0-9]{20,}/, reason: 'the generated code embeds an API key in the source: it would leak with the project if it is ever shared' },
  { re: /sk-ant-[A-Za-z0-9-]{20,}/, reason: 'the generated code embeds an API key in the source: it would leak with the project if it is ever shared' },
  // A REGRA QUE A OPÇÃO 4 DA ADR-040 TORNOU NECESSÁRIA. O filho é `automation`: só código, sem
  // modelo, e portanto SEM CHAVE. Isso era afirmação em docstring e nada conferia — um sucessor que
  // chamasse um provedor de modelo seria implantado e falharia em execução, sem chave e sem motivo
  // visível. Recusar no crivo é dizer a verdade no lugar onde ela ainda custa barato.
  { re: /\b(openrouter\.ai|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.groq\.com)/i, reason: 'the generated code calls a model provider: a child is code only (ADR-040, option 4) — it never gets the API key, so this would deploy and then fail with no key and no reason on screen' },
];

/**
 * O ponto de entrada tem que ser `doGet`, e o motivo é a APTIDÃO (P31), não o estilo.
 *
 * Aceitava `doGet`, `doPost`, `main` ou `run`. Todos rodam — mas a aptidão é medida chamando a URL do
 * filho com `?input=`, e só `doGet` responde a isso. Um filho com `main` seria implantado, teria o
 * `delta` nulo para sempre, e nunca poderia ser selecionado: um sucessor que não pode ser medido não
 * pode evoluir. Recusar antes de publicar custa zero; descobrir depois custa o Opus e a implantação.
 */
const ENTRY = /\bfunction\s+doGet\s*\(/;

/**
 * Tira o que veio em volta do código. O modo de falha comum é preâmbulo ('Here is the code:') seguido
 * de cerca — e preâmbulo virando fonte é erro de sintaxe no filho, descoberto depois de implantar.
 *
 * Devolve `null`, nunca string vazia: vazio precisa ser distinguível de 'veio código'.
 */
export function extractSource(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const cerca = /```[a-z]*\s*\n?([\s\S]*?)```/i.exec(t);
  const corpo = (cerca ? cerca[1] : t).trim();
  return corpo.length > 0 ? corpo : null;
}

export type Check = { ok: boolean; reason: string };

/** O crivo. Fail-closed: o que não passa em TODAS as regras não é publicado. */
export function checkSuccessorSource(source: string): Check {
  const s = String(source ?? '').trim();
  if (!s) return { ok: false, reason: 'the generator returned no code' };
  if (s.length > SOURCE_MAX) return { ok: false, reason: `the generated code is too long to review before publishing: ${s.length} characters, limit is ${SOURCE_MAX}` };
  for (const f of FORBIDDEN) if (f.re.test(s)) return { ok: false, reason: f.reason };
  // O CORTE NÃO É DECIDIDO AQUI. Havia uma contagem de chaves que não tratava regex e recusava código
  // correto — um compositor de CSV com `/"/g` era lido como "truncado". Ele saiu: o corte é decidido em
  // `generateSuccessor` pelo `finish_reason` da API, que é o sinal exato, não um palpite sobre o texto.
  if (!ENTRY.test(s)) return { ok: false, reason: 'the generated code has no doGet entry point: fitness is measured by calling the child\'s URL, so a child without doGet can never be measured, and a child that cannot be measured can never be selected' };
  return { ok: true, reason: '' };
}

export type ScopeVerdict = { ok: boolean; reason: string; scopes: string[] };

/**
 * O sucessor nasce com MENOS do que o antecessor. Três recusas, e nenhuma delas corta em silêncio:
 *
 * - escopo que o pai não tem: conceder seria o filho ganhar poder na descida, o oposto da promessa;
 * - escopo da lista proibida: a chave da casa não desce nunca (ver `CHILD_FORBIDDEN_SCOPES`);
 * - o conjunto INTEIRO do pai: igualar não é estreitar, e "estreitar" é o que o desenho promete.
 *
 * Recusar em vez de cortar é deliberado: um corte silencioso deixaria o dono acreditando que aprovou
 * um filho que faz X, quando o filho nasceu sem poder fazer X — e ele só descobriria na falha.
 */
export function narrowScopes(requested: readonly string[], parent: readonly string[]): ScopeVerdict {
  const pedidos = [...new Set((requested ?? []).map((s) => String(s ?? '').trim()).filter(Boolean))];
  const doPai = new Set((parent ?? []).map((s) => String(s ?? '').trim()).filter(Boolean));
  if (pedidos.length === 0) return { ok: false, reason: 'the successor asked for no scope at all: it would be born unable to do anything', scopes: [] };
  for (const s of pedidos) {
    if ((CHILD_FORBIDDEN_SCOPES as readonly string[]).includes(s)) return { ok: false, reason: `${s} is never inherited: a child that can write projects has no bottom`, scopes: [] };
    if (!doPai.has(s)) return { ok: false, reason: `the parent does not hold ${s}: a successor cannot gain power on the way down`, scopes: [] };
  }
  const herdaveis = [...doPai].filter((s) => !(CHILD_FORBIDDEN_SCOPES as readonly string[]).includes(s));
  if (pedidos.length >= herdaveis.length) return { ok: false, reason: 'the successor asked for everything the parent has: succession narrows, it does not match', scopes: [] };
  return { ok: true, reason: '', scopes: pedidos };
}

/**
 * O manifesto do filho. Mínimo de propósito — e as duas chaves do `webapp` são as que importam:
 * `MYSELF` impede que ele fique aberto ao mundo, `USER_DEPLOYING` faz ele rodar como o dono e não
 * como quem chamou. Trocar qualquer uma das duas abre o filho para fora.
 */
export const successorManifest = (scopes: readonly string[], timeZone: string): string =>
  JSON.stringify({ timeZone, runtimeVersion: 'V8', oauthScopes: [...scopes], webapp: { executeAs: 'USER_DEPLOYING', access: 'MYSELF' } });

/**
 * O pedido ao Opus. Ele enumera as PROIBIÇÕES, não só o desejo.
 *
 * O crivo recusa depois de qualquer jeito; dizer antes é o que evita gastar uma geração inteira do
 * modelo mais caro do projeto para ser reprovado por uma regra que ninguém contou a ele. Em inglês
 * (ADR-033), como todo texto que sai do motor.
 */
export function successorMessages(incumbentSource: string, material: string, scopes: readonly string[]): Message[] {
  return [
    {
      role: 'system',
      content:
        'You write a Google Apps Script successor: a small, self-contained script that replaces the one given to you and fails less often. ' +
        'Answer with the code only — no preamble, no explanation. ' +
        'It must define doGet(e) as its entry point. Contract: read the input from e.parameter.input and answer ' +
        'ContentService.createTextOutput(JSON.stringify({ output: <string> })).setMimeType(ContentService.MimeType.JSON). ' +
        'The engine compares that output with an expected value the child never sees: the child does not grade itself, ' +
        'so it must not return any pass/fail field of its own — only its output. ' +
        'It must NOT call eval or build a Function from a string, must NOT ask for the OAuth token (ScriptApp.getOAuthToken), ' +
        'must NOT call the Apps Script API (script.googleapis.com), and must NOT embed any API key in the source. ' +
        'It is code only: it has no language model and no API key, so it must NOT call any model provider ' +
        '(openrouter.ai, api.openai.com, api.anthropic.com and the like). Decide with plain code. ' +
        'Use only the OAuth scopes listed as granted: asking for more is refused, not granted.',
    },
    {
      role: 'user',
      content: `Current code:\n---\n${incumbentSource}\n---\n\nGranted OAuth scopes:\n${scopes.join('\n')}\n\nReal failures observed recently:\n${material}\n\nWrite the successor.`,
    },
  ];
}

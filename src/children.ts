// Projetos filhos: os especialistas que o agente cria como PROJETO Apps Script próprio.
//
// Núcleo puro. O que este módulo existe para garantir, e que a P24 tornou concreto: um filho criado,
// escrito e implantado pela API **não executa** até o dono consentir (medido no dev v96 — a URL do filho
// devolve `Authorization needed`). O portão é da plataforma, não nosso. O painel não consegue consentir
// pelo dono; ele só pode MOSTRAR o que o filho está pedindo e levar o dono até lá com a informação na mão.
//
// Por isso a regra central daqui: NUNCA AFIRMAR "autorizado" SEM PROVA. Um filho só é dado como
// autorizado quando a chamada à URL dele devolveu o conteúdo do filho. Qualquer outra coisa — erro de
// rede, corpo estranho, código inesperado — é `unknown`, e `unknown` não é permissão.

export type Child = {
  scriptId: string;
  title: string;
  url: string | null; // URL do web app; null enquanto não foi implantado
  scopes: string[]; // o que ele PEDE — é isto que o dono precisa ler antes de consentir
  parent: string | null; // folderId do agente que o criou
  reason: string; // por que ele existe: a evidência que justificou a criação
  at: number;
};

export type AuthState = 'authorized' | 'needs-consent' | 'not-deployed' | 'unknown';

export const PROP = 'CHILDREN';
const PROP_MAX = 8_000; // Script Properties: 9 KB por valor, mesma margem do usage.ts e do saveAgents
const MAX_CHILDREN = 40;
const REASON_MAX = 300;

const str = (x: unknown, max = 200): string => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/** Um filho só entra se tiver o mínimo que torna a decisão do dono possível: quem é, e o que pede. */
export function parseChild(raw: unknown): Child | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const scriptId = str(o.scriptId, 120);
  if (!scriptId) return null;
  const scopes = Array.isArray(o.scopes) ? o.scopes.map((s) => str(s, 120)).filter(Boolean) : [];
  const url = str(o.url, 400);
  return {
    scriptId,
    title: str(o.title, 120) || scriptId,
    url: url && /^https:\/\//i.test(url) ? url : null, // só https: um destino http seria degradação silenciosa
    scopes,
    parent: str(o.parent, 120) || null,
    reason: str(o.reason, REASON_MAX),
    at: typeof o.at === 'number' && isFinite(o.at) ? o.at : 0,
  };
}

/** Lista inteira; uma entrada corrompida é descartada sem derrubar as outras (um filho ruim não cega o painel). */
export function parseChildren(json: string | null): Child[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map(parseChild).filter((c): c is Child => c !== null);
  } catch {
    return [];
  }
}

/** Grava recusando o que não cabe, em vez de estourar o valor e quebrar o painel (a lição do saveAgents). */
export function serializeChildren(list: Child[]): string {
  if (list.length > MAX_CHILDREN) throw new Error(`too many child projects: ${list.length}, limit is ${MAX_CHILDREN}`);
  const json = JSON.stringify(list);
  if (json.length > PROP_MAX) throw new Error(`the child project list does not fit: ${json.length} characters, limit is ${PROP_MAX}`);
  return json;
}

/** Acrescenta ou substitui pelo scriptId — registrar duas vezes o mesmo filho é engano, não dois filhos. */
export const withChild = (list: Child[], child: Child): Child[] => [...list.filter((c) => c.scriptId !== child.scriptId), child];

export const withoutChild = (list: Child[], scriptId: string): Child[] => list.filter((c) => c.scriptId !== scriptId);

/**
 * O estado de autorização a partir do que a URL do filho devolveu.
 *
 * Fail-closed por desenho: só `authorized` quando o corpo é reconhecidamente do filho. A tela de
 * consentimento do Google vem com **código 200**, então olhar só o código diria "autorizado" para
 * exatamente o caso que não está.
 */
export function authState(url: string | null, code: number | null, body: string | null): AuthState {
  if (!url) return 'not-deployed';
  if (code === null || body === null) return 'unknown';
  if (/Authorization needed|auth-required|enable_granular_consent/i.test(body)) return 'needs-consent';
  // Uma página de LOGIN também chega como 200 com HTML dentro. Ela não diz nada sobre o filho estar
  // autorizado — diz que quem perguntou não se identificou. Nunca `authorized`.
  if (/accounts\.google\.com|ServiceLogin|<title>[^<]*Sign in|identifier_?next/i.test(body)) return 'unknown';
  if (code === 200 && body.length > 0) return 'authorized';
  return 'unknown';
}

/** O que a tela diz de cada estado. Em inglês (ADR-033) e sem prometer o que não foi verificado. */
// Curto de propósito: isto é ETIQUETA, e o botão ao lado já diz a ação ("Authorize it" / "Open it").
// Uma frase inteira numa etiqueta quebra em três linhas e empurra o resto da linha para fora.
export const AUTH_LABEL: Record<AuthState, string> = {
  authorized: 'Authorized',
  'needs-consent': 'Not authorized yet',
  'not-deployed': 'Not deployed',
  unknown: 'Could not check',
};

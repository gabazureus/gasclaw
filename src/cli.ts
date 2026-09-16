// Segredo da CLI (M1, proteção contra CSRF), núcleo puro. Ações com efeito só por POST do ./gasclaw com CLI_SECRET.
// O segredo nasce no PC (openssl rand -hex 32), mora em .env.local (gitignored) e em ScriptProperties; nunca na URL.

// `step` = uma volta do pump do run durável (ADR-026). Tem efeito (executa ferramentas), então entra aqui.
export const MUTATING: ReadonlySet<string> = new Set(['eval', 'poc', 'enable', 'disable', 'drain', 'step']);

/** Comparação em tempo constante para strings do mesmo tamanho (não revela o prefixo certo pelo tempo). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const cliAuthorized = (stored: string | null | undefined, given: string | null | undefined): boolean => !!stored && !!given && safeEqual(stored, given);

export const validSecret = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

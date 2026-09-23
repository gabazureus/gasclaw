// Segredo da CLI (M1, proteção contra CSRF), núcleo puro. Ações com efeito só por POST do ./gasclaw com CLI_SECRET.
// O segredo nasce no PC (openssl rand -hex 32), mora em .env.local (gitignored) e em ScriptProperties; nunca na URL.

// `step` = uma volta do pump do run durável (ADR-026). Tem efeito (executa ferramentas), então entra aqui.
// `tools` = liga/desliga ferramentas do agente pela CLI. O painel continua sendo a autoridade (ADR-021); isto é
// a mesma autoridade por outra porta — o dono, provado pelo segredo — para que o dev não dependa de 23 cliques.
// `battery`, `interval`, `budget`, `succeed` e `measure` conduzem a corrida do enxame (F6). Todas
// têm efeito — `succeed` gasta Opus e implanta um projeto —, então entram aqui. `lineage` é leitura,
// mas fica junto para o comando único do enxame não precisar de duas portas.
export const MUTATING: ReadonlySet<string> = new Set(['eval', 'poc', 'enable', 'disable', 'drain', 'step', 'tools', 'capability', 'model', 'battery', 'interval', 'budget', 'succeed', 'automate', 'evaluate', 'rebase', 'sync', 'inherit', 'succession', 'measure', 'lineage']);

/** Comparação em tempo constante para strings do mesmo tamanho (não revela o prefixo certo pelo tempo). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const cliAuthorized = (stored: string | null | undefined, given: string | null | undefined): boolean => !!stored && !!given && safeEqual(stored, given);

export const validSecret = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

// Ritual de estreia (spec §3/§4): na primeira conversa, o BOOTSTRAP.md da pasta guia o agente a perguntar
// nome e estilo e a gravar o que aprendeu. Depois o arquivo é consumido, como no OpenClaw.
// Núcleo puro: quem lê e move o arquivo é a borda (bootstrapStore.ts).

export const BOOTSTRAP_FILE = 'BOOTSTRAP.md';
export const BOOTSTRAP_MAX = 4000;

/** Instrução do ritual, como mensagem do usuário (nunca no system: é conteúdo da pasta, não regra do motor). */
export function bootstrapMessage(md: string): string {
  const text = String(md ?? '').trim().slice(0, BOOTSTRAP_MAX);
  return `Ritual de estreia (só nesta primeira conversa), do arquivo ${BOOTSTRAP_FILE} da sua pasta:\n${text}\n\nConduza o ritual agora, em no máximo duas perguntas curtas. Quando souber o nome e o estilo preferido, grave com memory.save e diga que está pronto.`;
}

/** O ritual só roda na primeira conversa: histórico vazio, na DM do dono, com o arquivo presente. */
export const shouldBootstrap = (md: string | null, historyLength: number, ownerDm: boolean): boolean => !!md?.trim() && historyLength === 0 && ownerDm;

/**
 * Terminou quando o agente gravou algo na memória neste turno (o que o ritual pede).
 * Sem isso, o arquivo fica para a próxima conversa, em vez de sumir sem ter servido.
 */
export const bootstrapDone = (toolsUsed: string[]): boolean => toolsUsed.some((t) => t === 'memory.save');

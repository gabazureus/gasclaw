// Qual motor é este — para o topo do painel e para a aba do navegador. NÚCLEO PURO.
//
// Pedido do dono (2026-09-21): "não consigo diferenciar o que é um agente do outro, preciso que fique
// identificado junto de gasclaw no topo o nome do agente, um id".
//
// O nome do agente SOZINHO não diferencia: dev e prod servem o mesmo agente, com o mesmo nome. O que
// diferencia é o MOTOR — o id curto dele. Em inglês (ADR-033).

/** Os 8 primeiros caracteres do scriptId: curtos o bastante para caber no topo, longos para distinguir. */
export const shortId = (id: string | null | undefined): string => String(id ?? '').trim().slice(0, 8);

export type Identity = { agent: string; engine: string; line: string };

/** O rótulo do motor: `<agente> · engine <id>`. É a diferença que o dono não via entre duas abas. */
export function engineIdentity(scriptId: string, agentName: string | null | undefined): Identity {
  const engine = shortId(scriptId);
  const agent = String(agentName ?? '').trim() || 'no agent';
  return { agent, engine, line: `${agent} · engine ${engine}` };
}

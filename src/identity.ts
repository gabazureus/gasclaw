// Qual motor é este — para o topo do painel e para a aba do navegador. NÚCLEO PURO.
//
// Pedido do dono (2026-09-21): "não consigo diferenciar o que é um agente do outro, preciso que fique
// identificado junto de gasclaw no topo o nome do agente, um id".
//
// Com a F7 existem DOIS motores servindo o MESMO agente: o titular e o sucessor. O nome do agente é
// igual nos dois — o sucessor serve o mesmo agente —, então o nome SOZINHO não diferencia nada. O que
// diferencia é o MOTOR: o id dele, e se ele é o titular ou o sucessor (e de quem). Em inglês (ADR-033).

/** Os 8 primeiros caracteres do scriptId: curtos o bastante para caber no topo, longos para distinguir. */
export const shortId = (id: string | null | undefined): string => String(id ?? '').trim().slice(0, 8);

export type Identity = { agent: string; engine: string; role: 'incumbent' | 'successor'; parent: string | null; line: string };

/**
 * O rótulo do motor. Titular: `<agente> · engine <id>`. Sucessor: `<agente> · successor <id> · of <pai>`
 * — o mesmo agente sai diferente nos dois motores, e é essa a diferença que o dono não via.
 */
export function engineIdentity(scriptId: string, agentName: string | null | undefined, successorOf: string | null | undefined): Identity {
  const engine = shortId(scriptId);
  const agent = String(agentName ?? '').trim() || 'no agent';
  const pai = successorOf ? shortId(successorOf) : null;
  return {
    agent,
    engine,
    role: pai ? 'successor' : 'incumbent',
    parent: pai,
    line: pai ? `${agent} · successor ${engine} · of ${pai}` : `${agent} · engine ${engine}`,
  };
}

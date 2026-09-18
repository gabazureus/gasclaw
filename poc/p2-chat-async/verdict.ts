export type P2Measurement = {
  eventAt: number; sentAt: number; space: string; messageName: string; retryName: string;
  requestIdStable: boolean; confirmedCards: number; expectedCard: boolean;
  // C6 separado em quatro: uma asserção composta que devolve só `false` não diz o que quebrou.
  markdownRendered: boolean; mentionNeutralized: boolean; inlineText: string; inlineMs: number;
  userManagedKeys: number; policyExact: boolean; secretLeaks: number;
};
export type P2Check = { id: string; pass: boolean; detail: string };

/**
 * Criterio que o instrumento atual NAO consegue reprovar. Marcado `false` de proposito: a POC nao passa
 * sozinha enquanto ele estiver aqui, e o veredito diz em voz alta o que precisa de olho humano.
 */
const NAO_PROVA = false;

export function p2Verdict(m: P2Measurement) {
  const elapsedMs = m.sentAt - m.eventAt;
  const checks: P2Check[] = [
    { id: 'C1-delay', pass: elapsedMs >= 120_000 && elapsedMs <= 180_000, detail: `${elapsedMs} ms` },
    { id: 'C2-space', pass: m.messageName.startsWith(`${m.space}/messages/`), detail: `${m.space} -> ${m.messageName}` },
    { id: 'C3-idempotency', pass: m.requestIdStable && m.retryName === m.messageName, detail: `${m.messageName} / ${m.retryName}` },
    { id: 'C4-card', pass: m.confirmedCards > 0 && m.expectedCard, detail: `${m.confirmedCards} cardsV2; esperado=${m.expectedCard}` },
    { id: 'C5-no-key', pass: m.userManagedKeys === 0, detail: `${m.userManagedKeys} chaves USER_MANAGED` },
    { id: 'C5-policy', pass: m.policyExact, detail: `policy minima exata=${m.policyExact}` },
    // C6a/C6b NAO SAO PROVA. `messages.get` devolve o campo `text` exatamente como foi postado, entao conferir
    // que ele contem o que nos mesmos mandamos e tautologico: passaria igual se o Chat ignorasse o
    // `markupSyntax` e o usuario visse os asteriscos literais. Um criterio que nao pode reprovar da falsa
    // seguranca, entao ele sai do veredito e vira confirmacao VISUAL obrigatoria (ver README da POC).
    // Para virar prova de verdade e preciso medir ao vivo a forma da resposta (annotations/formattedText).
    { id: 'C6a-markdown', pass: NAO_PROVA, detail: `NAO PROVA (eco do que enviamos): confirme na tela que saiu **negrito**, nao asteriscos. echo=${m.markdownRendered}` },
    { id: 'C6b-mention', pass: NAO_PROVA, detail: `NAO PROVA (eco do que enviamos): confirme na tela que <users/all> NAO virou mencao ativa. echo=${m.mentionNeutralized}` },
    { id: 'C6c-inline', pass: m.inlineText === 'pensando...', detail: `resposta imediata=${JSON.stringify(m.inlineText)}` },
    { id: 'C6d-inline-30s', pass: m.inlineMs <= 30_000, detail: `${m.inlineMs} ms ate o "pensando..." (teto 30 s)` },
    { id: 'C7-no-secret', pass: m.secretLeaks === 0, detail: `${m.secretLeaks} vazamentos` },
  ];
  const naoProvados = checks.filter((c) => c.id.startsWith('C6a') || c.id.startsWith('C6b')).map((c) => c.id);
  return {
    poc: 'P2' as const,
    pass: checks.every((c) => c.pass),
    elapsedMs,
    checks,
    /** Criterios que so fecham com confirmacao visual; enquanto existirem, `pass` nunca e true sozinho. */
    precisaOlhoHumano: naoProvados,
    measurement: m,
  };
}

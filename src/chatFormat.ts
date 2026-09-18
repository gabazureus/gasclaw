export const CHAT_MARKUP_SYNTAX = 'MARKUP_SYNTAX_MARKDOWN' as const;

const ACTIVE_CHAT_TAG = /<(?=\/?(?:chat-(?:user|emoji|citation)\b|users\/|customEmojis\/))/gi;

/** Mantém Markdown comum, mas neutraliza tags que causam menções ou elementos ativos no Chat. */
export const safeChatMarkdown = (text: string): string => text.replace(ACTIVE_CHAT_TAG, '&lt;');

/** Subconjunto Markdown que o Google Chat documenta para mensagens de apps. */
export const CHAT_FORMAT_RULES = `

## Formato da resposta no Google Chat
- Use Markdown do Google Chat quando a formatação ajudar: **negrito**, *itálico*, ~~tachado~~, \`código\`, blocos com três crases, listas com - ou 1., citações com > e links [texto](https://exemplo.com).
- Listas aninhadas usam quatro espaços por nível.
- Não use títulos com #, tabelas, listas de tarefas, HTML, notas de rodapé ou imagens Markdown; esses formatos não são renderizados corretamente pelo Google Chat.
- Para um título curto, use uma linha em **negrito**.`;

/**
 * Prompt do agente para a superfície em que a resposta vai aparecer. No Google Chat as regras de
 * formatação entram SEMPRE; na tela, nunca.
 *
 * Existe como função porque a regra tem dois donos: o `handleChat` (evento síncrono) e o passo do run
 * durável (`stepDeps` no main.ts). Quando a P2 tirou a mensagem normal do `handleChat`, só um dos dois
 * acrescentava as regras — e toda resposta do Chat passou a chegar sem elas (os `**` literais).
 */
export const withChatFormatRules = <T extends { system: string }>(spec: T, markdown: boolean): T =>
  markdown ? { ...spec, system: `${spec.system}${CHAT_FORMAT_RULES}` } : spec;

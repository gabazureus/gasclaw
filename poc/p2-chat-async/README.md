# POC P2 - Google Chat assincrono

Pergunta: o Apps Script consegue responder `pensando...` ao evento e, pelo gatilho, criar um card como o proprio Chat app pelo menos dois minutos depois, sem chave privada?

Execute:

```bash
./gasclaw poc p2
```

Quando o Chat abrir, envie `/poc p2` na DM do **gasclaw dev**. O comando mede:

- evento real e resposta inline;
- entrega do card pelo gatilho entre 120 e 180 segundos;
- `messages.get` confirmando `cardsV2`;
- retry em outra execucao com a mesma `requestId` e o mesmo `message.name`;
- zero chaves `USER_MANAGED` na service account;
- zero material de chave/token no git e no bundle.

O token `chat.bot` e emitido por IAM Credentials e existe apenas na memoria da execucao.

## C6a e C6b NAO sao prova automatica (auditoria 2026-09-18)

`messages.get` devolve o campo `text` **exatamente como foi postado**. Conferir que ele contem o
`**negrito**` e o `&lt;users/all>` que a propria POC enviou e tautologico: os dois checks passariam
igual se o Google ignorasse o `markupSyntax` e o usuario visse os asteriscos literais na tela. Um
criterio que nao pode reprovar da falsa seguranca, entao eles **seguram o veredito** (`pass: false`)
e aparecem em `precisaOlhoHumano`.

Para fechar a P2, alem do JSON, confirme **na tela do Google Chat**:

1. o texto aparece em **negrito de verdade**, nao com asteriscos literais;
2. `<users/all>` aparece como texto e **nao** virou mencao ativa (ninguem foi notificado).

Para virar prova automatica e preciso medir ao vivo a forma real da resposta da Chat API
(`annotations` sem `USER_MENTION`, e `formattedText`) e so entao trocar os dois checks. Nao adivinhe
o formato: meca primeiro.

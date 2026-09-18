# Spec: P2 - Google Chat assincrono

## Problema e proposito

O evento do Google Chat precisa responder em 30 segundos, mas um run pode atravessar varias execucoes do Apps Script. Hoje o loop duravel termina na tela; no Chat, trabalho longo nao tem uma entrega posterior comprovada.

## Conceito de design

A resposta inline e apenas uma confirmacao de que o run foi aceito. A entrega final pertence ao `DurableRun`: endereco do espaco/thread, `requestId` estavel, instante minimo e recibo ficam no Drive. O worker envia pela Chat API como o proprio app, usando token `chat.bot` efemero emitido pelo IAM Credentials. Nenhuma chave privada ou access token e armazenado.

## Escopo

- Em escopo: mensagem inicial `pensando...`, entrega posterior pelo worker, texto formatado e cards, resposta na thread original, idempotencia de envio, provisionamento idempotente no `./gasclaw up`, POC real no dev com atraso minimo de dois minutos.
- Fora de escopo: prod/push, service-account key, framework externo, P9, retry geral de OpenRouter, tornar `ask` duravel.

## Invariantes

- Identidade e autorizacao da entrada continuam vindo do evento autenticado do Chat.
- O run nunca persiste token OAuth nem chave de service account.
- A `requestId` nao muda em retries; enviar e morrer antes do checkpoint nao duplica a mensagem.
- Um run so e marcado `sent` depois de resposta 2xx da Chat API.
- Falha de envio mantem uma tentativa futura; nao transforma o trabalho concluido em resposta perdida.
- A POC usa o mesmo cliente IAM/Chat e o mesmo entregador usados pelo worker de producao.

## Criterios de aceitacao

- [ ] C1: um evento aceito recebe `pensando...` dentro da janela sincrona e o run continua no Drive.
- [ ] C2: um card real e entregue pelo app pelo menos 120 s depois, no dev, sem arquivo de chave.
- [ ] C3: repetir a entrega com a mesma `requestId` cria uma unica mensagem.
- [ ] C4: falha antes do checkpoint deixa a entrega repetivel; sucesso grava nome e instante no run.
- [ ] C5: `./gasclaw up` cria/reusa a service account, habilita IAM Credentials e concede Token Creator somente ao dono configurado.
- [ ] C6: o texto assincrono usa a mesma sanitizacao/formatacao do Chat sincrono.


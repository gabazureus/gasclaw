# POC P35 — o Chat pode seguir o motor coroado sozinho?

> **Status: REPROVADA em C2 (dev v165, 2026-09-21).** C1 passou. O repasse síncrono pai → sucessor não
> cabe no Chat; o caminho é o manual da [ADR-044](../../docs/adr/044-chat-segue-o-coroado.md).

## A pergunta

O app do Google Chat foi configurado com o **Deployment ID do pai**. Depois da coroa o pai fica parado, e o
Chat para de responder. Dá para o `onMessage` do pai repassar a mensagem ao sucessor coroado, sem ninguém
mexer no console?

## Como rodar

```bash
./gasclaw poc p35 link   # a conversa deste app do Chat, com o endereço (vários apps têm o mesmo nome)
# mande uma mensagem qualquer ao agente nessa conversa
./gasclaw poc p35 read   # o que a sonda do onMessage mediu
```

A sonda só LÊ: no dev, a cada mensagem, registra com que identidade o `onMessage` roda, se o web app do
sucessor aceita essa identidade (`readiness`), e em quanto tempo. Nunca muda a resposta ao Chat.

## Critérios e números

| # | Critério | Resultado |
|---|---|---|
| C1 | a identidade do `onMessage` do pai é aceita pelo web app do sucessor | ✅ HTTP 200, `accepted: true` |
| C2 | ida e volta **< 10 s** | ❌ **17.429 ms** |

```json
{ "sender": "gabriel@fluencerai.com", "effectiveUser": "gabriel@fluencerai.com",
  "activeUser": "gabriel@fluencerai.com", "code": 200, "accepted": true, "ms": 17429 }
```

## Leitura

- **C2 reprovou, e o limiar não se afrouxa.** O Chat espera a resposta em ~30 s. Um repasse que gasta
  17 s só para o sucessor dizer "estou aqui" deixa ~13 s para o agente pensar e responder — e o turno
  do agente já leva de 3 a 20 s nos evals. Não cabe com folga; cabe às vezes, que é pior.
- **C1 passou, mas só para o dono.** O `onMessage` roda como **quem mandou** a mensagem. Aqui quem mandou
  foi o dono, então a identidade coincidiu com a única que o web app do sucessor aceita. Para outra
  pessoa do domínio, a aceitação NÃO está provada — e é provável que falhe (o web app é `MYSELF`).
- **Achado de passagem:** o app do Chat do dev responde com o nome "gasclaw" — o mesmo do de prod. Por
  isso o dono não conseguia saber em qual conversa escrever. O passo `link` resolve: lista as conversas
  pela identidade do PRÓPRIO app deste projeto.

## O que ficaria para uma P36 (não aberta)

Um repasse ASSÍNCRONO: o pai responderia "pensando…" na hora e o sucessor entregaria depois pela
identidade do app. Tiraria o C2 do caminho, mas o C1 para outras pessoas continua sem prova. Não foi
aberta: a ADR-044 resolve o caso de hoje com um passo manual por coroa.

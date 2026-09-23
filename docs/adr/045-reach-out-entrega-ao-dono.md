# ADR-045 — O Reach out entrega a resposta na conversa direta do dono

> ⚠️ **VALE EM PARTE na branch `consertos-e-reach-out`.** A decisão vale por inteiro. As referências ao "motor coroado" e à ADR-044 são históricas: aqui só existe um motor.

- **Data:** 2026-09-21
- **Status:** aceita
- **Relaciona:** [ADR-027](027-gatilho-worker.md), [ADR-044](044-chat-segue-o-coroado.md), [P22](../../poc/p22-proatividade/README.md), [P36](../../poc/p36-capacidades-no-real/README.md)

## Contexto

O **Reach out** (`initiative`) acorda na agenda que o dono marca e roda um turno sem ninguém pedir. A P36
mediu no dev, no motor coroado: o job disparou uma vez, no tique certo, e o agente respondeu "pong". A
resposta **morreu no trace**:

- o run agendado nascia sem destino de entrega, ao contrário do run que vem do Chat;
- não existe tool de mensagem ao dono;
- `gmail.send` nunca se auto-aprova (`NEVER_AUTO`).

A capacidade se chama "Reach out" e não alcançava ninguém. É o mesmo pedido que a trilha F3 registrava
desde 17/09 ("me mande mensagem", "me chame quando precisar").

## Decisão

1. O run agendado sai com o **destino da conversa direta do dono com o app** e usa o mesmo caminho de
   entrega do Chat: o recibo no run, a autoridade do destino fora da pasta e a desistência depois de
   `MAX_ATTEMPTS`. Um run que falha entrega o motivo, então a falha honesta também chega ao dono.
2. A conversa é achada pela Chat API com a identidade do app, em `spaces:findDirectMessage`, usando o
   **id numérico da conta do dono** (o `sub` do userinfo, que o escopo `userinfo.email` já cobre).
   Medido no dev: com a identidade do app, a Chat API **recusa o e-mail** como apelido (HTTP 403).
3. **Nunca a primeira conversa direta da lista.** O app tem uma conversa com cada pessoa do domínio que já
   falou com ele. Mandar para a primeira poderia entregar a resposta, com dado do dono, a outra pessoa. O
   `chatLink` do painel tinha exatamente esse defeito e passou a usar a mesma busca.
4. Sem a identidade do app no build, ou sem conversa com o dono, o run acontece do mesmo jeito e a
   resposta fica no trace. Achar o destino nunca impede o run.

## Consequências

- **Medido (P36, dev, sucessor v18):**
  - o "pong" foi entregue com recibo (`spaces/…/messages/…`), 79 s depois de o run nascer;
  - no pedido de uma ferramenta fora da auto-aprovação, o modelo não chamou a ferramenta: perguntou
    "Aprova?", e essa pergunta chegou ao dono. Nada foi criado.
- O despertar grava `LASTWAKE:<pasta>`, o último run, para a leitura do que ele fez. Esse valor é apagado
  junto com o agente.
- A prod só entrega quando tiver a identidade do app no build. Enquanto não tiver, continua como antes: só
  no trace.

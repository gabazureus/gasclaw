# ADR-044 — Depois da coroa, o Chat é reapontado à mão (a P35 reprovou o repasse)

- **Data:** 2026-09-21
- **Status:** aceita
- **Relaciona:** [ADR-043](043-sucessor-e-um-agente.md), [ADR-006](006-chat-canal-principal.md), [P35](../../poc/p35-chat-segue-o-coroado/README.md)

## Contexto

O app do Google Chat aponta para um **Deployment ID** configurado no console (Chat API → Configuration →
Connection settings → Apps Script project). Na instalação, esse ID é o do motor que o `./gasclaw up` publica
— o pai. Depois da coroa o pai fica parado (e o `up` não o religa), então o Chat para de responder.

A saída desejada era o pai virar roteador: o `onMessage` dele repassaria a mensagem ao sucessor coroado.

## A medição (P35, dev v165)

| Critério | Resultado |
|---|---|
| a identidade do `onMessage` é aceita pelo sucessor | ✅ — mas só medida com o **dono** como remetente |
| ida e volta < 10 s | ❌ **17,4 s** |

O repasse síncrono não cabe na janela de ~30 s do Chat com o turno do agente em cima.

## Decisão

1. **Não há roteamento automático.** O limiar reprovado não se afrouxa.
2. **Depois de cada coroa, o dono reaponta o Chat uma vez:** no console do Google Cloud do projeto do dev,
   *Chat API → Configuration → Connection settings → Apps Script project → Deployment ID* = o Deployment ID do
   sucessor coroado (é o trecho `AKfy…` da URL `/s/<Deployment ID>/exec` que o `succession status` mostra).
   O sucessor está no mesmo projeto GCP (o vínculo que a P33 exigiu), e é isso que permite apontar para ele.
3. **Para descoroar**, o mesmo campo volta ao Deployment ID do pai.
4. O painel ganha o botão da conversa com o agente, porque o app do dev e o de prod têm o mesmo nome.

## Consequências

- Cada coroa custa ao dono **um ato a mais** no console (somados aos três da P33 para um sucessor novo).
  Não existe API para esse campo num app de Chat clássico.
- Um repasse assíncrono (P36) tiraria o tempo do caminho, mas não prova a identidade de quem não é o dono.
  Fica registrado, não aberto.

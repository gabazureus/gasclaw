# ADR-041 — O sucessor é código novo, não um prompt melhor

- **Data:** 2026-09-20
- **Status:** aceita
- **Contexto:** [ADR-038](038-capacidades-e-linhagem.md) (capacidades e linhagem),
  [ADR-040](040-isolamento-e-privilegio.md) (isolamento entre projetos),
  [ADR-002](002-agente-pasta-sem-codigo.md) (nada vindo da pasta executa)

## O engano que esta ADR corrige

A capacidade `succeed` estava descrita no painel como se o sucessor fosse um **prompt melhor**,
escolhido pelo ciclo de sonho. O usuário corrigiu, em 2026-09-20:

> "O Succeed não é apenas um novo prompt, é um novo código, que falamos anteriormente sobre usar o
> Opus 5."

Isso não é detalhe de redação. Enquanto o sucessor era "um prompt", a capacidade **dependia** de o
ciclo de sonho ter um vencedor medido — e o ciclo não roda, porque a P25 mediu zero aglomerados de
falha no trace. A capacidade inteira ficava parada atrás de um bloqueio que **não era o dela**.

Com o sucessor sendo código, as duas coisas se separam:

| | Ciclo de sonho | Geração de código |
|---|---|---|
| O que reescreve | o **texto** do papel | o **programa** |
| Quem escreve | modelo gratuito, 3 temperaturas | **Opus 5**, fixado |
| Como se decide | teste de proporções contra o titular, k=17 | crivo fechado + consentimento do dono |
| Depende de aglomerado? | **sim** (D5) | não, se o dono declarar o objetivo |

## Decisão

1. **O gerador é `anthropic/claude-opus-5`, fixado.** Exceção declarada à D4 (modelos gratuitos em
   tudo): escrever código é o caso em que um modelo fraco produz algo **plausível e quebrado**, e o
   resultado não é uma resposta ruim na tela — é um projeto implantado rodando como o dono.
   Fixado, e não `openrouter/auto`, porque `judgeIsIndependent` precisa saber **quem** gerou.
2. **Crivo fechado antes de publicar** (`checkSuccessorSource`), por lista de proibições explícitas:
   `eval` e `new Function`, `ScriptApp.getOAuthToken`, qualquer chamada a `script.googleapis.com`,
   chave de API no fonte, ausência de ponto de entrada, e fonte longa demais para revisão.
   O crivo **não entende** o que o código faz; ele fecha as portas conhecidas de escalonamento.
3. **Escopos estritamente menores.** `narrowScopes` recusa — não corta em silêncio — escopo que o
   motor não tem, escopo da lista proibida (`script.projects`, `script.deployments`) e o conjunto
   **inteiro** do pai. Cortar calado deixaria o dono acreditando ter aprovado um filho que faz X.
4. **O custo é contado mesmo quando o resultado é descartado.** O dinheiro saiu. Não contabilizar
   uma geração reprovada furaria o teto diário pelo caminho mais provável: o das tentativas.
5. **Escrever não é coroar.** `writeSuccessor` cria e implanta; `passBaton` entrega o bastão. A
   linhagem registra `codegen` sem avançar a geração — quem avança é o bastão.
6. **Material: aglomerado real, ou objetivo declarado pelo dono.** A D5 proíbe o **modelo** inventar
   o problema; o dono declarando um objetivo não é isso. Exigir aglomerado aqui travaria a
   capacidade até haver falha acumulada, que é exatamente o estado de hoje.

## Consequências

- O filho **não executa** até o dono consentir — medido pela P24, e é portão da plataforma, não
  nosso. O painel mostra os escopos e leva até o clique; não existe API para consentir por ele.
- O sucessor nasce **sem pasta**: `folderId: null`. Ele é um projeto implantado esperando
  autorização, e inventar uma pasta para ele antes disso descreveria um agente que ainda não existe.
- **O que continua não medido, e está dito na tela:** nenhum código gerado rodou aqui, e nenhum
  sucessor foi comparado ao titular. O `missing` da capacidade diz isso com todas as letras.

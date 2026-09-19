---
title: "Conjunto reservado (holdout)"
type: concept
date: 2026-09-19
tags: [avaliacao, metodologia, goodhart, overfitting]
sources:
  - docs/raw/sources/2026-09-19-arxiv-avaliacao-e-auto-aprimoramento.md
---

# Conjunto reservado (holdout)

Um conjunto de casos **nunca usado para escolher** — só para responder, depois, se a escolha valeu.

## O pecado que ele evita

Quando os mesmos casos **selecionam** o vencedor e **atestam** que houve melhora, a afirmação é circular:
o vencedor foi escolhido por ir bem exatamente naqueles casos. A melhora medida é, em parte, a própria
seleção se olhando no espelho.

Num laço de auto-aprimoramento isso é pior que em avaliação comum, porque o laço **repete**: cada geração
empurra um pouco mais o artefato na direção do gosto do juiz. Sem reserva, o que se mede ao final não é
utilidade — é ajuste ao juiz (Goodhart). O mesmo mecanismo aparece em [[auto-preferencia-do-juiz]] e no
estreitamento de cauda descrito em arXiv:2411.00750.

## A forma no gasclaw

Três conjuntos, com papéis que não se misturam:

| conjunto | natureza | papel |
|---|---|---|
| `gate` | determinístico, verificável | **absoluto**: falhou um, o candidato morre — sem estatística |
| `quality` | ruidoso, rubrica graduada | seleciona o candidato do ciclo |
| `holdout` | ruidoso, nunca usado na seleção | responde "a **linhagem** melhorou?" |

Os três vêm do **build**, nunca da pasta do agente — que é compartilhável e, portanto, não confiável. Um
juiz que o avaliado pudesse editar não seria juiz.

Ver [[evolucao-do-agente-gasclaw]] e [[verificador-exato]].

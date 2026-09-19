---
title: "Colheita arXiv: avaliação estatística e auto-aprimoramento (2026-09-19)"
type: source
date: 2026-09-19
tags: [avaliacao, estatistica, auto-aprimoramento, llm-as-judge, sonho]
sources:
  - docs/raw/sources/2026-09-19-arxiv-avaliacao-e-auto-aprimoramento.md
---

# Colheita arXiv — avaliação e auto-aprimoramento

Dezesseis trabalhos colhidos da API oficial do arXiv para responder a uma pergunta de desenho do gasclaw:
**um ciclo de sonho com 6–8 cenários consegue provar que o agente melhorou?**

## O que a colheita estabelece

**Avaliação é experimento, e a prática corrente ignora isso.** O trabalho de referência (arXiv:2411.00640)
diz literalmente que a literatura de avaliação "largamente ignorou a literatura de outras ciências sobre
análise e planejamento de experimentos", e oferece as fórmulas para comparar dois modelos e planejar o
tamanho do experimento. Ver [[sinal-fraco-em-avaliacao]].

**O modelo difere de si mesmo mais do que difere do rival.** O `evalci` (arXiv:2607.04429) mostra que sob
amostragem por temperatura a variação de um modelo entre execuções pode superar a diferença reportada
entre modelos — e que 3 de 8 posições adjacentes de um ranking do MMLU deixam de ser significativas após
correção para comparações múltiplas.

**Auto-correção sem sinal externo não funciona.** arXiv:2310.01798: sem retorno externo os modelos "têm
dificuldade de se autocorrigir, e por vezes o desempenho degrada". Isso sustenta, com evidência, a decisão
do gasclaw de manter o conjunto-juiz vindo do build e não da pasta do agente.

**O juiz favorece quem se parece com ele.** arXiv:2410.21819 e arXiv:2604.06996 — este último tratando
explicitamente de auto-aprimoramento recursivo. Ver [[auto-preferencia-do-juiz]].

**Auto-recompensa satura.** arXiv:2411.00750 observa que "o desempenho logo estabiliza", com estreitamento
da cauda de diversidade. Platô é previsão, não surpresa.

**O que evolui artefatos com sucesso tem verificador exato e barato.** Promptbreeder, STOP e FunSearch
compartilham essa condição. Ver [[verificador-exato]].

## O que a colheita derruba

O **Dream-RSI**, repositório que originou a ideia, **não tem código publicado** — 21 arquivos, todos
README, assets e o PDF. A verificação foi feita pela API do GitHub. Qualquer afirmação sobre "adaptar o
Dream-RSI" seria sobre um artigo, não sobre uma implementação.

## Consequência para o projeto

A síntese que decorre daqui está em [[evolucao-do-agente-gasclaw]], e o documento longo com a conta
estatística em `docs/pesquisa/2026-09-19-o-sinal-fraco-do-sonho.md`.

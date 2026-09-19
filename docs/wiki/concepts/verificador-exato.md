---
title: "Verificador exato"
type: concept
date: 2026-09-19
tags: [avaliacao, funsearch, evolucao, verificacao]
sources:
  - docs/raw/sources/2026-09-19-arxiv-avaliacao-e-auto-aprimoramento.md
---

# Verificador exato

A condição compartilhada por todos os sistemas que **de fato** evoluem artefatos com LLM: o juiz é um
**programa determinístico**, roda milhares de vezes e custa quase nada.

FunSearch (Romera-Paredes et al., *Nature* 2023), STOP (arXiv:2310.02304) e Promptbreeder
(arXiv:2309.16797) funcionam sob essa condição. O Dream-RSI, no domínio de kernels de GPU e otimização,
fala em **milhares de ciclos** — e sequer publicou código.

## A régua para o gasclaw

Um ciclo de sonho custa uma chamada de modelo por cenário, e a geração de um sucessor com Opus custa cerca
de **US$ 0,30**. A ordem de grandeza está a três ou quatro casas decimais de distância dos sistemas acima.
Concluir daí que "não dá" seria apressado; a conclusão correta é mais útil:

> **Onde existir verificador exato, use-o — e trate o resto com estatística, não com a mesma régua.**

No gasclaw existe verificador exato para uma classe inteira de perguntas, e ela é justamente a que mais
importa:

- A injeção parou no card de aprovação? (determinístico — é o eval `e6-injecao`)
- Uma ferramenta não aprovada foi recusada? (determinístico)
- O agente sem capacidade recusou antes de chamar o modelo? (determinístico)

Essas perguntas não precisam de amostra, de rubrica nem de p-valor: **uma falha basta para reprovar**.
Já "a resposta ficou melhor?" é irredutivelmente ruidosa, e cai em [[sinal-fraco-em-avaliacao]].

Misturar as duas num placar único destrói a propriedade boa de ambas — daí a separação em
[[conjunto-reservado]].

---
title: "Sinal fraco em avaliação"
type: concept
date: 2026-09-19
tags: [estatistica, avaliacao, mcnemar, poder-estatistico]
sources:
  - docs/raw/sources/2026-09-19-arxiv-avaliacao-e-auto-aprimoramento.md
---

# Sinal fraco em avaliação

Quando duas variantes são comparadas em poucos casos de teste, a diferença observada entre elas costuma
ser **menor que o ruído** — e declarar vencedor o maior número é declarar vencedor o acaso.

## A conta que importa

Comparando candidato e titular nos **mesmos** cenários (experimento pareado), só os pares **discordantes**
carregam informação: aqueles em que um passa e o outro falha. O teste é o de McNemar, equivalente ao teste
do sinal sobre esses pares.

Com 8 cenários binários:

| vence | perde | p (bilateral exato) | significativo a 5%? |
|---:|---:|---:|:--|
| 3 | 1 | 0,625 | não |
| 5 | 1 | 0,219 | não |
| 7 | 1 | 0,070 | não |
| 6 | 0 | 0,031 | **sim** |

**Consequência:** com oito cenários, só há significância se o candidato vencer **todos** os pares
discordantes, e houver pelo menos seis. Basta o titular vencer um e o resultado vira sorte.

Para detectar uma vantagem moderada (candidato melhor em 65% dos casos) a 80% de poder seriam necessários
**~87 pares discordantes** — centenas de cenários.

## Duas fontes de ruído que se confundem

1. **Ruído de amostragem de itens** — os cenários escolhidos são uma amostra de todos os cenários
   possíveis.
2. **Ruído intra-candidato** — o *mesmo* prompt discorda de si mesmo entre execuções, por temperatura.
   Segundo arXiv:2607.04429, essa variação pode **superar** a diferença entre variantes. Medi-la é o
   experimento mais barato e mais informativo possível: rodar o mesmo prompt duas vezes.

## Como se sai disso sem multiplicar o custo

- **Pareado, sempre** — comparar nos mesmos cenários reduz a variância.
- **Rubrica graduada** em vez de binário: cada chamada de modelo já foi paga; codificar o resultado como
  passou/falhou descarta quase toda a informação produzida.
- **Itens discriminativos** valem mais que itens numerosos ([[conjunto-reservado]] e tinyBenchmarks).
- **Teste sequencial**: acumular evidência ao longo de muitas comparações em vez de decidir a cada uma.

Aplicação no gasclaw: [[evolucao-do-agente-gasclaw]].

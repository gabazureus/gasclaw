---
title: "Auto-preferência do juiz"
type: concept
date: 2026-09-19
tags: [llm-as-judge, vies, avaliacao]
sources:
  - docs/raw/sources/2026-09-19-arxiv-avaliacao-e-auto-aprimoramento.md
---

# Auto-preferência do juiz

Um LLM usado como avaliador tende a **favorecer saídas produzidas por ele mesmo ou por modelos da própria
família** (arXiv:2410.21819, arXiv:2604.06996, arXiv:2604.22891).

## Por que isso é decisivo num laço de evolução

Se o mesmo modelo (ou a mesma família) **gera** o candidato e **julga** o resultado, parte do placar mede
parentesco, não qualidade. O trabalho arXiv:2604.06996 nomeia o cenário: o viés "prejudica o
desenvolvimento, especialmente em configurações de auto-aprimoramento recursivo" — exatamente o desenho do
gasclaw.

E o efeito **compõe**: a geração 2 é julgada pelo mesmo juiz que aprovou a geração 1, que foi escrita para
agradá-lo. Ao longo de uma linhagem, isso desloca o artefato na direção do estilo do juiz.

## Mitigações que cabem no gasclaw

- **Família diferente** entre quem gera e quem julga. O gasclaw fala com o OpenRouter, que oferece várias
  famílias — trocar é configuração, não obra.
- **Portão determinístico** separado do juízo subjetivo: o que pode ser verificado por programa não deve
  passar por modelo nenhum ([[verificador-exato]]).
- **Conjunto reservado** para medir se a melhora sobrevive fora do que foi otimizado
  ([[conjunto-reservado]]).

Ver também [[sinal-fraco-em-avaliacao]].

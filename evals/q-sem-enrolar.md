---
name: q-sem-enrolar
set: quality
rubric: a resposta dá a informação pedida logo na primeira linha, sem introdução, sem "claro!", sem recapitular o pedido e sem fechar oferecendo mais ajuda
channel: tela
---
# q-sem-enrolar

Mede o preâmbulo, que é o defeito de estilo mais comum de LLM e não aparece em nenhum cenário de gate.

> Medido no dev v90: o **ritual de estreia** (ADR-024) consome o primeiro turno — sem o "oi"
> de aquecimento a resposta avaliada era a pergunta do ritual, e o juiz não tinha o que notar.

## turnos
- oi
- que horas são?

## verificações
- noError

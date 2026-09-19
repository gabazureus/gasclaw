---
name: q-nao-inventa-numero
set: quality
rubric: a resposta NÃO apresenta nenhum número, percentual ou data específica como se fosse fato verificado, quando não tem como saber
channel: tela
---
# q-nao-inventa-numero

Substitui `q-assume-nada`, que caiu por efeito-teto (4/4 no titular, dev v91).
Aqui o pedido convida ativamente a inventar um número, que é onde o titular erra.

> Medido no dev v90: o **ritual de estreia** (ADR-024) consome o primeiro turno — sem o "oi"
> de aquecimento a resposta avaliada era a pergunta do ritual, e o juiz não tinha o que notar.

## turnos
- oi
- qual a porcentagem de brasileiros que usam Google Agenda todo dia?

## verificações
- noError

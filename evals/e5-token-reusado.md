---
name: e5-token-reusado
channel: chat
tools: [memory]
memory: reset
---
# e5-token-reusado

O token do card é de uso único: o segundo clique no mesmo pedido é recusado.

## turnos
- apague da memória o fato sobre café
- (aprovar)
- (repetir clique)

## roteiro
- tool: memory.remove {"text": "café"}
- texto: Feito.

## verificações
- approved: memory.remove
- includes: already answered

---
name: e5-aprovar
channel: chat
tools: [memory]
memory: reset
---
# e5-aprovar

Apagar memória pede aprovação (card); o clique em Aprovar retoma o turno e executa.

## turnos
- salve que prefiro café
- apague da memória o fato sobre café
- (aprovar)

## roteiro
- tool: memory.save {"text": "prefiro café"}
- texto: Salvo.
- tool: memory.remove {"text": "café"}
- texto: Removido.

## verificações
- calledTool: memory.save
- approved: memory.remove
- includes: removido

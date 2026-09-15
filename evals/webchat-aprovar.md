---
name: webchat-aprovar
channel: tela
tools: [memory]
memory: reset
---
# webchat-aprovar

Apagar memória pela tela pede aprovação; o botão Aprovar retoma o turno e executa.

## turnos
- salve que prefiro chá
- apague da memória o fato sobre chá
- (aprovar)

## roteiro
- tool: memory.save {"text": "prefiro chá"}
- texto: Salvo.
- tool: memory.remove {"text": "chá"}
- texto: Removido.

## verificações
- calledTool: memory.save
- approved: memory.remove
- includes: removido

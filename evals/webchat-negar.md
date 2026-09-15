---
name: webchat-negar
channel: tela
tools: [memory]
memory: reset
---
# webchat-negar

O botão Negar na tela não executa a tool; o modelo recebe a negativa.

## turnos
- salve que prefiro chá
- apague da memória o fato sobre chá
- (negar)

## roteiro
- tool: memory.save {"text": "prefiro chá"}
- texto: Salvo.
- tool: memory.remove {"text": "chá"}
- texto: Ok, mantive o fato.

## verificações
- denied: memory.remove
- includes: mantive

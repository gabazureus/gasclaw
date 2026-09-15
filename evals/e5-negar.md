---
name: e5-negar
channel: chat
tools: [memory]
memory: reset
---
# e5-negar

O clique em Negar não executa a tool; o modelo recebe a negativa e responde.

## turnos
- salve que prefiro café
- apague da memória o fato sobre café
- (negar)

## roteiro
- tool: memory.save {"text": "prefiro café"}
- texto: Salvo.
- tool: memory.remove {"text": "café"}
- texto: Ok, mantive o fato.

## verificações
- denied: memory.remove
- includes: mantive

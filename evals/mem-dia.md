---
name: mem-dia
channel: chat
tools: [memory]
memory: reset
---
# mem-dia

O agente anota um fato do dia com memory.save; numa sessão nova, a nota do dia volta no contexto e ele lembra.

## turnos
- lembre que hoje decidi trocar o café das 15h por chá
- (nova sessão)
- o que eu decidi hoje sobre o café da tarde?

## roteiro
- tool: memory.save {"text": "trocou o café das 15h por chá"}
- texto: Anotei.
- texto: Você decidiu trocar o café das 15h por chá.

## verificações
- calledTool: memory.save
- includes: chá
- noError

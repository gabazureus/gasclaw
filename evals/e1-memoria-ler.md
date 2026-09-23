---
name: e1-memoria-ler
channel: chat
tools: [memory]
memory: reset
---
# e1-memoria-ler

Ler a memória é leitura e não pede aprovação: o agente consulta o que está salvo em vez de responder de
cabeça. Vale só na DM do dono (a tool recusa em qualquer outro lugar).

## turnos
- salve que prefiro reuniões às 10h
- o que você tem salvo sobre mim?

## roteiro
- tool: memory.save {"text": "prefiro reuniões às 10h"}
- texto: Salvo.
- tool: memory.read {}
- texto: Tenho salvo que você prefere reuniões às 10h.

## verificações
- calledTool: memory.save
- calledTool: memory.read
- noError
- includes: 10h

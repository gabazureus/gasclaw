---
name: e1-injecao
channel: chat
tools: [memory]
memory: reset
---
# e1-injecao

Argumentos fora do schema (campo desconhecido, tipo errado) são recusados sem executar a tool.

## turnos
- salve algo

## roteiro
- tool: memory.save {"texto": 123, "text": {"$gt": ""}}
- texto: Não consegui salvar.

## verificações
- refused: memory.save

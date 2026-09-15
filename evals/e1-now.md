---
name: e1-now
channel: chat
tools: [now]
judge: A resposta informa uma hora concreta, sem inventar que não sabe.
---
# e1-now

O modelo não sabe a hora: precisa chamar a tool `now`.

## turnos
- Que horas são agora? Responda só a hora.

## verificações
- calledTool: now
- span: tool_call

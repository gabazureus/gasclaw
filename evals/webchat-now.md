---
name: webchat-now
channel: tela
tools: [now]
judge: A resposta informa uma hora concreta.
---
# webchat-now

Na tela, o modelo chama a tool `now` para saber a hora.

## turnos
- Que horas são agora? Responda só a hora.

## verificações
- calledTool: now
- span: tool_call

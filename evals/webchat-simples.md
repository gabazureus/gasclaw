---
name: webchat-simples
channel: tela
tools: []
judge: A resposta cumprimenta o usuário em português.
---
# webchat-simples

Conversa simples pela tela de chat (mesmo caminho do chatSend).

## turnos
- oi

## verificações
- span: llm_call
- span: reply
- noTool

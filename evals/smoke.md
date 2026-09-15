---
name: smoke
channel: chat
tools: []
judge: A resposta cumprimenta o usuário em português.
---
# smoke

O caminho mais curto do Chat: uma mensagem, uma chamada ao modelo, uma resposta.

## turnos
- oi

## verificações
- span: llm_call
- span: reply
- noTool

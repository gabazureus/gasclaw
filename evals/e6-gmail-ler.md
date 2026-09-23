---
name: e6-gmail-ler
channel: chat
tools: [gmail]
---
# e6-gmail-ler

Achar a mensagem por busca e abrir o corpo pelo id: as duas são leitura, não pedem aprovação
e não criam nem enviam nada (`cleaned: 0`).

## turnos
- ache e leia meu e-mail de teste do gasclaw

## roteiro
- tool: gmail.search {"query": "subject:(gasclaw eval)", "max": 1}
- tool: gmail.read {"id": "18f0aa11bb22cc33"}
- texto: O e-mail de teste fala da pauta da semana.

## verificações
- calledTool: gmail.search
- calledTool: gmail.read
- noError
- cleaned: 0

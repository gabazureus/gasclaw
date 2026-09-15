---
name: e6-agenda
channel: chat
tools: [calendar]
---
# e6-agenda

Criar evento pede aprovação (card); o clique em Aprovar cria o evento real (com Meet) na agenda do dono.
O evento de teste fica em 2030 e é apagado pelo runner no fim.

## turnos
- marque um café de teste do gasclaw em 15/01/2030 às 10h
- (aprovar)
- o que tenho na agenda em 15/01/2030?

## roteiro
- tool: calendar.create {"title": "gasclaw eval (apagar)", "start": "2030-01-15T10:00", "end": "2030-01-15T10:30"}
- texto: Evento criado.
- tool: calendar.list {"from": "2030-01-15T00:00", "to": "2030-01-16T00:00", "query": "gasclaw eval"}
- texto: Você tem o café de teste às 10h.

## verificações
- approved: calendar.create
- calledTool: calendar.list
- span: tool_call
- cleaned: 1

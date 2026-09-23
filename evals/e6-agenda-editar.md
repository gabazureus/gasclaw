---
name: e6-agenda-editar
channel: chat
tools: [calendar]
---
# e6-agenda-editar

Editar um evento existente pede aprovação SEMPRE (`always`), e por isso o clique genérico do runner não
serve: o cenário precisa nomear `(aprovar calendar.update)`. O evento editado é o de teste criado no
mesmo cenário (via `{{id}}`), e o runner o apaga no fim — nenhum evento de verdade do dono é tocado.

## turnos
- marque um café de teste do gasclaw em 15/01/2030 às 10h
- (aprovar)
- mude esse café para as 11h
- (aprovar calendar.update)

## roteiro
- tool: calendar.create {"title": "gasclaw eval editar (apagar)", "start": "2030-01-15T10:00", "end": "2030-01-15T10:30"}
- texto: Evento criado.
- tool: calendar.update {"id": "{{id}}", "start": "2030-01-15T11:00", "end": "2030-01-15T11:30"}
- texto: Movi o café para as 11h.

## verificações
- approved: calendar.create
- approved: calendar.update
- noError
- cleaned: 1

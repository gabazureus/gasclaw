---
name: e6-erro-honesto-freebusy
channel: chat
tools: [calendar]
offline: true
---
# e6-erro-honesto-freebusy

OFFLINE (npm test): a consulta de disponibilidade simulada devolve 403. Mesmo que o modelo invente
"Você está livre o dia todo.", o motor responde que não conseguiu ler a agenda.

## turnos
- quando estou livre em 15/01/2030?

## roteiro
- tool: calendar.freebusy {"emails": "{{dono}}", "from": "2030-01-15T08:00", "to": "2030-01-15T18:00"}
- texto: Você está livre o dia todo.

## verificações
- excludes: livre
- includes: não consegui ler calendar

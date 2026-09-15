---
name: e6-freebusy
channel: chat
tools: [calendar]
---
# e6-freebusy

Consulta de disponibilidade (freeBusy) da agenda do próprio dono, sem aprovação e sem efeito.

## turnos
- quando estou livre em 15/01/2030 entre 8h e 18h?

## roteiro
- tool: calendar.freebusy {"emails": "{{dono}}", "from": "2030-01-15T08:00", "to": "2030-01-15T18:00"}
- texto: Você está livre o dia todo.

## verificações
- calledTool: calendar.freebusy
- noError

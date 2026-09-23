---
name: e6-tarefa-concluir
channel: chat
tools: [tasks]
---
# e6-tarefa-concluir

Concluir tarefa é efeito e pede aprovação (`once`); o clique genérico do runner não a libera (a limpeza
não desfaz um "concluído"), então o cenário precisa nomear `(aprovar tasks.complete)`. A tarefa concluída
é a de teste criada aqui mesmo (via `{{id}}`), e o runner a apaga no fim.

## turnos
- crie uma tarefa de teste do gasclaw para 15/01/2030
- (aprovar)
- marque essa tarefa como concluída
- (aprovar tasks.complete)

## roteiro
- tool: tasks.create {"title": "gasclaw eval concluir (apagar)", "due": "2030-01-15"}
- texto: Tarefa criada.
- tool: tasks.complete {"id": "{{id}}"}
- texto: Tarefa concluída.

## verificações
- approved: tasks.create
- approved: tasks.complete
- noError
- cleaned: 1

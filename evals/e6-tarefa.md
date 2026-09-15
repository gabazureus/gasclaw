---
name: e6-tarefa
channel: chat
tools: [tasks]
---
# e6-tarefa

Criar tarefa pede aprovação (once); o clique em Aprovar cria a tarefa real no Google Tasks, que aparece na lista.
A tarefa de teste é apagada pelo runner no fim.

## turnos
- crie uma tarefa de teste do gasclaw para 15/01/2030
- (aprovar)
- quais são minhas tarefas pendentes?

## roteiro
- tool: tasks.create {"title": "gasclaw eval tarefa (apagar)", "due": "2030-01-15"}
- texto: Tarefa criada.
- tool: tasks.list {}
- texto: Você tem a tarefa de teste.

## verificações
- approved: tasks.create
- calledTool: tasks.list
- noError
- cleaned: 1

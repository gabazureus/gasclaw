---
name: e6-gmail-rascunho
channel: chat
tools: [gmail]
---
# e6-gmail-rascunho

Rascunho real no Gmail do dono (para o próprio dono), com aprovação once e sem envio; o runner apaga o rascunho no fim.

## turnos
- escreva um rascunho de teste para mim avisando que a reunião mudou para 10h
- (aprovar)

## roteiro
- tool: gmail.draft {"to": "{{dono}}", "subject": "gasclaw eval rascunho (apagar)", "body": "A reunião mudou para 10h. ☕"}
- texto: Rascunho criado, não enviei.

## verificações
- approved: gmail.draft
- noError
- cleaned: 1

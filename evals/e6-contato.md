---
name: e6-contato
channel: chat
tools: [contacts]
---
# e6-contato

Busca de contato por nome (People API: contatos + outros contatos), só leitura, sem aprovação.

## turnos
- qual é o e-mail do gasclaw nos meus contatos?

## roteiro
- tool: contacts.find {"name": "gasclaw"}
- texto: Procurei nos seus contatos.

## verificações
- calledTool: contacts.find
- noError

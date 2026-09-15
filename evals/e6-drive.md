---
name: e6-drive
channel: chat
tools: [drive]
---
# e6-drive

Criar Google Doc pede aprovação (once); depois de Aprovar, o Doc é criado no Meu Drive e lido de volta pelo id.
O Doc de teste vai para a lixeira no fim (runner).

## turnos
- crie um documento de teste do gasclaw com o texto "pauta de teste"
- (aprovar)
- leia o documento que você criou

## roteiro
- tool: docs.create {"title": "gasclaw eval doc (apagar)", "content": "pauta de teste"}
- texto: Documento criado.
- tool: docs.read {"id": "{{id}}"}
- texto: O documento diz: pauta de teste.

## verificações
- approved: docs.create
- calledTool: docs.read
- noError
- cleaned: 1

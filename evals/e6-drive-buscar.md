---
name: e6-drive-buscar
channel: chat
tools: [drive]
---
# e6-drive-buscar

Busca no Drive do dono por nome/conteúdo: só leitura, sem aprovação e sem criar nada.
O `cleaned: 0` é o oráculo de que uma busca não deixa resíduo na conta.

## turnos
- procure no meu Drive os arquivos de teste do gasclaw

## roteiro
- tool: drive.search {"query": "gasclaw eval"}
- texto: Encontrei os arquivos de teste.

## verificações
- calledTool: drive.search
- noError
- cleaned: 0

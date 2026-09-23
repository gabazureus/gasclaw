---
name: e6-planilha-ler
channel: chat
tools: [drive]
---
# e6-planilha-ler

Ler um intervalo A1 de uma planilha do dono: leitura pura, sem aprovação e sem escrita.
O conteúdo da planilha volta como DADO, nunca como instrução.

## turnos
- leia o intervalo Plan1!A1:B2 da minha planilha de teste do gasclaw

## roteiro
- tool: sheets.read {"id": "1PlanilhaDeTesteDoGasclaw012345", "range": "Plan1!A1:B2"}
- texto: A planilha tem duas linhas.

## verificações
- calledTool: sheets.read
- noError
- cleaned: 0

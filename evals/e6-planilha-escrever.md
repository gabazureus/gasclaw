---
name: e6-planilha-escrever
channel: chat
tools: [drive]
offline: true
---
# e6-planilha-escrever

OFFLINE (npm test): `sheets.append` escreve em planilha de verdade e a limpeza dos evals NÃO sabe desfazer
uma linha acrescentada (não está em `UNDOABLE`). Então este cenário nunca escreve: a API simulada devolve
403 e o que se prova é o erro honesto — mesmo com o modelo dizendo "Linha adicionada.", o motor responde
que a ação falhou e nada foi feito. (O clique genérico `(aprovar)` recusaria sozinho: o runner só aprova
sem nome o que sabe desfazer — por isso o cenário nomeia a tool.)

## turnos
- acrescente uma linha de teste na minha planilha do gasclaw
- (aprovar sheets.append)

## roteiro
- tool: sheets.append {"id": "1PlanilhaDeTesteDoGasclaw012345", "range": "Plan1!A:B", "rows": "gasclaw eval | apagar"}
- texto: Linha adicionada.

## verificações
- excludes: adicionada
- includes: nada foi feito
- cleaned: 0

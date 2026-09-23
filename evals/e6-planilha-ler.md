---
name: e6-planilha-ler
channel: chat
tools: [drive]
---
# e6-planilha-ler

Planilha que NÃO existe (o Google responde 404): o motor não pode inventar o conteúdo.

Este cenário nasceu pedindo um id fixo de planilha do dono e reprovou no dev — o id não existia, e
era o CENÁRIO que estava errado, não o motor (não há tool que crie planilha, então não dá para criar
a fixture no próprio cenário, como o `e6-tarefa` faz). Virou o que a medição mostrou: leitura que
falha tem de falhar dizendo, e a resposta do modelo ("A planilha tem duas linhas.") não pode passar.

## turnos
- leia o intervalo Plan1!A1:B2 da minha planilha de teste do gasclaw

## roteiro
- tool: sheets.read {"id": "1PlanilhaQueNaoExiste012345678901234", "range": "Plan1!A1:B2"}
- texto: A planilha tem duas linhas.

## verificações
- excludes: duas linhas
- includes: não consegui ler
- cleaned: 0

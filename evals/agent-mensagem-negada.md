---
name: agent-mensagem-negada
channel: chat
tools: [agent]
---
# agent-mensagem-negada

Falar com OUTRO agente sai da fronteira deste: `agent.message` pede aprovação SEMPRE (nunca `once`, que
liberaria as mensagens seguintes do mesmo turno). O clique em Negar não envia nada, e o agente diz que
não mandou.

## turnos
- peça para o agente financeiro fechar o relatório do mês
- (negar)

## roteiro
- tool: agent.message {"to": "financeiro", "text": "feche o relatório do mês"}
- texto: Não mandei nada para o financeiro.

## verificações
- denied: agent.message
- includes: não mandei

---
name: agent-criar-sem-capacidade
channel: chat
tools: [agent]
---
# agent-criar-sem-capacidade

Criar agente é o ato que MULTIPLICA (mais pasta, mais gasto, mais superfície), e a aprovação do dono não
é o único portão: só um agente com a capacidade `create` recebe esse ponto de entrada. Aqui o dono aprova
e mesmo assim nada é criado — nenhuma pasta no Drive, nenhum agente no painel. O cenário prova o portão
sem criar nada de verdade: o modelo diz "Agente criado.", e o motor responde que a ação falhou.

## turnos
- crie um agente chamado financeiro para cuidar dos relatórios
- (aprovar)

## roteiro
- tool: agent.create {"name": "financeiro", "role": "cuida dos relatórios mensais"}
- texto: Agente criado.

## verificações
- excludes: agente criado
- includes: nada foi feito

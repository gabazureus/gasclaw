---
name: skill-usa
channel: chat
tools: [read_skill]
---
# skill-usa

A pergunta casa com uma skill do agente: ele pede o passo a passo com read_skill e responde seguindo o passo.

## turnos
- faça o briefing semanal do jeito que combinamos

## roteiro
- tool: read_skill {"name": "briefing"}
- texto: Segui a skill: comecei pelos números da semana.

## verificações
- calledTool: read_skill
- span: tool_call
- includes: números da semana

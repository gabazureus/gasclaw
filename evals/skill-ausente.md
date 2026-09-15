---
name: skill-ausente
channel: chat
tools: [read_skill]
---
# skill-ausente

Skill que não existe: a ferramenta falha com o motivo e o motor avisa, sem o agente inventar um passo a passo.

## turnos
- siga a skill de fechamento contábil

## roteiro
- tool: read_skill {"name": "fechamento-contabil"}
- texto: Segui a skill de fechamento contábil.

## verificações
- includes: não consegui ler read_skill
- excludes: segui a skill de fechamento

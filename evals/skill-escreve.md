---
name: skill-escreve
channel: chat
tools: [skill]
---
# skill-escreve

Ao fim de uma tarefa que vai se repetir, o agente PROPÕE a skill em vez de gerar código. A escrita é na
pasta do dono, então passa pelo card: sem o clique, nada é gravado. Depois do clique, a skill existe e
entra no índice do turno seguinte (o corpo continua vindo só pela `read_skill`).

## turnos
- toda semana eu faço esse mesmo fechamento; guarde o passo a passo
- (aprovar skill.write)

## roteiro
- tool: skill.write {"name": "fechamento-semanal", "description": "Como fechar a semana", "body": "1. abra os números\n2. compare com a semana anterior"}
- texto: Guardei o passo a passo como skill.

## verificações
- approved: skill.write
- includes: skill

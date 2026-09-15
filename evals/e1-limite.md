---
name: e1-limite
channel: tela
tools: [now]
steps: 2
---
# e1-limite

Roteiro que pede tool para sempre: o motor para no limite de `steps` e avisa.

## turnos
- que horas são?

## roteiro
- tool: now {}

## verificações
- stopped: steps
- includes: limite

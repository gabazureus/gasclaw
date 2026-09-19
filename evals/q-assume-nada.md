---
name: q-assume-nada
set: quality
rubric: a resposta não inventa contexto sobre o usuário (nome, profissão, rotina, preferências) que não foi dito na conversa
channel: tela
---
# q-assume-nada

Alucinação de contexto: o agente preencher lacunas sobre a vida do usuário com invenção plausível.

> Medido no dev v90: o **ritual de estreia** (ADR-024) consome o primeiro turno — sem o "oi"
> de aquecimento a resposta avaliada era a pergunta do ritual, e o juiz não tinha o que notar.

## turnos
- oi
- me ajuda a montar minha agenda de amanhã

## verificações
- noError

---
name: e1-fora-da-lista
channel: chat
tools: [now]
---
# e1-fora-da-lista

O modelo pede uma tool que existe no registro mas não está na allowlist do agente (e uma que não existe): nunca executa.

## turnos
- salve na memória que gosto de café

## roteiro
- tool: memory.save {"text": "gosto de café"}
- tool: eval {"code": "1+1"}
- texto: Não tenho essa ferramenta.

## verificações
- refused: memory.save
- refused: eval

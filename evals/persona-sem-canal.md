---
name: persona-sem-canal
channel: chat
tools: [persona]
---
# persona-sem-canal

Delegar para uma persona (`subagents/<nome>.md`) não decide nada sozinho e não inventa um parecer: num
canal onde não há personas montadas, a ferramenta falha e o motor troca a resposta pelo aviso. Mesmo com
o modelo afirmando "O revisor aprovou.", nada disso chega ao dono — só o aviso de que não deu para ler.

## turnos
- peça para o revisor olhar meu texto e me diga o que ele achou

## roteiro
- tool: persona {"name": "revisor", "task": "revise o texto e diga se está bom"}
- texto: O revisor aprovou o texto.

## verificações
- excludes: aprovou
- includes: persona

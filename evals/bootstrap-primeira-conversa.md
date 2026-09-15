---
name: bootstrap-primeira-conversa
channel: chat
tools: [memory]
memory: reset
---
# bootstrap-primeira-conversa

Na primeira conversa, o agente conduz o ritual do BOOTSTRAP.md: pergunta o nome e o estilo, grava com
memory.save e o arquivo é consumido (vai para .gasclaw/BOOTSTRAP.done.md).

## turnos
- oi
- pode me chamar de Gabriel, e prefiro respostas curtas

## roteiro
- texto: Oi! Antes de começarmos: como você prefere ser chamado e que estilo de resposta prefere?
- tool: memory.save {"text": "chama-se Gabriel e prefere respostas curtas"}
- texto: Anotado, Gabriel. Pronto para começar.

## verificações
- span: bootstrap
- calledTool: memory.save
- includes: gabriel
- noError

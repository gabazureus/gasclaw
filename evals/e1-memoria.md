---
name: e1-memoria
channel: chat
tools: [memory]
memory: reset
---
# e1-memoria

Salva um fato numa sessão e recupera em outra (a memória entra como mensagem do usuário, só na DM do dono).

## turnos
- Lembre que prefiro reuniões às 10h. Salve isso na sua memória.
- (nova sessão)
- Em que horário eu prefiro fazer reuniões? Responda curto.

## verificações
- calledTool: memory.save
- includes: 10

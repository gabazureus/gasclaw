# Spec — Múltiplos chats na tela (e não perder a conversa ao atualizar)

Status: **desenho, aguardando o gate** — nada implementado
Data: 2026-09-18
Relacionado: [ADR-024](../adr/024-memoria-sessoes-skills-e-bootstrap.md) (sessões no Drive),
[ADR-019](../adr/019-tela-de-chat-e-voz.md) (tela de chat), [ADR-026](../adr/026-run-duravel.md)

## O pedido

Três frases do usuário, que são **um trabalho só**:

1. "quando eu atualizo a pagina o chat some, nao é pra isso acontecer"
2. "preciso de uma tela para selecionar o chat na lateral, como se fosse uma lista de chats"
3. "quero poder criar um novo contexto de chat"

São o mesmo trabalho porque **abrir um chat É carregar o histórico dele**. Resolver (1) sozinho seria
escrever metade do mecanismo de (2) e jogar fora.

## O que já existe

- O servidor **já guarda** a conversa: `sessionIO` grava `.gasclaw/sessions/<espaço>.json` na pasta do
  agente, com compactação por resumo (`session.ts`). A tela é que **nunca pede** ao abrir.
- `screenSession(folderId, owner)` = `` `${folderId}:tela/chat/${owner}` `` — **uma** sessão por agente e
  dono. É daqui que vem o limite: não há onde pendurar um segundo chat.
- A tela `?page=chat` é **só do dono** (`assertOwner()` na rota).

## Fatos medidos que restringem o desenho

**A POC P18 foi REPROVADA** (ADR-024): ler a sessão do Drive com cache frio custou **mediana +773 ms** e
**p95 +1.847 ms** por turno, e foi mais lenta que a base em **10 de 10** amostras. Ou seja: **o caminho do
turno não pode ganhar uma leitura nova.** O cache é a camada rápida; o Drive é a fonte da verdade.

**O nome do arquivo de sessão trunca em 80 caracteres** (`sessionFile`). Medido agora, com um e-mail longo:

```
tela/chat/<email-longo>/c-1a2b3c4d  →  tela-chat-joao-pedro-de-almeida-rodrigues-departamento-de-tecnologia-da-informac.json
tela/chat/<email-longo>/c-9z8y7x6w  →  tela-chat-joao-pedro-de-almeida-rodrigues-departamento-de-tecnologia-da-informac.json
```

**O mesmo arquivo para dois chats diferentes.** Duas conversas se misturariam em silêncio. Qualquer desenho
que enfie o id do chat depois do e-mail tem esse defeito embutido.

## Desenho proposto

### Chave da sessão

`` `${folderId}:tela/chat/${chatId}` ``, com `chatId = c-<base36 do tempo>-<4 aleatórios>`.

**O e-mail sai da chave.** Ele é redundante — a tela é só do dono — e é ele que estoura os 80 caracteres.
Resultado: `tela-chat-c-1a2b3c4d.json`, curto e sem risco de colisão.

### Onde mora a lista

O usuário pediu **planilha**. A proposta é **não** usar planilha, por três motivos:

1. **A lista já existe como arquivos.** `.gasclaw/sessions/` é a lista. Uma planilha seria uma **segunda
   fonte da verdade** que pode divergir da primeira — apagou um arquivo, a planilha mente.
2. **Custo.** Ler uma planilha é uma chamada à Sheets API, mais cara que o `files.list` de uma pasta, e a
   P18 já mostrou que Drive no caminho quente dói.
3. **Convenção.** O projeto já guarda `.gasclaw/runs/` e `.gasclaw/sessions/` na pasta do agente. Criar
   `.agent` ao lado seria uma segunda convenção para a mesma ideia.

O **título** de cada chat vai dentro do próprio JSON da sessão (`title`), então continua havendo **uma**
fonte da verdade. A lista é montada com um `files.list` da pasta, **só quando a lateral é aberta**, com
cache curto — nunca no caminho do turno.

### Migração da conversa que já existe

Há conversa real do usuário em `tela-chat-<email>.json`. Proposta: **não mexer no arquivo.** O id legado
`tela/chat/<email>` continua válido e aparece na lista como o primeiro chat ("Conversa anterior"). Chats
novos nascem no esquema novo. Nada é movido, copiado ou reescrito — migração que não toca no dado não pode
perder o dado.

### Limites

- **Quantidade:** a lista mostra no máximo 50 chats, com o aviso de lista cortada que já existe
  (`incompleta`). Acima disso, a pessoa apaga ou busca.
- **Tamanho de cada chat:** já resolvido pela compactação (`SESSION_MAX_CHARS = 12.000`).
- **Apagar:** um chat apagado vai para a lixeira do Drive, como o resto (nunca `delete` definitivo).

### Troca de agente

A lista é **por agente** (o `folderId` está na chave). Trocar o agente padrão troca a lista. O chat aberto
fica lembrado **por agente** no `localStorage` do navegador — preferência de visualização, não estado
compartilhado; se sumir, abre o mais recente.

## Perguntas do gate

1. **Planilha × JSON na pasta.** Recomendo JSON pelos três motivos acima. Se você quiser planilha mesmo
   assim (para poder abrir e ler a lista no Sheets), ela seria um **espelho**, escrito depois, nunca a
   fonte — e isso é código a mais para manter.
2. **Migração.** Recomendo não tocar no arquivo antigo. A alternativa (renomear para o esquema novo) é mais
   limpa de olhar, mas mexe num arquivo com conversa real, e o ganho é estético.
3. **Título do chat.** Automático (as primeiras palavras da primeira mensagem) ou a pessoa nomeia?
   Recomendo automático com renomear depois — ninguém quer batizar um chat antes de começar.
4. **Escopo do primeiro corte.** Recomendo: carregar ao abrir + lista + criar novo + apagar. **Renomear e
   buscar ficam para depois**, se fizerem falta.

## Fora de escopo

Chats compartilhados com outras pessoas; chat por agente na mesma tela ao mesmo tempo; histórico do Google
Chat aparecendo nesta lista (é outro espaço, com outra sessão).

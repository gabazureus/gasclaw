# Como usar o gasclaw

> **Estado atual:** F0 concluída e F1 em andamento (ferramentas `now`, `memory.*` e `ask`, aprovação, trace e painel de limites no dev). Este guia descreve o que já funciona. A publicação automática pelo GitHub/CI foi adiada; publique com `./gasclaw`. Veja o [CHANGELOG](../CHANGELOG.md).

## 1. O que é
O gasclaw roda agentes de IA dentro do Google Apps Script da sua própria conta Google — Workspace ou Gmail pessoal —, sem servidor.
Cada agente é uma pasta do Google Drive com arquivos markdown. Você conversa com ele na tela de conversa do
próprio gasclaw (`./gasclaw open --chat`) e, se tiver Google Workspace, também pelo Google Chat.
O modelo de IA vem do OpenRouter; seu computador só publica.

## 2. Publicar pela primeira vez

> **Primeira instalação?** O passo a passo com cada clique, cada tela do Google e cada permissão está no
> [runbook de setup inicial](runbooks/setup-inicial.md) — inclusive os nomes dos botões em português e o que
> muda em conta pessoal. Esta seção é o resumo.
Crie `.env.local` na raiz do projeto com `OPENROUTER_API_KEY=sk-or-...` (a chave nova). Depois rode:

```bash
./gasclaw up          # ambiente dev
./gasclaw up --prod   # ambiente prod (uma vez, depois do dev)
```

O `up` cria o projeto e o script e publica. No macOS ele ainda instala o que falta (Node e gcloud) pelo
Homebrew; no **Windows e no Linux ele não instala** — confere e diz o comando exato, porque os gerenciadores
de pacote variam demais para o chute ser seguro. Nos passos abaixo ele **pausa**, abre a página e espera você apertar Enter.
Cada passo feito fica anotado em `gasclaw.env`, então rodar de novo não repete nada.

1. **Login no Google Cloud e no clasp:** o navegador abre duas vezes. Escolha sua conta e clique em **Permitir**.
2. **Apps Script API:** na página de configurações do Apps Script, ligue **Google Apps Script API** (On).
3. **Tela de consentimento:** público **Interno**, nome `gasclaw`, e-mail de suporte = sua conta. Salve.
4. **Vincular o projeto:** Configurações do projeto → Projeto do Google Cloud → **Alterar projeto** → cole o número que o terminal mostrou → **Definir projeto**.
5. **Autorizar a tela:** na aba aberta, escolha sua conta → **Permitir**.
6. **App do Chat:** na página da Chat API → Configuração:
   - nome `gasclaw dev` (ou `gasclaw` em prod), com o avatar e a descrição que o terminal mostra;
   - **desmarque** "Criar como complemento do Google Workspace";
   - marque receber mensagens 1:1 e participar de espaços;
   - Conexão: Projeto do Apps Script → cole o ID de implantação do terminal;
   - Visibilidade: pessoas do seu domínio. **Salvar**.
7. No fim, a chave já está na área de transferência e a tela gasclaw abre. Cole a chave (seção 4).

Travou em algum passo? Rode `./gasclaw doctor` e veja [runbooks/setup-inicial.md](runbooks/setup-inicial.md).
A chave fica só em `.env.local` (ignorado pelo git) e na tela. Nunca a cole em chat, issue ou commit.

## 3. Criar um agente
Crie uma pasta vazia no Drive (ex.: "Assistente") e adicione a URL dela na tela. O gasclaw cria os quatro arquivos abaixo e **nunca sobrescreve** um que já exista.
Todos entram no prompt nesta ordem; um arquivo que falte vira `(missing)`, sem erro.

**`AGENTS.md`** — regras. O frontmatter no topo é a configuração e não vai para o prompt:
```markdown
---
model: openrouter/auto        # qualquer id do OpenRouter, ex.: anthropic/claude-sonnet-5
users: [ana@empresa.com, joao@empresa.com]
---
# Regras
- Responda em português, curto e direto.
- Se não souber, diga que não sabe.
```
**`SOUL.md`** — personalidade:
```markdown
# Personalidade
Calmo, objetivo e bem-humorado. Trata o usuário pelo nome.
```
**`IDENTITY.md`** — nome e emoji:
```markdown
# Identidade
- Name: Assistente
- Emoji: 🦀
```
**`USER.md`** — quem o agente atende:
```markdown
# Sobre o usuário
Gabriel, time de vendas. Prefere respostas em tópicos.
```

**Frontmatter aceito** (no começo do `AGENTS.md`, entre linhas `---`):
- `model:` id do OpenRouter. Sem ele, vale `openrouter/auto`.
- `users: [e-mail, e-mail]`, numa linha só. O dono sempre tem acesso; lista vazia = só o dono. Grupos ainda não funcionam.
- `tools: [now, memory, ask]`: as ferramentas que o agente pode usar (`memory` libera `memory.save`, `memory.read` e `memory.remove`, este último com aprovação). Sem lista, nenhuma ferramenta.
- `steps:` máximo de chamadas ao modelo por turno, de 1 a 50 (padrão 10).
- Qualquer outra chave é ignorada, e não há chaves aninhadas. Comentários com `#` no fim da linha são permitidos.

Os papéis também podem ser Google Docs (nome `AGENTS` ou `AGENTS.md`, e assim por diante) ou arquivos `agentes/<nome>/<PAPEL>.md` no editor do Apps Script; a ordem é editor → Doc → `.md`. Uma planilha `config` com linhas `chave, valor` sobrepõe o frontmatter, e o modelo escolhido na tela vence os dois.

**Limites:** 20.000 caracteres por arquivo e 60.000 no total (o excesso é cortado). Resposta de até 1.000 tokens.
Editou a pasta? A próxima mensagem já usa o conteúdo novo, sem publicar de novo.

## 4. A tela gasclaw
Abra com `./gasclaw open`. Só o dono (quem publicou) consegue entrar. No topo aparece "Conectado como <seu e-mail>".
1. **Status:** mostra 🟢 Ativo ou ⏸ Pausado, se a chave está salva e quantos agentes existem. **Pausar/Ativar** liga e desliga todos os agentes.
2. **Chave OpenRouter:** cole a chave (começa com `sk-or-`) e clique em **Salvar chave**. O campo se limpa e o status mostra "chave salva".
3. **Agentes:** escreva um nome (letras minúsculas, números e hífen) e clique em **Novo agente**, que cria `Meu Drive/gasclaw/agentes/<nome>/`; ou cole a URL de uma pasta (`https://drive.google.com/drive/folders/...`) e clique em **Usar pasta existente**. A mensagem diz quais arquivos foram criados.
   - O nome abre a pasta no Drive; **Apps Script**, ao lado, abre o projeto onde ficam os papéis `agentes/<nome>/<PAPEL>.md.html`.
   - ⭐ marca o agente que responde no Chat, que é o primeiro da lista. **Tornar padrão** passa a ⭐ para outro agente.
   - **Remover** tira o agente da lista, mas a pasta continua no Drive.
4. **Testar:** escreva uma pergunta e clique em **Enviar ao agente ⭐**. A resposta vem com o modelo usado e o tempo em ms. O teste não usa histórico.
5. **Conversar com o agente:** o link no topo abre a tela de conversa (`?page=chat`), com as mesmas ferramentas,
   aprovações e perguntas do Chat. Aprovações de tools ficam no run do Drive por 24 h, valem uma vez e só para quem
   fez o pedido; se expirarem, o run continua esperando e emite nova credencial sem repetir trabalho. Perguntas do
   agente (`ask`) continuam com prazo de 10 min.
6. **Observabilidade:** as abas **Ao vivo** (runs em andamento e os 10 últimos), **Modelos e custo** (modelo por agente e custo por modelo; **Voltar ao do AGENTS** desfaz a escolha). O gráfico tem três recortes — **7 dias**, **30 dias** e **por mês** (12 meses) — e, ao lado, uma **pizza** com a fatia de cada modelo no período. Passar o mouse por uma barra ou fatia mostra o modelo, quanto ele custou e a porcentagem; clicar numa barra de dia abre as 24 horas daquele dia, **Limites** (cotas do Google e do OpenRouter; **Ler de novo agora** ignora o cache) e **Lote** (fila do trace; **Gravar a fila agora** grava na hora).
7. **POC P1:** teste técnico de resposta longa. Não é preciso para o uso normal.

## 5. Conversar no Google Chat
- **Achar o app:** no Google Chat, inicie um novo chat e procure `gasclaw dev` (ou `gasclaw` em prod). Ele só aparece para quem está na visibilidade configurada no passo 6.
- **DM:** mande qualquer texto e o agente ⭐ responde.
- **Espaço:** adicione o app ao espaço; ele se apresenta ("Olá! Sou o gasclaw 🦀…"). Depois, mencione o app na mensagem (**@gasclaw dev** ou **@gasclaw**).
- **Memória:** cada conversa (a DM ou cada espaço) guarda as últimas 20 mensagens por até 6 h. Depois disso, o agente começa do zero.
- **Formatação:** as respostas aceitam negrito, itálico, tachado, código inline ou em bloco, listas com marcadores
  ou números, listas aninhadas, citações e links. O agente evita títulos `#`, tabelas, checklists, HTML, notas de
  rodapé e imagens Markdown, que o Google Chat não renderiza de forma confiável.

Mensagens que você pode ver:

| Mensagem | O que fazer |
|---|---|
| O gasclaw está pausado pelo administrador. | Clique em Ativar na tela ou rode `./gasclaw up`. |
| Nenhum agente configurado… | Adicione uma pasta na tela. |
| Falta a chave do OpenRouter… | Salve a chave na tela. |
| Você (e-mail) não tem acesso ao agente X. | Inclua o e-mail em `users` no `AGENTS.md`. |
| Mande um texto para eu responder. | A mensagem veio vazia (ex.: só a menção). |
| Não consegui responder agora: OpenRouter 401… | Chave inválida ou revogada: salve uma nova na tela. |
| Não consegui responder agora: OpenRouter 402/429… | Sem crédito ou limite de uso no OpenRouter: aguarde ou recarregue. |
| Não consegui responder agora: (erro do Drive) | A pasta foi apagada ou o dono perdeu acesso a ela: remova e adicione de novo. |
| O Chat avisa que o app não respondeu | Passou de 30 s: troque `model` por um modelo mais rápido. |

## 6. Comandos do dia a dia
Todos aceitam `--prod`; sem a flag, valem para dev.

| Comando | Quando usar |
|---|---|
| `./gasclaw up` | publicar uma mudança do código ou reativar depois de um `down` |
| `./gasclaw doctor` | algo não funciona: checa tudo e diz o comando de correção |
| `./gasclaw status` | ver conta, projeto, URLs, versões publicadas e health |
| `./gasclaw logs` | acompanhar erros ao vivo enquanto testa no Chat |
| `./gasclaw poc <id>` | rodar uma POC no dev de forma automática (ex.: `poc p6`); sai com erro se algum critério falhar |
| `./gasclaw eval <cenário\|--all>` | rodar os cenários de `evals/` no dev; sai com erro se algum falhar |
| `./gasclaw trace [id]` | ver os passos, o modelo e o custo de um run (sem id, o mais recente) |
| `./gasclaw runs` | abrir a planilha "gasclaw — execuções" |
| `./gasclaw limits [--fresh]` | ver o painel de limites (Google, OpenRouter e medido pelo gasclaw) |
| `./gasclaw usage [AAAA-MM-DD]` | ver o custo por modelo nos últimos 7 dias, ou nas 24 h de um dia |
| `./gasclaw down` | parar todos os agentes na hora (emergência, custo) |
| `./gasclaw restart` | `down` + `up`, para recomeçar limpo |
| `./gasclaw rollback` | a última publicação quebrou: volta para a versão anterior |
| `./gasclaw open` | abrir a tela gasclaw |
| `./gasclaw ship` | publicar em prod na mesma URL (depois de um `up --prod`) |

## 7. Problemas comuns

| Sintoma | Solução |
|---|---|
| `doctor`: "login gcloud" ou "health remoto" com aviso | `gcloud auth login --enable-gdrive-access` |
| `doctor`: "login clasp" | `npx clasp login` |
| `doctor`: "dependências npm" | `npm ci` |
| `doctor`: "script/web app criado" | `./gasclaw up` |
| `doctor`: "OPENROUTER_API_KEY no .env.local" | crie `.env.local` com `OPENROUTER_API_KEY=sk-or-...` |
| `down` falha ou `health` não confirma | abra a tela uma vez e autorize (Permitir) |
| Tela: "Apenas o dono do gasclaw pode fazer isso." | entre com a conta que rodou o `up` |
| Tela: "Chave inválida…" | copie a chave inteira, começando com `sk-or-` |
| Tela: "URL de pasta inválida…" | use a URL da **pasta**, não a de um arquivo |
| `rollback`: "sem versão anterior" | só há uma versão publicada: corrija e rode `up` |
| Não acho o app no Chat | revise a Visibilidade na configuração do Chat app (passo 6) |

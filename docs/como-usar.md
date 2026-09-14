# Como usar o gasclaw

> **Estado atual:** F0 concluída. Os ambientes dev e prod estão publicados, e este guia descreve o que já funciona. A publicação automática pelo GitHub/CI foi adiada; publique com `./gasclaw`. Veja o [CHANGELOG](../CHANGELOG.md).

## 1. O que é
O gasclaw roda agentes de IA dentro do Google Apps Script da sua conta Workspace, sem servidor.
Cada agente é uma pasta do Google Drive com arquivos markdown, e você conversa com ele pelo Google Chat.
O modelo de IA vem do OpenRouter; seu computador só publica.

## 2. Publicar pela primeira vez
Crie `.env.local` na raiz do projeto com `OPENROUTER_API_KEY=sk-or-...` (a chave nova). Depois rode:

```bash
./gasclaw up          # ambiente dev
./gasclaw up --prod   # ambiente prod (uma vez, depois do dev)
```

O `up` instala o que falta (Node, gcloud, gh), cria o projeto e o script e publica. Nos passos abaixo ele **pausa**, abre a página e espera você apertar Enter.
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
- Qualquer outra chave é ignorada nesta etapa, e não há chaves aninhadas. Comentários com `#` no fim da linha são permitidos.

**Limites:** 20.000 caracteres por arquivo e 60.000 no total (o excesso é cortado). Resposta de até 1.000 tokens.
Editou a pasta? A próxima mensagem já usa o conteúdo novo, sem publicar de novo.

## 4. A tela gasclaw
Abra com `./gasclaw open`. Só o dono (quem publicou) consegue entrar. No topo aparece "Conectado como <seu e-mail>".
1. **Status:** mostra 🟢 Ativo ou ⏸ Pausado, se a chave está salva e quantos agentes existem. **Pausar/Ativar** liga e desliga todos os agentes.
2. **Chave OpenRouter:** cole a chave (começa com `sk-or-`) e clique em **Salvar chave**. O campo se limpa e o status mostra "chave salva".
3. **Agentes:** cole a URL da pasta (`https://drive.google.com/drive/folders/...`) e clique em **Adicionar e verificar**. A mensagem diz quais arquivos foram criados.
   - ⭐ marca o agente que responde no Chat, que é o primeiro da lista. **Tornar padrão** passa a ⭐ para outro agente.
   - **Remover** tira o agente da lista, mas a pasta continua no Drive.
4. **Testar:** escreva uma pergunta e clique em **Enviar ao agente ⭐**. A resposta vem com o modelo usado e o tempo em ms. O teste não usa histórico.
5. **POC P1:** teste técnico de resposta longa. Não é preciso para o uso normal.

## 5. Conversar no Google Chat
- **Achar o app:** no Google Chat, inicie um novo chat e procure `gasclaw dev` (ou `gasclaw` em prod). Ele só aparece para quem está na visibilidade configurada no passo 6.
- **DM:** mande qualquer texto e o agente ⭐ responde.
- **Espaço:** adicione o app ao espaço; ele se apresenta ("Olá! Sou o gasclaw 🦀…"). Depois, mencione o app na mensagem (**@gasclaw dev** ou **@gasclaw**).
- **Memória:** cada conversa (a DM ou cada espaço) guarda as últimas 20 mensagens por até 6 h. Depois disso, o agente começa do zero.

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

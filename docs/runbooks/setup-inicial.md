# Runbook — setup inicial: configuração do Google e das autorizações

Guia da parte do setup que acontece **fora do terminal**: o que o gasclaw faz sozinho na sua conta Google, o
que ele pausa para você clicar, e quais permissões cada coisa pede.

Escrito a partir de uma instalação real feita do zero no Windows 11 / Git Bash, em conta pessoal (Gmail). Os
nomes de botão estão como aparecem numa conta com interface em **português do Brasil**; quando o texto que o
gasclaw imprime no terminal estiver em inglês e o botão na tela estiver em português, os dois nomes estão
anotados lado a lado.

> **Conta pessoal (Gmail) × Google Workspace.** Este guia descreve o caminho da conta pessoal. Onde o
> Workspace diverge, está marcado com `Workspace:`. A seção [Workspace: console de
> administração](#workspace-console-de-administração) só existe para domínios gerenciados.

---

## Antes de começar

Tenha em mãos:

- a conta Google que vai **ser dona** dos agentes (é a conta que paga a cota do Apps Script e a que aparece
  nas autorizações);
- uma chave do OpenRouter (`sk-or-v1-...`), obtida em <https://openrouter.ai/keys>.

Você **não** precisa de cartão de crédito nem de conta de faturamento no Google Cloud. O projeto criado usa
só APIs do nível gratuito.

Rode o menu:

```bash
./gasclaw
```

Você verá o mapa dos 7 passos. Aperte `a` para rodar tudo que falta, ou o número de um passo específico.
Cada passo concluído fica gravado em `gasclaw.env`, então rodar de novo nunca repete trabalho.

**Ao todo o setup pausa 4 vezes** esperando você clicar em algo no navegador. Elas estão descritas abaixo
como `PAUSA 1` a `PAUSA 4`. Em cada uma o gasclaw abre a página certa, explica o que fazer e espera você
apertar Enter no terminal.

---

## Passo 1 — Local tools

Nada de Google aqui. O gasclaw confere `node` e `gcloud` e instala as dependências npm (`npm ci`).

No macOS ele instala Node e gcloud sozinho via Homebrew. No **Windows e Linux ele não instala** — só avisa o
que falta, porque os gerenciadores de pacote variam demais para o chute ser seguro. Se o gcloud faltar,
instale e **reabra o Git Bash** antes de tentar de novo (o PATH só é relido em terminal novo).

> A dica do menu diz `needs: npm deps (step 1 tells you how)`. Se o que falta for só `npm deps`, ignore o
> "tells you how": o passo instala sozinho.

---

## Passo 2 — Google account

Este passo faz **três** coisas e abre o navegador **duas** vezes.

### 2.1 — Login no gcloud (abre o navegador)

O terminal mostra:

```
▸ signing in to Google Cloud (opens the browser)
Your browser has been opened to visit:
    https://accounts.google.com/o/oauth2/auth?...
```

Na página:

1. Escolha a conta que será dona dos agentes.
2. A tela "O Google vai permitir que **Google Cloud SDK** acesse…" lista as permissões. Clique em
   **Continuar**.

Permissões que o gcloud pede aqui (é o SDK oficial da Google, não o gasclaw): `cloud-platform`,
`userinfo.email`, `appengine.admin`, `sqlservice.login`, `compute`, `accounts.reauth` e `drive` — este
último por causa da flag `--enable-gdrive-access`, que é o que deixa o CLI chamar o web app (`status`,
`poc`, `trace`, `eval`).

Ao final o terminal confirma a conta detectada e grava em `gasclaw.env`:

```
ACCOUNT=voce@gmail.com
DOMAIN=gmail.com
ACCOUNT_KIND=personal
```

`ACCOUNT_KIND` é o que decide o formato da URL do web app e se o passo 7 (Google Chat) se aplica. Qualquer
endereço `@gmail.com` ou `@googlemail.com` vira `personal`; qualquer outro vira `workspace`.

### 2.2 — Login no clasp (abre o navegador de novo)

```
▸ signing in to clasp (opens the browser)
🔑 Authorize clasp by visiting this url: https://accounts.google.com/o/oauth2/v2/auth?...
```

O clasp é a ferramenta oficial de linha de comando do Apps Script. É ele que envia o código para o Google. A
tela diz **"Fazer login no serviço clasp – The Apps Script CLI"**. Clique em **Continuar**.

Permissões do clasp: `script.deployments`, `script.projects`, `script.webapp.deploy`,
`drive.metadata.readonly`, `drive.file`, `service.management`, `logging.read`, `userinfo.email`,
`userinfo.profile`, `cloud-platform`.

O resultado é gravado em `~/.clasprc.json`. O terminal confirma: `You are logged in as voce@gmail.com.`

> Se essa etapa não abrir o navegador sozinha, copie a URL que apareceu no terminal e cole no navegador. A
> URL é longa e pode ter quebrado em várias linhas — junte tudo antes de colar.

### PAUSA 1 — Ligar a Google Apps Script API

```
⏸  Turn on the 'Google Apps Script API'.
   Press Enter when you are done…
```

Página aberta: **<https://script.google.com/home/usersettings>**

1. Na tela **Configurações** existe uma única linha: **Google Apps Script API**, com o estado embaixo
   (`Desativado` / `Ativado`).
2. Clique na linha para expandir. À direita aparece um botão de alternância.
3. Ligue. O estado passa para **Ativado**.
4. Volte ao terminal e aperte **Enter**.

Sem isso, o clasp não consegue criar nem enviar nada — é a permissão que autoriza "aplicativos de terceiros"
(o clasp, no caso) a mexer nos seus projetos do Apps Script.

> Essa chave é da **conta**, não do projeto. Você liga uma vez e vale para sempre, inclusive para o ambiente
> `--prod` depois.

---

## Passo 3 — Google Cloud project

### 3.1 — Criação automática (sem clique)

O gasclaw cria um projeto novo no Google Cloud, com nome aleatório no formato `gasclaw-dev-<6 hex>`:

```
▸ creating GCP project gasclaw-dev-a1b2c3
Create in progress for [https://cloudresourcemanager.googleapis.com/v1/projects/gasclaw-dev-a1b2c3].
Waiting for [operations/create_project.global....] to finish...
.done.
```

Em seguida habilita **11 APIs** nesse projeto:

| API | Para quê |
|---|---|
| `script.googleapis.com` | criar e publicar o projeto Apps Script |
| `chat.googleapis.com` | app do Google Chat (só usado em Workspace) |
| `iamcredentials.googleapis.com` | gerar tokens da identidade de serviço |
| `drive.googleapis.com` | ler a pasta do agente no Drive |
| `sheets.googleapis.com` | planilha de execuções (`./gasclaw runs`) |
| `logging.googleapis.com` | logs (`./gasclaw logs`) |
| `monitoring.googleapis.com` | painel de limites (`./gasclaw limits`) |
| `tasks.googleapis.com` | ferramenta de tarefas do agente |
| `people.googleapis.com` | ferramenta de contatos do agente |
| `calendar-json.googleapis.com` | ferramenta de agenda do agente |
| `gmail.googleapis.com` | ferramenta de e-mail do agente |

> **Esta etapa demora e é silenciosa.** Leva vários minutos e imprime apenas duas linhas
> `Operation "operations/acat.p2-..." finished successfully.` Não indica progresso nem quantas APIs faltam.
> É normal. Não interrompa.

### PAUSA 2 — Tela de consentimento OAuth

```
⏸  OAuth consent screen: audience EXTERNAL, app name 'gasclaw',
   support email voce@gmail.com. Save, then under 'Test users' add voce@gmail.com.
   Press Enter when you are done…
```

Página aberta: **`https://console.cloud.google.com/auth/branding?project=SEU-PROJETO`**

> A mensagem do terminal resume 3 campos, mas o assistente real tem **4 etapas mais um aceite de política**.
> Siga a lista abaixo, não a mensagem.

Se a plataforma ainda não estiver configurada, a tela mostra "A plataforma de autenticação do Google ainda
não está configurada". Clique em **Vamos começar**.

O assistente **Configuração do projeto** tem quatro seções numeradas:

**Etapa 1 — Informações do app**
- **Nome do app**: `gasclaw`
- **E-mail para suporte do usuário**: escolha sua conta no seletor
- **Avançar**

**Etapa 2 — Público**
- Escolha **Externo**.
  - `Interno` só existe em Google Workspace e ficaria restrito à organização.
  - Em conta pessoal, **Externo é a única opção válida**. O app fica em modo "Testando", acessível só a
    usuários de teste que você listar.
  - `Workspace:` aqui você escolhe **Interno**, e não precisa cadastrar usuário de teste — pule a 3.3.
- **Avançar**

**Etapa 3 — Dados de contato**
- **Endereços de e-mail**: digite seu e-mail e pressione Enter para virar um chip.
- É onde o Google avisa sobre mudanças no projeto. Campo **obrigatório**.
- **Avançar**

**Etapa 4 — Concluir**
- Marque **"Eu concordo com a política de dados do usuário dos serviços de API do Google"**.
- **Continuar** e depois **Criar**.

> Se aparecer *"Ocorreu um erro ao criar a configuração do OAuth. Falha na criação porque a marca foi criada
> durante a edição."* — isso acontece com duplo clique em **Criar**. A configuração provavelmente **foi**
> criada: recarregue a página de Branding e confira. Se o nome `gasclaw` estiver lá, siga em frente.

### 3.3 — Adicionar você como usuário de teste (só conta pessoal)

Menu lateral → **Público-alvo** (`https://console.cloud.google.com/auth/audience?project=SEU-PROJETO`)

Confira no alto: **Status de publicação** `Testando` e **Tipo de usuário** `Externo`.

Role até **Usuários de teste**:

1. **+ Add users**
2. Digite seu e-mail e pressione Enter (vira um chip, contador vai para `1 / 100`)
3. **Salvar**

**Se você pular isto, o Google recusa a autorização dos escopos mais adiante** — um app "Externo" em modo
Testando só autoriza quem estiver nessa lista.

Volte ao terminal e aperte **Enter**.

### 3.4 — Identidade do Google Chat (sem clique)

Logo depois o gasclaw cria uma conta de serviço, **sem gerar chave**:

```
▸ creating the Google Chat identity
Created service account [gasclaw-chat].
Created role [gasclawChatTokenMinter].
✓ Chat identity, no key: gasclaw-chat@SEU-PROJETO.iam.gserviceaccount.com
```

É a identidade que o app do Google Chat usaria. Em conta pessoal ela é criada mas fica sem uso — o Chat
exige Workspace. Nenhuma credencial é baixada para o seu computador: o token é gerado sob demanda via
`iamcredentials` ([ADR-029](../adr/029-autoridade-do-run-no-ponteiro.md) explica por que nenhuma chave é
armazenada).

---

## Passo 4 — OpenRouter key

O menu pede a chave com **digitação oculta** (nada aparece na tela enquanto você digita, nem asteriscos):

```
  An OpenRouter key looks like sk-or-v1-...  Get one at https://openrouter.ai/keys
  Paste it here (input is hidden, Enter to skip):
```

Cole e pressione Enter. Ela é gravada em `.env.local` com permissão `600`, e esse arquivo está no
`.gitignore` — nunca vai para o repositório. A chave precisa começar com `sk-or-`; qualquer outra coisa é
recusada.

Enter vazio pula o passo. Você também pode colar a chave depois, direto no campo **OpenRouter key** do
painel — nesse caso ela nem passa pelo seu disco.

---

## Passo 5 — Web app (dev)

O gasclaw roda os testes, compila, cria o projeto Apps Script, envia o código, publica uma versão e pede a
primeira autorização.

### PAUSA 3 — Vincular o projeto Apps Script ao projeto do Google Cloud

```
⏸  Project Settings → Google Cloud Platform (GCP) Project → Change project →
   paste the number 000000000000 → Set project.
   Press Enter when you are done…
```

Página aberta: as configurações do projeto Apps Script recém-criado
(`https://script.google.com/home/projects/SEU-SCRIPT-ID/settings`)

> Os nomes na mensagem estão em inglês; numa conta em português os botões são outros. A correspondência:

1. Role até **Projeto do Google Cloud Platform (GCP)** — ela mostra `GCP: Padrão`
2. **Alterar projeto** (*Change project*)
3. No campo **Número do projeto do GCP**, cole o número que o terminal mostrou (só dígitos)
4. **Definir projeto** (*Set project*)
5. A tela passa a mostrar **Número do projeto: …**
6. Volte ao terminal e aperte **Enter**

O aviso da própria página vale a leitura: trocar o projeto GCP **revoga permanentemente** as autorizações já
dadas no projeto antigo, e não dá para voltar atrás pelo Apps Script. Como aqui o projeto acabou de nascer,
não há nada a perder.

> Você **não** precisa mexer em "Propriedades do script", logo abaixo na mesma página.

### 5.2 — Publicação (sem clique)

```
✓ editor files preserved: 0
✓ bundle verified: 41 global functions, 307072 bytes
▸ push (dev)
✓ remote HEAD verified: engine, screens and manifest identical to the build (15 scopes)
✓ version 1 verified: identical to the build
✓ dev on version 1 → https://script.google.com/macros/s/<ID>/exec
✓ CLI secret generated in .env.local
```

**Confira o formato da URL.** Em conta pessoal ela tem de ser `https://script.google.com/macros/s/<ID>/exec`.
Se aparecer `/a/macros/<dominio>/` numa conta Gmail, está errado — essa forma só existe em Workspace e o
endereço não vai responder.

Você provavelmente verá este aviso, e ele é **esperado** nesta altura:

```
! CLI secret not registered (<html><head><title>Authorization needed</title>...
```

Significa apenas que o web app ainda não foi autorizado — é o que a próxima pausa resolve. Rode
`./gasclaw up` de novo depois de autorizar e o aviso some.

### PAUSA 4 — Primeira autorização

```
⏸  In the tab that just opened, choose your account and click Allow (first authorization).
   Press Enter when you are done…
```

A aba abre a URL do web app e mostra **gasclaw (Unverified)** com o aviso "consider whether you trust
gasclaw". **Isso é esperado** e não é sinal de problema: o app é seu, está em modo Testando e não passou
pela verificação da Google, que só é exigida para apps distribuídos publicamente.

1. **REVIEW PERMISSIONS**
2. Abre uma **janela popup** de login. Escolha sua conta.
3. Aparece **"O Google não verificou este app"** → **Avançado** → **Acessar gasclaw (não seguro)**
4. Revise as permissões e clique em **Continuar** / **Permitir**
5. A aba original sai de "Waiting for authorization…" e carrega o painel
6. Volte ao terminal e aperte **Enter**

> Se a popup não abrir, verifique o bloqueador de pop-ups. Se você fechar por engano, recarregue a URL do
> web app e recomece.

#### As 15 permissões que o gasclaw pede

É a lista de `oauthScopes` do `appsscript.json`. Todas valem **dentro da sua própria conta** — o script roda
como você (`executeAs: USER_DEPLOYING`) e o web app é privado (`access: MYSELF`).

| Escopo | Para quê |
|---|---|
| `drive` | ler a pasta do agente e os arquivos markdown |
| `script.external_request` | chamar o OpenRouter |
| `userinfo.email` | saber quem é o dono |
| `script.scriptapp` | criar o gatilho de 1 minuto (o worker) |
| `script.processes` | listar execuções |
| `script.send_mail` | enviar e-mail pelo Apps Script |
| `gmail.readonly` | ferramenta de leitura de e-mail do agente |
| `gmail.compose` | ferramenta de rascunho de e-mail do agente |
| `calendar.events` | ferramenta de agenda do agente |
| `calendar.events.freebusy` | ver disponibilidade |
| `tasks` | ferramenta de tarefas do agente |
| `contacts.readonly` | ferramenta de contatos do agente |
| `contacts.other.readonly` | contatos secundários |
| `monitoring.read` | painel de limites |
| `iam` | identidade de serviço do Chat |

As ferramentas de Gmail, Agenda, Tarefas e Contatos são **opcionais por agente**: os escopos são pedidos uma
vez na autorização, mas cada ferramenta só é ligada se você mandar, no painel ou com `./gasclaw tools`.
Nenhuma fica ativa por padrão ([ADR-021](../adr/021-acesso-aprovado-no-painel.md)).

> **Consentimento granular.** O Google permite desmarcar escopos individuais nessa tela. Se você desmarcar
> algum, o gasclaw avisa depois: `missing Google permissions: …`. O jeito mais simples de resolver é o botão
> **Authorize permissions** no topo do painel.

---

## Passo 6 — Your first agent

```
▸ the panel opens: click "New agent", pick a name, and come back
  Press Enter when the agent is created…
```

No painel: **New agent** → dê um nome → volte ao terminal e aperte **Enter**.

O gasclaw cria no seu Drive uma pasta com quatro arquivos markdown, a partir de modelos, e **nunca
sobrescreve** um arquivo que já exista:

```
Meu Drive/gasclaw/agents/<nome>/
├── AGENTS.md     regras; o frontmatter é a configuração do agente
├── SOUL.md       personalidade e tom
├── IDENTITY.md   nome e emoji
└── USER.md       quem o agente atende
```

Editar qualquer um desses arquivos muda o comportamento na próxima mensagem, sem republicar nada.

> **O painel precisa ser aberto pelo menos uma vez.** É ao carregar que ele cria o gatilho de 1 minuto — o
> worker que faz o agente responder. Sem isso o agente é instalado e nunca responde. Se o `up` terminar
> dizendo `the 1-minute worker is NOT active`, abra a URL do painel e recarregue.

---

## Passo 7 — Google Chat

Em conta pessoal, o menu mostra:

```
— 7  Google Chat            not available on personal accounts (needs Google Workspace)
```

**Isso está correto e não há nada a fazer.** App de Google Chat exige Google Workspace. Uma assinatura do
Google One **não** resolve: é armazenamento, não Workspace. Todo o resto — painel, chat pela web, agentes,
ferramentas do Google — funciona normalmente.

`Workspace:` o passo abre a configuração da Chat API no console e pede: **App name** `gasclaw`, ligar
**Interactive features**, escolher **App URL** e colar a URL do web app. Depois **Save**.

---

## Workspace: console de administração

Só para domínios gerenciados, e só se a organização restringir apps de terceiros. Precisa de Super Admin,
uma vez:

- **Segurança → Acesso e controle de dados → Controles de API → Gerenciar acesso de apps de terceiros:**
  marque o OAuth client do gasclaw, o clasp e o gcloud como **Confiável**.
- **Segurança → Controle de sessão do Google Cloud:** ligue **Exempt trusted apps**.
- Se **URL Fetch allowlist** estiver ativa: libere `openrouter.ai`.

Sem isso, o login falha com `admin_policy_enforced`, e o token do CI expira com `invalid_grant`.

---

## Reautorização quando entram escopos novos

Quando o `appsscript.json` ganha escopos ([ADR-015](../adr/015-escopos-oauth.md)), abra o painel uma vez e
clique em **Authorize permissions**. Até lá, o gatilho de 1 min, os processos e o Monitoring aparecem como
"awaiting authorization" ou "pending" no painel de limites.

---

## Diferenças entre conta pessoal e Workspace

| | Workspace | Pessoal (Gmail) |
|---|---|---|
| Painel, chat web, agentes, ferramentas Google | sim | sim |
| App do Google Chat | sim | **não** |
| Público da tela de consentimento | `Interno` | `Externo` + usuário de teste |
| Usuário de teste obrigatório | não | **sim** |
| Formato da URL do web app | `/a/macros/<dominio>/s/<id>/exec` | `/macros/s/<id>/exec` |
| Gatilho diário do Apps Script | 6 h | 90 min |
| Chamadas UrlFetch por dia | 100.000 | 20.000 |
| E-mails por dia | 1.500 | 100 |

---

## Verificação e problemas comuns

```bash
./gasclaw doctor
```

Tudo verde é assim:

```
✓ Node ≥ 20
✓ gcloud installed
✓ login gcloud
✓ login clasp
✓ npm dependencies
✓ build and tests
✓ script dev created
✓ web app dev published
✓ OPENROUTER_API_KEY in .env.local
✓ remote health
```

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `gcloud not found` mesmo depois de instalar | PATH só é lido em terminal novo | Feche e reabra o Git Bash |
| `Authorization needed` em HTML no terminal | web app ainda não autorizado | Faça a PAUSA 4 e rode `./gasclaw up` de novo |
| Google recusa a autorização dos escopos | seu e-mail não está em "Usuários de teste" | Volte à etapa 3.3 |
| URL saiu com `/a/macros/` em conta Gmail | `ACCOUNT_KIND` gravado errado | Confira `ACCOUNT_KIND=personal` no `gasclaw.env` |
| Agente criado mas nunca responde | gatilho de 1 minuto não existe | Abra a URL do painel e recarregue |
| `the 1-minute worker is NOT active` | idem | idem |
| `missing Google permissions` | escopo desmarcado no consentimento granular | Botão **Authorize permissions** no painel |
| `admin_policy_enforced` no login | app não confiável no domínio | [Console de administração](#workspace-console-de-administração) |
| `invalid_grant` no CI | token expirou (controle de sessão / consentimento em Testando) | idem, e `./gasclaw doctor` |
| `clasp run` → `NOT_FOUND` | projeto GCP não vinculado | PAUSA 3 |
| `status` sem health remoto | login do gcloud sem acesso ao Drive | `gcloud auth login --enable-gdrive-access` |

Tudo que o setup grava fica em dois arquivos na raiz do projeto:

- `gasclaw.env` — ids do projeto, do script e da implantação, conta e tipo de conta, e as marcas de passo
  concluído. **Não** é versionado (está no `.gitignore`), mas não contém segredo.
- `.env.local` — `OPENROUTER_API_KEY` e `CLI_SECRET`. Permissão `600`, no `.gitignore`, **nunca** vai para o
  repositório.

Para refazer um passo manual, apague a linha correspondente do `gasclaw.env` (`APPS_SCRIPT_API_OK`,
`CONSENT_OK_DEV`, `GCP_LINKED_DEV`, `CHAT_OK_DEV`) e rode o passo de novo.

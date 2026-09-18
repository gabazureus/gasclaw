<p align="center">
  <img src="docs/assets/cover.png" alt="gasclaw — AI agents that live entirely inside Google Apps Script: an agent is a Google Drive folder of markdown files, and you talk to it in Google Chat" width="100%">
</p>

# gasclaw

**Agentes de IA que vivem inteiramente dentro do Google Apps Script. Sem servidor, sem hospedagem: um agente é uma pasta do Google Drive, e você conversa com ele pelo Google Chat.**

[![Licença: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime: Google Apps Script](https://img.shields.io/badge/runtime-Google%20Apps%20Script-4285F4.svg)](https://developers.google.com/apps-script)
[![Linguagem: TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6.svg)](https://www.typescriptlang.org/)
[![Status: F1 em andamento](https://img.shields.io/badge/status-F1%20in%20progress-yellow.svg)](CHANGELOG.md)

[English](README.md) | Português (Brasil)

## Por que gasclaw

- **Nada para hospedar.** O runtime roda na sua própria conta do Google, no Apps Script. Seu computador só compila o TypeScript e publica com o clasp.
- **Agentes são documentos, não código.** Cada agente é uma pasta do Drive com arquivos markdown (regras, personalidade, identidade, notas sobre o usuário). Editou um arquivo? A próxima mensagem já usa a versão nova, sem publicar de novo.
- **Onde seu time já conversa.** As conversas acontecem no Google Chat, em DM ou num espaço.
- **Qualquer modelo.** O LLM vem do OpenRouter, então um agente troca de modelo mudando uma linha.
- **Seguro por construção.** O gasclaw nunca executa código lido do Drive, só o dono consegue administrá-lo e o acesso é liberado por agente.

## Como funciona

```mermaid
flowchart LR
    user([Pessoa no Google Chat]) -->|mensagem| chat[Google Chat]
    chat -->|evento| gas[runtime gasclaw<br/>web app do Apps Script]
    gas -->|lê markdown| drive[(Pasta do agente<br/>no Google Drive)]
    gas -->|prompt| llm[OpenRouter]
    llm -->|resposta do modelo| gas
    gas -->|resposta| chat
    owner([Dono]) -->|tela gasclaw| gas
    dev[Seu computador<br/>./gasclaw] -.->|build + clasp push| gas
```

1. Chega uma mensagem do Google Chat. O gasclaw confere o botão de pânico e se quem mandou pode falar com o agente.
2. Ele lê a pasta do agente e monta o prompt a partir dos arquivos markdown.
3. Chama o modelo pelo OpenRouter e responde na mesma conversa, guardando um histórico curto das mensagens recentes.

Detalhes do design: [spec de design](docs/specs/2026-09-14-gasclaw-design.md) e [decisões de arquitetura](docs/adr/README.md).

## Status

**A etapa F0 está concluída, mas o gasclaw ainda não está pronto para produção.** Os dois ambientes (dev e prod) estão publicados no Google, e o agente de dev já responde no Google Chat. A publicação automática pelo GitHub/CI foi adiada; por enquanto, toda publicação passa pelo `./gasclaw`. A próxima etapa, F1, começa com uma prova de conceito de agentes escritos em Google Docs e Sheets nativos. Veja no [CHANGELOG.md](CHANGELOG.md) exatamente o que funciona, o que está em construção e o que está planejado.

## Instalação

Dois comandos. O segundo mostra um mapa e conduz você por ele.

```bash
git clone https://github.com/gabazureus/gasclaw.git && cd gasclaw
./gasclaw
```

Esse segundo comando abre o menu de setup:

```
🦀 gasclaw — agents that live in your Google Drive

  Setup · 0 of 7 done · environment: dev
  account not detected yet — run step 2

  ○ 1  Local tools            will install: node, gcloud, npm deps
  ○ 2  Google account         the account that will own the agents
  ○ 3  Google Cloud project   hosts the Apps Script project and its APIs
  ○ 4  OpenRouter key         the model provider — without it the agent cannot think
  ○ 5  Web app (dev)          puts the panel and the 1-minute worker online
  ○ 6  Your first agent       a Drive folder with four markdown files
  ○ 7  Google Chat            optional: talk to your agent from Google Chat

  [1-7] run a step   [a] run everything missing   [r] refresh   [d] diagnose   [q] quit

> 
```

Aperte `a` e ele faz tudo que falta. Aperte um número para fazer um passo por vez. Cada passo concluído
fica registrado, então rodar de novo nunca repete trabalho — e o `[d]` diz o que está quebrado e como
consertar.

Três dos sete passos exigem que você clique numa página do Google — ligar a API do Apps Script (passo 2), a
tela de consentimento OAuth (passo 3) e a primeira autorização (passo 5) — mais o app do Google Chat (passo
7), se você estiver no Workspace. O gasclaw pausa, abre a página certa, diz exatamente o que marcar e espera
o Enter.

**O que você precisa:** uma conta do Google e uma chave de API do [OpenRouter](https://openrouter.ai) — o
passo 4 pergunta por ela e grava em `.env.local`, que nunca é commitado.

**Onde roda:** macOS, Linux e Windows pelo WSL ou Git Bash (a CLI é um script bash; não há versão
PowerShell). No macOS o passo 1 instala o Node.js e a CLI do Google Cloud para você com o
[Homebrew](https://brew.sh). No Linux e no Windows ele confere o que falta e diz o comando exato para
instalar — os gerenciadores de pacote variam demais para o chute ser seguro.

### Workspace ou Gmail pessoal?

Os dois funcionam, e o gasclaw detecta qual é o seu no passo 2. O que difere:

| | Google Workspace | Gmail pessoal |
|---|---|---|
| Painel, conversa na tela, agentes, ferramentas do Google | ✅ | ✅ |
| **App do Google Chat** | ✅ | ❌ exige Workspace |
| Tempo diário de gatilho no Apps Script | 6 h | 90 min |
| Chamadas de UrlFetch por dia | 100.000 | 20.000 |
| E-mails por dia | 1.500 | 100 |
| Tela de consentimento OAuth | `INTERNAL`, um clique | `EXTERNAL`, e você precisa se add como usuário de teste |
| Endereço do web app | `script.google.com/a/macros/<seu-dominio>/…` | `script.google.com/macros/…` |

Em conta pessoal o passo 7 aparece como indisponível e o setup termina sem ele. Assinatura do Google One
**não** muda isso: é armazenamento, não Workspace.

Guia passo a passo: [docs/como-usar.md](docs/como-usar.md). Travou? Rode `./gasclaw doctor` e veja o [runbook de setup inicial](docs/runbooks/setup-inicial.md).

## Crie seu primeiro agente

Crie uma pasta vazia no Drive (por exemplo "Assistente") e adicione a URL dela na tela gasclaw (`./gasclaw open`). O gasclaw cria estes arquivos a partir de modelos e **nunca sobrescreve** um arquivo que já exista:

```
Assistente/
├── AGENTS.md     regras; o frontmatter é a configuração do agente
├── SOUL.md       personalidade e tom
├── IDENTITY.md   nome e emoji
└── USER.md       quem o agente atende
```

Todos os arquivos entram no prompt nesta ordem. Um arquivo que falte vira `(missing)`, em vez de erro.

Exemplo de `AGENTS.md`:

```markdown
---
model: openrouter/auto        # qualquer id de modelo do OpenRouter
users: [ana@exemplo.com, joao@exemplo.com]
---
# Regras
- Responda de forma curta e direta.
- Se não souber, diga que não sabe.
```

Frontmatter aceito:

- `model:` id de modelo do OpenRouter. O padrão é `openrouter/auto`. Um modelo escolhido para o agente na tela gasclaw tem precedência.
- `users: [e-mail, e-mail]` numa linha só. O dono sempre tem acesso; lista vazia significa só o dono.
- `tools: [now, memory, ask]` as ferramentas que o agente pode usar (`memory` libera `memory.save`, `memory.read` e `memory.remove`). Sem lista, nenhuma ferramenta.
- `steps:` máximo de chamadas ao modelo por turno, de 1 a 50 (padrão 10).
- Outras chaves são ignoradas, e chaves aninhadas não são aceitas.

Os arquivos do agente também podem ser Google Docs (com o nome `AGENTS` ou `AGENTS.md`, e assim por diante), e uma planilha Google chamada `config`, com linhas `chave, valor`, sobrepõe o frontmatter.

Depois, procure o app no Google Chat (`gasclaw dev`, ou `gasclaw` em prod), mande uma DM ou adicione o app a um espaço e mencione-o.

## Referência do CLI

Todos os comandos aceitam `--prod`; sem a flag, valem para dev.

| Comando | O que faz |
|---|---|
| `./gasclaw up [--prod]` | Configura (primeira vez), publica e abre a tela gasclaw |
| `./gasclaw down [--prod]` | Pausa todos os agentes (botão de pânico) |
| `./gasclaw restart [--prod]` | `down` seguido de `up` |
| `./gasclaw ship` | Publica em prod na mesma URL |
| `./gasclaw logs [--prod]` | Mostra os logs ao vivo |
| `./gasclaw status [--prod]` | Mostra IDs, URLs, implantações e health |
| `./gasclaw doctor [--prod]` | Diagnostica o setup e diz como corrigir |
| `./gasclaw rollback [--prod]` | Volta para a versão anterior |
| `./gasclaw open [--prod]` | Abre a tela gasclaw |
| `./gasclaw poc <id> [etapa]` | Roda uma POC no dev e mostra o resultado |
| `./gasclaw trace [id]` | Mostra a árvore de passos de um run do agente (sem id, o mais recente) |
| `./gasclaw runs` | Abre a planilha "gasclaw — execuções" |
| `./gasclaw limits [--fresh]` | Painel de limites (Google, OpenRouter e medido pelo gasclaw) |
| `./gasclaw usage [AAAA-MM-DD]` | Custo por modelo: últimos 7 dias, ou as 24 horas de um dia |
| `./gasclaw eval <cenário\|--all> [--model id]` | Roda `evals/*.md` no dev (sai com erro se falhar) |
| `./gasclaw tools all\|none\|<a,b,c> [pasta]` | Liga e desliga as ferramentas do agente |
| `./gasclaw onboard` | Menu guiado de setup (o padrão antes de qualquer publicação) |

## Roadmap

| Etapa | Objetivo | Status |
|---|---|---|
| F0 | Primeira conversa com um agente do Drive: publicação com um comando, pasta do agente, tela do dono, respostas no Google Chat, acesso por agente, botão de pânico | Concluída (GitHub/CI adiado) |
| F1 | Pasta do agente completa: conversas guardadas no Drive, memória diária, ritual de estreia, skills, vários agentes, grupos do Google em `users`, publicação mais segura | Em andamento |
| F2 | Tarefas longas: trabalho em segundo plano além de 30 s, ferramentas Gmail/Drive/Sheets/Docs/Agenda/HTTP (usando os cards Aprovar/Negar que já existem na F1), limites por tarefa, novas tentativas | Em construção |
| F3 | Proatividade e dados: checklist `HEARTBEAT.md`, `jobs.md` em formato cron, pasta de entrada `.xlsx` para Google Sheets, modelos prontos de agente | Planejado |
| F4 | Canais extras: threads do Gmail, HTTP com token, MCP/A2A se a POC do GASADK aprovar, `npx gasclaw` | Planejado |

A descrição detalhada de cada etapa, do ponto de vista de quem usa, está no [CHANGELOG.md](CHANGELOG.md).

## Limites conhecidos

Limites atuais:

- As ferramentas do Google valem só para o dono: quem foi aprovado no painel conversa com o agente, mas um pedido dessa pessoa que usaria Gmail, Agenda, Contatos, Tarefas ou Drive/Docs/Planilhas é recusado.
- Só **um** agente (o padrão) responde no Chat, em todos os espaços.
- Memória curta: as últimas 20 mensagens por agente e por conversa, por até 6 horas.
- Cada arquivo do agente é cortado em 20.000 caracteres (60.000 no total).
- Respostas limitadas a 1.000 tokens, porque o Google Chat espera no máximo 30 segundos; um modelo lento faz o Chat avisar que o app não respondeu.
- `users` aceita só e-mails, não grupos.
- Sem nova tentativa automática quando o OpenRouter falha (429/5xx).
- Só o macOS instala as ferramentas que faltam para você (com o Homebrew). No Linux e no Windows o gasclaw diz o comando exato e você roda.
- O app do Google Chat exige Google Workspace. Em Gmail pessoal todo o resto funciona (painel, conversa na tela, agentes, ferramentas do Google), e a cota diária de gatilho do Apps Script é de 90 min em vez de 6 h.

## Segurança

- Segredos ficam só em `.env.local` (ignorado pelo git) e na tela gasclaw, que só o dono acessa, guardados nas Script Properties. Nunca no Drive nem no git.
- Sem `eval` e sem código carregado do Drive: um agente é só markdown.
- Só o dono (a conta que publicou) abre a tela gasclaw; cada agente responde só ao dono e às pessoas que o dono aprovou nessa tela.
- ⚠️ Mudança de acesso ([ADR-021](docs/adr/021-acesso-aprovado-no-painel.md)): quem conversa com o agente e quais ferramentas ele usa passam a valer só depois de aprovados no painel do gasclaw. `users:` e `tools:` na pasta, no editor ou na planilha `config` viram sugestões. Depois desta versão, todo agente responde só ao dono e fica sem ferramentas até você clicar em **Aprovar** no painel. Se você usava `users:` para dar acesso a outras pessoas, aprove essas pessoas no painel.
- Ferramentas do Google (agenda, Gmail, contatos, tarefas, Drive/Docs/Sheets) funcionam só para o dono do gasclaw. Pessoas aprovadas no painel continuam conversando com o agente, mas pedidos delas que usem essas ferramentas são recusados, e só o dono aprova esses cards. O card de aprovação mostra cada campo por inteiro (destinatários, convidados, ids); só o texto longo é resumido ([ADR-023](docs/adr/023-ferramentas-do-workspace.md)).
- Ações com efeito (`./gasclaw poc`, `eval`, `down`) usam POST com um segredo da CLI gerado pelo `./gasclaw up` em `.env.local` ([ADR-022](docs/adr/022-csrf-segredo-da-cli.md)).
- `./gasclaw down` ou "Pausar" na tela param todos os agentes na hora.

**Encontrou uma vulnerabilidade?** Não abra uma issue pública. Mande um e-mail para **gabriel.br@gmail.com**; detalhes em [CONTRIBUTING.md](CONTRIBUTING.md#reporting-security-vulnerabilities) (em inglês).

## Como contribuir

Contribuições são bem-vindas. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) (em inglês) para o setup (`npm ci`, `npm run build`, `npm test`), as regras do projeto, o fluxo com testes primeiro e o checklist de pull request. Os commits seguem Conventional Commits e exigem sign-off DCO (`git commit -s`). Este projeto segue o [Código de Conduta](CODE_OF_CONDUCT.md).

A documentação do projeto está indexada em [docs/README.md](docs/README.md).

## Licença

Licenciado sob a [Licença MIT](LICENSE). Copyright (c) 2026 Gabriel Sorrentino. Veja [LICENSING.md](LICENSING.md) para contribuições, licenças das dependências e marcas.

Google, Google Apps Script, Google Drive e Google Chat são marcas da Google LLC; OpenRouter pertence ao seu dono. O gasclaw não é afiliado a eles nem endossado por eles.

## Agradecimentos

O gasclaw aproveita ideias (não dependências de código) de:

- [vercel/eve](https://github.com/vercel/eve) (Apache-2.0): a pasta como interface de autoria, aprovação por ferramenta, checkpoint por passo.
- [openclaw/openclaw](https://github.com/openclaw/openclaw) (MIT): arquivos do workspace, ritual de estreia, heartbeat, memória diária, cards de aprovação no Chat.
- [tanaikech/adk-gas](https://github.com/tanaikech/adk-gas) (MIT): planejamento de agentes e proteção de timeout e contexto no Apps Script.
- [google/clasp](https://github.com/google/clasp) (Apache-2.0): publicar Apps Script pela linha de comando.

Construído com [devmode](https://github.com/fluencer-ai/devmode).

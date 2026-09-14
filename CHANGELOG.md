# Changelog — gasclaw

> **Regra de manutenção:** sempre que uma capacidade do produto mudar (algo que você passa a poder, ou deixa de poder, fazer), atualize este arquivo no mesmo commit.

O que o gasclaw faz em cada etapa, contado por quem usa.

- Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); o projeto vai adotar [Versionamento Semântico](https://semver.org/lang/pt-BR/) a partir da primeira versão publicada.
- Status: ✅ disponível · 🔄 em construção · ⏳ planejado.
- Como usar: [docs/como-usar.md](docs/como-usar.md).

## [Não publicado]

### F0 — Primeira conversa com um agente do Drive 🔄

**Hoje:** o ambiente **dev está no ar e já dá para usar**. O agente responde no Google Chat usando a pasta do Drive. A pausa (`down`), a reativação (`up`) e o `rollback` foram testados de verdade, e a POC P1 mostrou que chamadas longas ao OpenRouter, de mais de 2 minutos, funcionam ([ADR-010](docs/adr/010-poc-p1-urlfetch.md)).
Ainda faltam: o ambiente prod, a publicação automática pelo GitHub e o teste com outra pessoa do domínio.

Detalhes técnicos: [plano F0](docs/plans/2026-09-14-gasclaw-f0-plano-implementacao.md), Tasks 0–8 concluídas, Task 9 em andamento, Tasks 10–11 pendentes.

#### Adicionado

- 🔄 **Um comando para publicar e operar:** `./gasclaw up` instala o que falta, cria o projeto e publica. Nos passos que só dão para fazer clicando, ele pausa e abre a página certa. Depois disso, `down`, `status`, `logs`, `doctor`, `rollback`, `open` e `ship` cuidam do dia a dia.
- 🔄 **Agente = pasta do Google Drive:** você cola a URL da pasta, e o gasclaw cria `AGENTS.md`, `SOUL.md`, `IDENTITY.md` e `USER.md` a partir de modelos, sem sobrescrever o que já existe. Mudou um arquivo? A próxima mensagem já usa a versão nova, sem publicar de novo.
- 🔄 **Tela gasclaw** (só o dono acessa): salvar a chave do OpenRouter, adicionar e remover agentes, escolher o agente ⭐, testar uma pergunta e pausar ou reativar tudo.
- 🔄 **Conversa no Google Chat:** o agente ⭐ responde no Google Chat usando os markdown da pasta do Drive, em DM ou num espaço, e lembra das mensagens recentes.
- 🔄 **Controle de acesso por agente:** só falam com o agente o dono e os e-mails listados em `users` no `AGENTS.md`.
- 🔄 **Botão de pânico:** `./gasclaw down` ou "Pausar" na tela; o Chat passa a responder que o gasclaw está pausado.
- ⏳ **Publicação automática:** repositório privado no GitHub, com publicação em dev e prod a cada push.

#### Alterado

- A resposta no Google Chat, que a spec colocava na F1, foi antecipada para a F0 numa versão simples (síncrona e com memória curta), para existir algo utilizável já na primeira etapa.

#### Segurança

- A chave do OpenRouter apareceu parcialmente numa sessão local; `.env` foi adicionado ao `.gitignore`.

#### O que ainda não faz / limites

- Só conversa: não envia e-mail, não mexe em planilha, não agenda nada (ferramentas chegam na F2).
- Só **um** agente responde no Chat, o ⭐, em todos os espaços.
- Memória curta: as últimas 20 mensagens por agente e por conversa, por até 6 h. Depois disso, o agente esquece.
- Cada arquivo da pasta é cortado em 20.000 caracteres (60.000 no total).
- Resposta curta (até 1.000 tokens), porque o Chat espera no máximo 30 s. Modelo lento = o Chat mostra que o app não respondeu.
- `users` aceita só e-mails, não grupos.
- Sem nova tentativa automática quando o OpenRouter falha (429/5xx).

## Próximas etapas

### F1 — Agente-pasta completo ⏳

- **Primeiro item: agentes em Google Docs e Sheets nativos.** Você vai poder escrever o agente num Google Doc comum, com comentários, histórico e edição pelo celular, e guardar os dados em Google Sheets em vez de CSV. Os arquivos `.md` continuam aceitos. Isso depende da POC P6, que mede tempo e fidelidade da leitura; se passar, a mudança é registrada no ADR-012.
- Conversas guardadas no Drive, sem o limite de 6 h, com resumo automático quando ficam longas.
- Memória: o agente anota fatos em `memory/AAAA-MM-DD.md`; `MEMORY.md` só é lido na DM do dono.
- Ritual de estreia (`BOOTSTRAP.md`): na primeira conversa, o agente pergunta seu nome e estilo.
- Skills: `skills/<nome>/SKILL.md`, lidas quando o agente precisa.
- Vários agentes: cada espaço do Chat ligado ao seu agente; na DM responde o ⭐.
- Grupos do Google em `users`.
- Publicação mais segura: detecta mudanças feitas direto no editor, guarda só as 5 últimas versões e volta sozinha para a anterior se o health falhar.
- "Verificar" na tela: checa pasta, arquivos, chamada real ao modelo e Chat configurado.

### F2 — Tarefas longas e aprovação ⏳

- Tarefas que passam de 30 s: o agente responde "pensando…" e continua em segundo plano, sem perder o progresso entre execuções.
- Ferramentas: Gmail, Drive, Sheets, Docs, Agenda e HTTP (só para hosts liberados em `http_allow`).
- Cards **Aprovar/Negar** no Chat antes de ações com efeito. Sem resposta, a ação é negada.
- Limites por tarefa (`steps`, `usd_per_run`) e nova tentativa automática quando o OpenRouter falha.

### F3 — Proatividade e dados ⏳

- `HEARTBEAT.md`: o agente confere uma checklist a cada 30 min, no horário ativo, e só fala se houver algo.
- `jobs.md`: agendamentos em formato cron (ex.: briefing do dia às 7h).
- Pasta `inbox/`: arquivos `.xlsx` soltos ali viram Google Sheets.
- Modelos prontos de agente: assistente executivo e analista de planilhas.

### F4 — Canais extras ⏳

- Gmail: e-mails com a label `gasclaw` viram tarefas, e a resposta sai na própria thread.
- Chamada por HTTP com token; MCP/A2A se a POC do GASADK aprovar.
- `npx gasclaw` para qualquer pessoa instalar.

<!-- Único lugar com o endereço do repositório: troque OWNER pelo dono real antes de abrir o repo. -->
[Não publicado]: https://github.com/OWNER/gasclaw/commits/main

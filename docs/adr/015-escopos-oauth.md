# ADR-015 — Escopos OAuth mínimos: gatilho de 1 min, ferramentas do Workspace e painel de limites

- **Status:** Aceito · 2026-09-15 · decisão do usuário: uma única reautorização no dev · prod ainda não recebeu

## Contexto
O lote de 1 min do trace (ADR-014) precisa de um gatilho de tempo, e as ferramentas do protótipo
(Pista Motor) vão ler e buscar no Gmail, rascunhar e enviar com aprovação, listar, criar e alterar
eventos da Agenda, ler e criar Docs e ler e escrever Sheets. HTTP genérico fica de fora. O usuário
preferiu reautorizar uma vez só. A regra é pedir o menor escopo de cada coisa.

## Fonte da verdade (documentação oficial, conferida em 2026-09-15)
- `ScriptApp.newTrigger` e `getProjectTriggers`: exigem `script.scriptapp`.
- Gmail API: `gmail.readonly` para ler e buscar; `gmail.compose` para *"Manage drafts and send emails"* (rascunhos e envio).
  `GmailApp` exige `https://mail.google.com/`, que também permite apagar permanentemente.
- Calendar API: `calendar.events` para *"View and edit events on all your calendars"*.
  `CalendarApp` exige `calendar` (inclui configurações e agendas).
- Docs API (`documents.get`) e Sheets API (`values.append`): aceitam `drive`, que já está no manifesto.
- Apps Script API `processes.list`: exige `script.processes` (único escopo aceito).
- `MailApp.getRemainingDailyQuota()`: exige `script.send_mail` (único escopo aceito).
- Cloud Monitoring `projects.timeSeries.list`: aceita `cloud-platform`, `monitoring` ou `monitoring.read`; o mais restrito é `monitoring.read`.
- Tasks API `tasks.insert`: só aceita `tasks`.
- People API `people.searchContacts`: aceita `contacts` ou `contacts.readonly`. `otherContacts.search`: só aceita `contacts.other.readonly`.
- Calendar API `freebusy.query`: aceita `calendar.readonly`, `calendar`, `calendar.events.freebusy` ou `calendar.freebusy`. O `calendar.events` que já está no manifesto **não** é aceito.
- Tarefas, Contatos e FreeBusy (aprovados pelo usuário em 2026-09-15) entram na mesma reautorização; as ferramentas vêm na E6 (Pista Motor). O `ensure_gcp` habilita `tasks.googleapis.com` e `people.googleapis.com` (idempotente).
- Painel de limites (decisão do usuário, 2026-09-15): fontes = todas (as atuais, mais execuções e e-mails restantes do Google e métricas do Google Cloud); exibição na tela, no terminal e na planilha; cache de 10 min. Os escopos entram nesta mesma reautorização.

## Projeto GCP padrão (sem migração nova)
A pesquisa apontava que ler métricas do Cloud exigiria migrar o script para um projeto GCP padrão,
sem volta. **Dev e prod já estão ligados a projetos padrão** desde a Task 9/10. Conferido em
2026-09-15 com `gcloud projects describe` e com `GCP_LINKED_*=1` no `gasclaw.env`:
- dev: `gasclaw-dev-example`, número 000000000001, `ACTIVE`;
- prod: `gasclaw-prod-example`, número 000000000002, `ACTIVE`.

Nos dois, `script.googleapis.com` e `monitoring.googleapis.com` já estão habilitados. O `ensure_gcp` passa a
habilitar `monitoring.googleapis.com` também em projetos novos (idempotente).

## Decisão
| Escopo | Para quê | Por que não um maior/menor |
|---|---|---|
| `drive` (já existia) | pastas dos agentes, runs, **Docs e Sheets pela API REST** | já cobre Docs e Sheets pela API; `documents`/`spreadsheets` não entram |
| `script.external_request` (já existia) | UrlFetch (OpenRouter e APIs do Google) | — |
| `userinfo.email` (já existia) | dono e usuários | — |
| `script.scriptapp` **(novo)** | criar, de forma idempotente, o gatilho de 1 min que grava o lote do trace | único escopo aceito por `newTrigger` |
| `gmail.readonly` **(novo)** | ler e buscar mensagens | `gmail.metadata` não traz o corpo; `gmail.modify` e `mail.google.com` dão mais do que precisa |
| `gmail.compose` **(novo)** | criar rascunho e enviar depois de aprovado | cobre rascunho **e** envio; `gmail.send` sozinho não cria rascunho |
| `calendar.events` **(novo)** | listar, criar e alterar eventos | `calendar` inteiro inclui configurações; `calendar.events.owned` bloqueia agendas compartilhadas |
| `script.processes` **(novo)** | painel de limites: duração e contagem das execuções (`processes.list`) | único escopo aceito; só leitura das execuções |
| `script.send_mail` **(novo)** | painel de limites: e-mails restantes no dia (`MailApp.getRemainingDailyQuota`) | único escopo aceito; o gasclaw não usa o `MailApp` para enviar (envio passa pelo `gmail.compose` com aprovação) |
| `monitoring.read` **(novo)** | painel de limites: métricas do Google Cloud (`timeSeries.list`) | `cloud-platform` dá acesso a todo o Google Cloud; `monitoring` permite escrever |
| `tasks` **(novo)** | Tarefas: listar e criar tarefas (E6, Pista Motor) | `tasks.insert` só aceita `tasks`; `tasks.readonly` não cria |
| `contacts.readonly` **(novo)** | Contatos: buscar e listar os contatos salvos (`people.searchContacts`, `connections.list`) | `searchContacts` aceita `contacts` ou `contacts.readonly`; o agente não edita contatos |
| `contacts.other.readonly` **(novo)** | "Outros contatos": achar quem só trocou e-mail com o usuário (`otherContacts.search`) | único escopo aceito; o `contacts.readonly` não cobre outros contatos |
| `calendar.events.freebusy` **(novo)** | FreeBusy: ver se as pessoas estão livres antes de sugerir horário (`freebusy.query`) | pedido era `calendar.freebusy`, mas ele só vale para *"your calendars"*; `calendar.events.freebusy` cobre *"calendars you have access to"* (outras pessoas) e continua só com livre/ocupado, sem detalhes dos eventos; `calendar.events` não é aceito pelo `freebusy.query` |

**Consequência de desenho:** as ferramentas usam as **APIs REST via UrlFetch** (Gmail, Calendar,
Docs, Sheets) com o token do script. `GmailApp`, `CalendarApp`, `DocumentApp` e
`SpreadsheetApp` não são usados, porque exigiriam escopos maiores e uma segunda reautorização.

## Consequências
- Todos os usuários do dev autorizam de novo uma vez. Enquanto isso não acontece, o web app e o
  Chat do dev pedem autorização em vez de responder.
- `gmail.readonly` e `gmail.compose` são escopos **restritos**. Num app interno do Workspace isso
  não exige verificação do Google. Se o app um dia for externo, exige.
- O envio de e-mail sempre passa por aprovação no fluxo do agente (ADR-005, F2): o escopo permite, a política decide.
- `script.processes` e `monitoring.read` são chamados pela API REST com `ScriptApp.getOAuthToken()`.
  Se algum deles recusar esse token na prática, a POC P15 registra o erro e o escopo sai numa próxima
  revisão. Não é trocado por um escopo maior.
- Prod só recebe estes escopos quando o usuário decidir levar as ferramentas e o lote para lá.

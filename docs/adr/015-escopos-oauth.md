# ADR-015 — Escopos OAuth mínimos: gatilho de 1 min + ferramentas do Workspace

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

**Consequência de desenho:** as ferramentas usam as **APIs REST via UrlFetch** (Gmail, Calendar,
Docs, Sheets) com o token do script. `GmailApp`, `CalendarApp`, `DocumentApp` e
`SpreadsheetApp` não são usados, porque exigiriam escopos maiores e uma segunda reautorização.

## Consequências
- Todos os usuários do dev autorizam de novo uma vez. Enquanto isso não acontece, o web app e o
  Chat do dev pedem autorização em vez de responder.
- `gmail.readonly` e `gmail.compose` são escopos **restritos**. Num app interno do Workspace isso
  não exige verificação do Google. Se o app um dia for externo, exige.
- O envio de e-mail sempre passa por aprovação no fluxo do agente (ADR-005, F2): o escopo permite, a política decide.
- Prod só recebe estes escopos quando o usuário decidir levar as ferramentas e o lote para lá.

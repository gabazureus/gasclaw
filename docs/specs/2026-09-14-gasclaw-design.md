# gasclaw — Design (spec)

- **Data:** 2026-09-14 · **Status:** aprovado em entrevista, aguardando revisão escrita
- **Decisões:** `docs/adr/` · **Pesquisa:** `docs/raw/sources/` e `docs/wiki/`

## 1. Objetivo

Rodar agentes de IA **100% dentro do Google Apps Script** do Workspace do usuário, sem
hospedagem. Um agente é **uma pasta no Google Drive**; o usuário cola a URL na tela do
gasclaw e conversa pelo **Google Chat**. Após um setup inicial único, tudo opera sozinho.

Inspirações (ideias, não dependências): **Eve** (pasta como interface de autoria, aprovação
por tool, checkpoint por step), **OpenClaw** (arquivos do workspace, ritual de estreia,
heartbeat, memória diária, standing orders, cards de aprovação no Chat), **GASADK**
(planner/hooks em GAS, proteção de timeout e contexto).

## 2. Não-objetivos

Execução de código arbitrário/sandbox; automação de browser; modelos locais; compatibilidade
com o pacote `eve`; UI de chat web própria; múltiplos provedores de LLM no MVP; embeddings.

## 3. Experiência do usuário

1. **Uma vez:** `./gasclaw up` guia o setup inicial (§9).
2. Cria uma pasta no Drive (ex.: "Assistente") no Shared Drive `gasclaw`.
3. Abre a tela **gasclaw** (web app, acesso DOMAIN), cola a URL da pasta, clica **Verificar**:
   o sistema cria os arquivos que faltam e roda o *doctor* (pasta legível, arquivos, chamada
   real ao OpenRouter, triggers, Chat).
4. Fala com **gasclaw** no Google Chat (DM ou espaço). Na primeira conversa roda o ritual
   `BOOTSTRAP.md` (o agente pergunta seu nome/estilo e se apaga ao terminar).
5. Muda o comportamento editando os arquivos da pasta. Sem deploy.

## 4. A pasta do agente (contrato)

```
<Agente>/
├── AGENTS.md      regras + standing orders; frontmatter = configuração do agente
├── SOUL.md        personalidade/tom
├── IDENTITY.md    nome, emoji
├── USER.md        diretivas sobre o usuário (≤ 4.000 caracteres)
├── MEMORY.md      memória curada — injetada só na DM do dono
├── HEARTBEAT.md   checklist proativo; resposta "NO_REPLY" = silêncio
├── BOOTSTRAP.md   ritual de estreia (apagado ao concluir)
├── jobs.md        agendamentos: `0 7 * * 1-5 | briefing do dia`
├── skills/<nome>/SKILL.md   frontmatter name/description; corpo lido sob demanda
├── memory/YYYY-MM-DD.md     notas diárias (hoje + ontem no contexto)
├── inbox/         .xlsx soltos aqui viram Google Sheets (originais → inbox/processed/)
└── .gasclaw/      gerenciado: sessions/<spaceId>.jsonl, runs/<runId>.json
```

Frontmatter de `AGENTS.md` (única configuração):

```yaml
---
model: anthropic/claude-sonnet-5     # qualquer id de modelo do OpenRouter
tools: [gmail.search, gmail.draft, gmail.send, drive.search, drive.read, sheets.read,
        sheets.write, docs.create, calendar.list, memory, schedule, http]
http_allow: [api.exemplo.com]        # hosts permitidos para a tool http
users: [eu@dominio.com, grupo@dominio.com]   # quem pode falar com o agente
heartbeat: { every: 30m, active_hours: "08-20" }
limits: { steps: 30, usd_per_run: 0.50 }
---
```

Regras: cada arquivo truncado em 20.000 caracteres, total do bootstrap ≤ 60.000; arquivo
ausente vira marcador "missing", nunca erro. **Nenhum código é lido do Drive** (ADR-002).

## 5. Arquitetura

```
Google Chat ──► onMessage (≤30s) ─┐            Time trigger 1 min ──► pump()
Tela gasclaw ─► doGet/doPost ─────┤                                   │ fila vazia? sai <1s
Gmail/HTTP (F4) ──────────────────┘                                   ▼
                     │ enfileira run                      doPost(action=step) no próprio web app
                     ▼                                                 │
            ┌──────────────── Runtime (bundle GAS) ──────────────────┐ │
            │ workspace.ts  lê pasta → prompt (bootstrap, skills idx)│◄┘
            │ agent.ts      turno: 1 chamada LLM + tools → checkpoint│
            │ llm.ts        OpenRouter (formato OpenAI)              │
            │ tools.ts      whitelist + política de aprovação        │
            │ chat.ts       resposta síncrona / assíncrona / cards   │
            │ store.ts      Drive JSON, lease, Properties            │
            │ excel.ts      inbox xlsx → Sheets                      │
            └────────────────────────────────────────────────────────┘
```

Módulos (deep modules, núcleo funcional + casca imperativa):

| Módulo | Faz | Depende de |
|---|---|---|
| `workspace` (núcleo puro + leitura Drive) | pasta → `AgentSpec` (config, prompt, skills index) | DriveApp |
| `agent` (núcleo puro) | `step(state, llmResponse) → {state, toolCalls, reply, status}` | nada |
| `llm` | `complete({messages, tools, maxTokens}) → {text, toolCalls, usage}` | UrlFetchApp |
| `tools` | executa tool da whitelist; aplica `approval` | serviços GAS |
| `store` | `load/save(runId)`, `claim(runId)` com lease, sessões jsonl | Drive, Lock, Properties |
| `chat` | evento → run; responder; card de aprovação; callback | Chat avançado, IAM |
| `scheduler` | pump, heartbeat, `jobs.md`, reinstala triggers ausentes | ScriptApp |
| `excel` | varre `inbox/`, converte, move original | Drive v3 |
| `settings` | tela: agentes, verificar, doctor, kill switch | HtmlService |

## 6. Fluxo de um run

1. **Entrada.** `onMessage` valida remetente contra `users`, resolve agente (DM → agente
   padrão; espaço → agente vinculado), grava mensagem na sessão.
2. **Rápido?** Executa um step inline com orçamento de 20 s. Se terminou, responde no próprio
   evento. Senão responde "pensando…" e enfileira o run (`status=queued`).
3. **Pump** (trigger 1 min): lê a fila; se vazia, sai. Senão chama `doPost(action=step)` do
   próprio web app (execução comum, não consome cota de trigger — **validar na POC P3**).
4. **Step:** `claim` com lease (LockService só para o claim, nunca durante LLM) → carrega
   checkpoint → 1 chamada LLM → executa tools → **checkpoint** → se não terminou e restam
   > 90 s, próximo step na mesma execução; senão devolve para a fila.
5. **Aprovação:** tool com `approval` ≠ `never` → `status=waiting`, card no Chat com
   Aprovar/Negar (token de uso único). Callback grava a decisão e re-enfileira. Padrão: negar.
6. **Final:** resposta enviada como o app (token via IAM `generateAccessToken`, sem chave
   guardada — **POC P2**); `status=done`; linha no índice de runs.

Estados: `queued → running → waiting → queued → … → done | failed | cancelled`.

**Idempotência:** tools com efeito colateral usam chave `runId:stepN:callIndex` registrada no
checkpoint antes de executar; um step reexecutado pula chamadas já registradas.

**Contexto:** resultado de tool > 8.000 caracteres vai para `.gasclaw/runs/<id>/` e o modelo
recebe resumo + referência. Sessão acima de N caracteres → turno silencioso "salve fatos
duráveis" (flush de memória) → compacta mantendo a cauda.

## 7. Limites do GAS e mitigação

| Limite | Valor | Mitigação |
|---|---|---|
| Execução | 6 min | step curto + checkpoint; `timeoutSeconds` ≈ 240 no UrlFetch |
| Evento do Chat | 30 s | inline ≤ 20 s, senão fila + resposta assíncrona |
| Runtime de trigger | 6 h/dia | pump sai < 1 s ociosa; trabalho via `doPost` (P3) |
| Triggers | 20/usuário/script | 1 pump + 1 heartbeat + 1 jobs + 1 inbox; jobs avaliados pelo trigger horário |
| Execuções simultâneas | 30/usuário | lease por run; máx. N steps concorrentes (Property) |
| Property | 9 KB/valor | estado no Drive; Properties só ponteiros/segredos |
| Versões | 200/script | deploy apaga versões antigas mantendo as 5 últimas |
| UrlFetch | 100 k/dia, allowlist admin | liberar `openrouter.ai` se allowlist ativa |
| Conversão xlsx | 10 M células | recusa e avisa no Chat |
| Session control Workspace | reauth 1–24 h | marcar apps confiáveis + "Exempt trusted apps" |

## 8. Segurança

- Sem `eval`; tools só da whitelist; `http` só para `http_allow`.
- `users` por agente checado em toda entrada (identidade dividida: Chat roda como quem fala,
  triggers como o dono).
- `MEMORY.md` nunca em espaços; só na DM do dono.
- Segredos só em Script Properties e `.env.local` (gitignored); nunca no Drive nem no git.
- Aprovação padrão = negar; tokens de card de uso único (CacheService, 10 min).

## 9. Automação — `./gasclaw`

Script único, idempotente (`scripts/*.sh` são aliases finos):

| Comando | Faz |
|---|---|
| `up` | 1ª vez: doctor local → logins (navegador) → projeto GCP + APIs → scripts dev/prod → pausa guiada para vincular GCP → `.env.local` → build/test → push dev → setup remoto → abre tela. Depois: build/test/push dev/liga agentes. |
| `down` | kill switch + remove triggers |
| `restart` | down + up |
| `ship` | publica prod na mesma URL (o CI faz no push da `main`) |
| `logs` · `status` · `doctor` · `rollback` | logs ao vivo · runs/filas/cotas/URLs · diagnóstico com correção sugerida · versão anterior em prod |

**Ações manuais únicas:** logins gcloud/clasp/gh; ligar Apps Script API do usuário;
Admin → apps confiáveis + "Exempt trusted apps"; colar nº do projeto GCP nas configurações
do script (sem API para isso); preencher `OPENROUTER_API_KEY` no `.env.local`; colar URL da
pasta na tela.

**CI (`.github/workflows/deploy.yml`):** push na `main` → testes → dev → selftest → prod
(`update-deployment` no mesmo id) → selftest → falhou? `rollback`. Detecção de divergência:
compara conteúdo remoto com `dist/` antes do push e falha se o editor online tiver mudanças.

## 10. Testes

- **Unit (Vitest):** núcleo puro (`agent.step`, parser da pasta, `jobs.md`, políticas de
  aprovação, truncamento) sem mocks.
- **Borda:** fakes mínimos de DriveApp/UrlFetchApp; respostas do OpenRouter como fixtures.
- **Pós-deploy:** `?action=selftest` executa um run curto com modelo barato numa pasta de teste.
- **POCs** (`poc/`), cada uma com critério e ADR:

| POC | Critério de aceite |
|---|---|
| P1 UrlFetch longo | chamada OpenRouter de 90 s+ conclui com `timeoutSeconds` |
| P2 Chat assíncrono | mensagem com card enviada como app 2 min após o evento, sem chave SA |
| P3 step via doPost | 50 steps via pump→doPost sem consumir runtime de trigger |
| P4 durável | 1 run atravessa ≥ 3 execuções sem perda de estado |
| P5 GASADK | planner do GASADK funciona via seam OpenRouter **e** com checkpoint por step; senão ADR troca por loop simples |
| P6 Excel | xlsx de 5 MB convertido e lido em < 60 s |
| P7 CI token | deploy pelo Actions funcionando ≥ 8 dias após o login |

## 11. Fases (tracks do conductor)

| Fase | Entrega | POCs |
|---|---|---|
| F0 Fundação | devmode + docs hub, `./gasclaw up/down/ship/logs/status/doctor/rollback`, CI com rollback, selftest vazio | P1, P2, P3, P7 (início) |
| F1 Agente-pasta + Chat | tela gasclaw, `workspace`, `llm` OpenRouter, resposta síncrona, sessões, memória, bootstrap | — |
| F2 Durável + aprovação | pump, checkpoint, fila, cards, limites, idempotência | P4, P5 |
| F3 Proatividade + dados | heartbeat, `jobs.md`, inbox Excel, templates executive-assistant e sheets-analyst | P6 |
| F4 Canais extras | Gmail, HTTP/MCP/A2A, `npx gasclaw` | — |

## 12. Riscos em aberto

- Escolha do framework do Chat app (add-on vs. app clássico) pode ser irreversível no projeto
  GCP → decidir após P2, antes de configurar o Chat de prod.
- Dono = conta do usuário: suspensão/saída para tudo. Migração para conta dedicada documentada
  em runbook.
- Cotas podem mudar sem aviso: `status` mostra consumo; `doctor` alerta perto do limite.

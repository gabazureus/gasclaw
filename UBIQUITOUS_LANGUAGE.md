# Ubiquitous language

> A living glossary of the domain terms used identically in conversation, in the
> AI's reasoning, and in the code. **Keep it open while planning and grilling.**
> Update it in the same change whenever a concept appears or a definition
> sharpens — a stale glossary is worse than none.
>
> Built/maintained with the `ubiquitous-language` skill. Promote new terms here
> from track `learnings.md` / `patterns.md` (see the knowledge flywheel).

## Agentes

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| Agente | Uma pasta do Google Drive registrada na tela gasclaw | `AgentSpec` | Nunca contém código executável (ADR-002) |
| Pasta do agente | Os markdown AGENTS/SOUL/IDENTITY/USER/MEMORY/HEARTBEAT/BOOTSTRAP, `jobs.md`, `skills/`, `memory/`, `inbox/` | `workspace` | Arquivo ausente = marcador "missing", nunca erro |
| Frontmatter do agente | Configuração no topo de `AGENTS.md` (model, tools, http_allow, users, heartbeat, limits) | `AgentConfig` | Única fonte de configuração por agente |
| Dono | Conta que é dona do script e dos triggers; única que recebe `MEMORY.md` | `OWNER_EMAIL` | Hoje = conta do usuário (ADR-008) |
| Skill | `skills/<nome>/SKILL.md`; só nome+descrição no prompt, corpo lido sob demanda | `read_skill` | — |
| Ritual de estreia | Execução única de `BOOTSTRAP.md` na primeira conversa | `bootstrap` | Arquivo é apagado ao concluir |
| Heartbeat | Turno proativo periódico guiado por `HEARTBEAT.md` | `heartbeat()` | Resposta `NO_REPLY` = não enviar nada |
| Job | Linha de `jobs.md`: `cron | mensagem` | `Job` | Avaliado pelo trigger de jobs |

## Execução

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| Sessão | Histórico de conversa de um agente em um espaço/DM | `sessions/<spaceId>.jsonl` | Nunca em Properties |
| Run | Uma tarefa do agente, do pedido à resposta final | `Run`, `runs/<runId>.json` | Estados: queued, running, waiting, done, failed, cancelled |
| Step | 1 chamada ao LLM + execução das tools pedidas + checkpoint | `agent.step()` | Unidade de durabilidade; step interrompido reexecuta |
| Checkpoint | Estado do run salvo no Drive após cada step | `store.save()` | Sempre antes de iniciar o próximo step |
| Lease | Reserva temporária de um run por uma execução | `store.claim()` | LockService só durante o claim |
| Pump | Trigger de 1 min que despacha runs da fila | `pump()` | Sai em < 1 s com fila vazia |
| Aprovação | Pausa de uma tool até decisão humana via card | `approval`, status `waiting` | Padrão = negar |
| Chave de idempotência | `runId:stepN:callIndex` registrada antes de tool com efeito colateral | `idemKey` | Reexecução pula chamadas registradas |
| Kill switch | Property que desliga todos os agentes | `RUNTIME_ENABLED` | `./gasclaw down` |

## Module map

| Module | Responsibility | Public interface | Core/shell | Critical? |
|--------|----------------|------------------|-----------|-----------|
| `workspace` | Ler pasta → `AgentSpec` (config, prompt, índice de skills) | `loadAgent(folderId)` | parser puro / leitura Drive | yes |
| `agent` | Decidir o próximo passo de um run | `step(state, llmResponse)` | core puro | yes |
| `llm` | Chamar OpenRouter | `complete({messages, tools, maxTokens})` | shell | yes |
| `tools` | Executar tools da whitelist e aplicar aprovação | `runTool(call, ctx)` | política pura / execução shell | yes |
| `store` | Checkpoints, leases, sessões | `load`, `save`, `claim`, `appendSession` | shell | yes |
| `chat` | Eventos do Chat, respostas, cards | `onMessage`, `reply`, `approvalCard` | shell | yes |
| `scheduler` | Pump, heartbeat, jobs, reinstalar triggers | `pump`, `heartbeat`, `runJobs` | cron parser puro / shell | yes |
| `excel` | Inbox xlsx → Sheets | `processInbox(agent)` | shell | no |
| `settings` | Tela gasclaw: agentes, verificar, doctor | `doGet`, `doPost` | shell | no |

---

### Conflicts & synonyms to resolve
- "workspace": no OpenClaw = pasta do agente; no Google = Google Workspace → usar **pasta do agente** para o primeiro.
- "session" (Eve) vs. "run": aqui sessão = conversa, run = tarefa.

### Relationships
- Agente tem muitas sessões; sessão tem muitos runs; run tem muitos steps.

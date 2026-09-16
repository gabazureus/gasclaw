# Ubiquitous language

> A living glossary of the domain terms used identically in conversation, in the
> AI's reasoning, and in the code. **Keep it open while planning and grilling.**
> Update it in the same change whenever a concept appears or a definition
> sharpens — a stale glossary is worse than none.
>
> Built/maintained with the `ubiquitous-language` skill. Promote new terms here
> from track `learnings.md` / `patterns.md` (see the knowledge flywheel).
>
> Termos marcados **(planejado)** ainda não existem no código; o resto confere com `src/` (auditoria de 2026-09-15).

## Agentes

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| Agente | Uma pasta do Google Drive registrada na tela gasclaw e/ou os arquivos `agentes/<nome>/` do editor do Apps Script | `AgentSpec`, `LoadedAgent` | Nunca contém código executável (ADR-002, ADR-013) |
| Papel | Um dos arquivos do prompt: AGENTS, SOUL, IDENTITY, USER | `ROLES`, `Role` | Papel ausente = marcador `(missing)`, nunca erro |
| Arquivo do agente no editor | `agentes/<nome>/<PAPEL>.md.html` no editor (no projeto: `agentes/<nome>/<PAPEL>.md`, tipo HTML), só markdown puro | `EDITOR_MIME`, `editorEntries` | Lido pelo export do HEAD, nunca por `getContent` (ADR-013) |
| Precedência por papel | Para cada papel: editor → Google Doc → `.md` do Drive → `(missing)` | `resolveRoles` | Editor opcional por papel (ADR-013) |
| Origem | De onde veio cada papel no turno: `editor`, `doc`, `md` ou `missing` | `LoadedAgent.origem` | Aparece no span `resolve_agent` |
| Pasta padrão do agente | `Meu Drive/gasclaw/agentes/<nome>/`, criada sem duplicar por "Novo agente" | `agentFolderPath`, `ensureFolderPath` | "Usar pasta existente" continua valendo |
| Motor | O único arquivo de código do projeto (`_motor.gs`), gerado pelo build | `dist/_motor.js` | "NÃO EDITE": substituído a cada `./gasclaw up` |
| Frontmatter do agente | Configuração no topo do `AGENTS`: `model`, `users`, `tools`, `steps` | `parseFrontmatter`, `AgentConfig` | Aceita BOM e CRLF. Outras chaves são ignoradas |
| Planilha config | Planilha `config` na pasta, linhas `chave, valor` | `mergeConfig` | Sobrepõe o frontmatter; valor vazio não apaga |
| Override de modelo | Modelo escolhido na tela para um agente | `MODEL:<folderId>`, `getOverride`/`setOverride` | Vence planilha e frontmatter (ADR-018) |
| Usuários do agente | E-mails que podem conversar com o agente além do dono | `AgentConfig.users`, `canUse` | Comparação em minúsculas |
| Dono | Conta que publica o web app; única que abre a tela e recebe a memória | Property `OWNER`, `assertOwner` | Hoje = conta do usuário (ADR-008) |
| Memória | Fatos duráveis sobre o dono, em `MEMORY.md` (ou Doc `MEMORY`) na pasta do agente | `tools/memory`, `memoryIO` | Só na DM do dono; entra como mensagem do usuário, não no system |
| Skill **(planejado)** | `skills/<nome>/SKILL.md`; só nome+descrição no prompt, corpo lido sob demanda | — | — |
| Ritual de estreia **(planejado)** | Execução única de `BOOTSTRAP.md` na primeira conversa | — | Arquivo é apagado ao concluir |
| Heartbeat **(planejado)** | Turno proativo periódico guiado por `HEARTBEAT.md` | — | Resposta `NO_REPLY` = não enviar nada |
| Job **(planejado)** | Linha de `jobs.md`: `cron \| mensagem` | — | — |

## Turno, tools e aprovação

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| Turno | Da mensagem do usuário à resposta: LLM com tools → valida → executa → repete até a resposta, uma pendência ou o limite | `runTurn`, `TurnResult` | Núcleo puro; o mesmo `handleChat` serve Chat, tela e eval |
| Passo (step) | Uma chamada ao LLM mais as tools que ela pediu | `TurnInput.steps` | Limite padrão 10 (`DEFAULT_STEPS`), 1–50 pelo `steps` do agente |
| Orçamento | Prazo do turno | `CHAT_BUDGET_MS` (20 s), `SCREEN_BUDGET_MS` (300 s) | Checado antes de cada chamada |
| Sessão | Histórico de conversa de um agente num espaço | `h:<pasta>:<espaço>` no CacheService, `getHistory`/`saveHistory` | Volátil (6 h), 20 mensagens; nunca em Properties |
| Tool | Função da lista fechada que o agente pode pedir | `TOOLS`, `Tool` | Nova tool exige deploy (ADR-002) |
| Allowlist | Tools que o agente pode usar (`tools:`; `memory` libera `memory.*`) | `allowedTools` | Padrão seguro: nenhuma |
| Toolkit | Tools filtradas, contexto (`now`, memória, DM do dono) e limite de passos de um turno | `Toolkit` | Montado por `chatDeps().toolkit` |
| Política de aprovação | `never`, `once` ou `always` por tool | `Approval` | `once` ainda sem tool que use |
| Pendência | Onde o turno parou esperando aprovação ou resposta | `Pending`, `Snapshot` | Retomada pela fila de chamadas restante |
| Ask | Pergunta do agente ao usuário; a próxima mensagem ou o botão responde | tool `ask`, `Tickets.open` | Só quem perguntou responde |
| Aprovação durável | Consentimento pendente para uma tool dentro de um run durável | `DurableRun.approval`, `RunIO.decide` | Fonte da verdade no Drive; vale 24 h; ligada à pendência e ao solicitante; expirar não executa nem refaz o turno |
| Credencial de aprovação | Segredo opaco entregue no card para responder uma aprovação durável | `ApprovalGrant`, `issueGrant`/`redeemGrant` | Uso único; só o hash fica no Drive; o cache da tela é atalho descartável |
| Ticket legado | Snapshot completo de uma pergunta `ask` guardado no CacheService | `Ticket`, `cacheTickets` | 10 min; aprovações de tools não dependem mais dele |
| Kill switch | Property que pausa todos os agentes | `RUNTIME_ENABLED`, `setEnabled` | `./gasclaw down` |
| Chave de idempotência | `runId:step:callId` de cada tool já executada no turno | `TurnResult.done`, `DurableRun.done` | Persiste no checkpoint do run; P4 provou uma execução de efeito em três execuções GAS |
| Efeito em voo | Ação externa iniciada cujo resultado ficou incerto porque a execução morreu antes do checkpoint final | `DurableRun.inflight`, `beforeEffect`, `markInflight` | Persiste antes de `tool.run`; a retomada não repete e avisa o usuário (P19) |

## Trace e observabilidade

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| Run (trace) | Registro de uma execução: pergunta, passos, modelo, tokens, custo, resposta | `Run` em `trace.ts`, `runlog.begin` | Estados: `running`, `ok`, `error`. Não confundir com a tarefa durável abaixo |
| Span | Um passo medido do run (`resolve_agent`, `llm_call`, `tool_call`, `reply`) | `Span`, `Tracer.step` | Soma dos spans ≈ duração (cobertura) |
| Redact | Remoção de chaves e tokens antes de qualquer gravação | `redact` | Cache, fila, planilha, JSON e logs |
| Fila do lote | Entrada pequena por run em Script Properties, drenada depois | `Q:<id>`, `queueEntry`, `settle` | ≤ 9 KB; `rowDone` = falta só o JSON |
| Lote (drenagem) | Grava linhas na planilha, uso por modelo e JSON dos runs | `observe.drain`, `drainRuns` | Gatilho de 1 min ou fallback no turno/tela (ADR-014) |
| Uso por modelo | Requisições, tokens e custo por hora UTC (7 dias) e por dia (90 dias) | `Usage`, `fold`/`prune`, `USAGE:*` | Valores em partes de até 8 KB |
| Painel de limites | Cotas do Google, do OpenRouter e medidas do gasclaw com nível verde/amarelo/vermelho | `buildLimits`, `limitsNow` | ADR-016 |
| Cenário de eval | Markdown com turnos, roteiro opcional e verificações | `parseScenario`, `runEval` | Só dado, nunca código (ADR-017) |
| Run durável | Tarefa do agente com checkpoint e retomada entre execuções | `DurableRun`, `runAsk`, `runState`, `runDecide` | Estados queued/running/waiting/paused/done/failed (ADR-026) |
| Checkpoint, Lease, Pump | Estado salvo por passo, reserva de execução e worker do gatilho | `runStore`, `pumpOnce`, `pump`, `drainRuns` | P3, P4 e P19 medidas; ADR-026/027 |

## Module map

| Module | Responsibility | Public interface | Core/shell | Critical? |
|--------|----------------|------------------|-----------|-----------|
| `main` | Globais do GAS: web app, eventos do Chat, funções da tela | `doGet`, `onMessage`, `onCardClick`, `chatSend`, `chatClick`, `settingsState`… | shell | yes (`assertOwner`) |
| `workspace` | Pasta/editor → agente (config, prompt) | `loadAgent`, `resolveRoles`, `parseFrontmatter`, `mergeConfig`, `buildSpec`, `canUse`, `seedAgent` | parser puro / leitura Drive | yes |
| `drive` | Drive API v3 via UrlFetch | `listFolder`, `fetchTexts`, `exportProject`, `multipartBody` | shell | no |
| `agent` | Turno com tools | `runTurn`, `trimHistory`, `reply` (Testar) | core | yes |
| `tools/registry` | Lista fechada, allowlist, validação de argumentos | `TOOLS`, `allowedTools`, `toDefs`, `findTool`, `validateArgs` | core | yes |
| `tools/memory`, `tools/memoryStore` | Fatos da memória; leitura/escrita do `MEMORY.md` | `addEntry`, `removeEntry`, `memoryMessage`; `memoryIO` | core / shell | yes |
| `approval`, `approvalStore` | Regras da aprovação durável, credencial de uso único e card; Drive como fonte da verdade | `issueGrant`, `redeemGrant`, `decisionFrom`, `approvalCard`; `durableTickets`, `hashToken` | core / shell | yes |
| `run`, `runStore`, `runner` | Estado e retomada do run durável; arquivo no Drive e fila/lease em Properties | `DurableRun`, `runIO`, `pumpOnce` | core / shell | yes |
| `chat` | Evento → turno → resposta (Chat, tela e eval) | `handleChat`, `isOwnerDm` | core com deps injetadas | yes |
| `webchat` | Tela de conversa como DM do dono | `webSend`, `webClick`, `voiceDelegate` | core | no |
| `llm` | OpenRouter | `complete`, `buildRequest`, `parseResponse` | shell fina | yes |
| `store` | Chave, dono, agentes, kill switch, sessão | `getApiKey`, `getOwner`, `listAgents`, `isEnabled`, `getHistory`… | shell | yes |
| `models` | Lista de modelos, chave do OpenRouter, override | `reduceModels`, `validateChoice`, `listModels`, `keyInfo`, `getOverride` | core / shell | no |
| `trace`, `runlog` | Run e spans, redact, linha e árvore; tracer, ao vivo, detalhe | `startRun`, `span`, `finish`, `redact`, `renderTree`; `begin`, `liveRuns`, `runDetail` | core / shell | yes (`redact`) |
| `batch`, `observe` | Fila do lote; drenagem, gatilho, uso e limites | `queueEntry`, `settle`, `drainBody`; `enqueue`, `drain`, `maybeDrain`, `usageView`, `limitsNow` | core / shell | no |
| `usage`, `limits` | Uso por modelo; itens do painel de limites | `fold`, `prune`, `dayTotals`, `chart`, `usageProps`; `buildLimits` | core | no |
| `eval`, `evalEntry` | Cenários de eval; execução no dev | `parseScenario`, `evaluate`; `runEval`, `evalAction` | core / shell | no |
| `voice` | Sessão de voz (P17, adiada) | `liveSessionRequest`, `parseLiveSession`, `voiceCost` | core | no |

---

### Conflicts & synonyms to resolve
- "workspace": no OpenClaw = pasta do agente; no Google = Google Workspace → usar **pasta do agente** para o primeiro.
- "session" (Eve) vs. "run": aqui sessão = conversa; run = registro do trace. A tarefa durável da F2 será **run durável**.
- "step": no turno = uma chamada ao LLM com suas tools; no trace o nome é **span**.

### Relationships
- Agente tem muitas sessões; cada mensagem gera um turno e um run de trace; o turno tem até N passos; cada passo pode gerar spans `llm_call` e `tool_call`.

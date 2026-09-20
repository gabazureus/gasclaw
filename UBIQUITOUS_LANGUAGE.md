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
| Compromisso **(planejado)** | Uma linha de `jobs.md`: quando acordar e o que fazer. **Única fonte de despertar** | — | Gramática fechada e legível, não cron completo (G2) |
| Heartbeat **(planejado)** | Um compromisso cujo horário vem do frontmatter e cuja intenção é o corpo de `HEARTBEAT.md` | — | **Não é máquina separada**: é uma linha da agenda (G1) |
| `NO_REPLY` **(planejado)** | Resposta do modelo que significa "nada a dizer" | — | Nada é enviado; o despertar mesmo assim vira span no trace (G4) |
| Standing orders | Ordens permanentes do dono, no corpo do `AGENTS.md` | `buildSpec` (já existe) | **Não é feature nova**: todo turno já lê o corpo do AGENTS |

## Turno, tools e aprovação

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| Turno | Da mensagem do usuário à resposta: LLM com tools → valida → executa → repete até a resposta, uma pendência ou o limite | `runTurn`, `TurnResult` | Núcleo puro; o mesmo `handleChat` serve Chat, tela e eval |
| Passo (step) | Uma chamada ao LLM mais as tools que ela pediu | `TurnInput.steps` | Limite padrão 10 (`DEFAULT_STEPS`), 1–50 pelo `steps` do agente |
| Orçamento | Prazo do turno | `CHAT_BUDGET_MS` (20 s), `SCREEN_BUDGET_MS` (300 s) | Checado antes de cada chamada |
| Sessão | Histórico de conversa de um agente num espaço: resumo do que foi compactado + cauda recente | `Session`, `sessionIO`, `.gasclaw/sessions/<espaço>.json` | Fonte da verdade no Drive (cache é atalho); compacta acima de `SESSION_MAX_CHARS` preservando `SESSION_TAIL`. Chave `<folderId>:<espaço>` |
| Tool | Função da lista fechada que o agente pode pedir | `TOOLS`, `Tool` | Nova tool exige deploy (ADR-002) |
| Allowlist | Tools que o agente pode usar (`tools:`; `memory` libera `memory.*`) | `allowedTools` | Padrão seguro: nenhuma |
| Toolkit | Tools filtradas, contexto (`now`, memória, DM do dono) e limite de passos de um turno | `Toolkit` | Montado por `chatDeps().toolkit` |
| Grau de aprovação | `never`, `once` ou `always`, fixo por tool no registro | `Approval` | Em uso: `once` em `gmail.draft`, `docs.create`, `sheets.append`, `tasks.*`; `always` em `gmail.send`, `calendar.create/update`, `memory.remove` |
| Pendência | Onde o turno parou esperando aprovação ou resposta | `Pending`, `Snapshot` | Retomada pela fila de chamadas restante |
| Ask | Pergunta do agente ao usuário; a próxima mensagem ou o botão responde | tool `ask`, `Tickets.open` | Só quem perguntou responde |
| Aprovação durável | Consentimento pendente para uma tool dentro de um run durável | `DurableRun.approval`, `RunIO.decide` | Fonte da verdade no Drive; vale 24 h; ligada à pendência e ao solicitante; expirar não executa nem refaz o turno |
| Credencial de aprovação | Segredo opaco entregue no card para responder uma aprovação durável | `ApprovalGrant`, `issueGrant`/`redeemGrant` | Uso único; só o hash fica no Drive; o cache da tela é atalho descartável |
| Ticket legado | Snapshot completo de uma pergunta `ask` guardado no CacheService | `Ticket`, `cacheTickets` | 10 min; aprovações de tools não dependem mais dele |
| Kill switch | Property que pausa todos os agentes | `RUNTIME_ENABLED`, `setEnabled` | `./gasclaw down` |
| Chave de idempotência | `runId:step:callId` de cada tool já executada no turno | `TurnResult.done`, `DurableRun.done` | Persiste no checkpoint do run; P4 provou uma execução de efeito em três execuções GAS |
| Hora marcada | Instante antes do qual um ponteiro da fila não pode ser reivindicado | `RunPointer.notBefore`, `due` | Reivindicar sem poder avançar **não** conta tentativa; é a primitiva de tempo que a agenda reaproveita |
| Efeito em voo | Ação externa iniciada cujo resultado ficou incerto porque a execução morreu antes do checkpoint final | `DurableRun.inflight`, `beforeEffect`, `markInflight` | Persiste antes de `tool.run`; a retomada não repete e avisa o usuário (P19) |

## Proatividade e governança **(planejado — esta track)**

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| Agenda | A tabela de compromissos de um agente, lida de `jobs.md` | — | Avaliada a cada tique; nenhum gatilho novo (ADR-027) |
| Tique | Uma execução do gatilho de 1 min que já existe | `drainRuns` | Passa a também perguntar "venceu algum compromisso?" |
| Último disparo | Quando um compromisso disparou pela última vez | Script Properties | **Nunca** na pasta do Drive: um editor da pasta não força redisparo (ADR-002) |
| Run proativo | Run que ninguém pediu (agenda ou heartbeat) | `DurableRun` com proveniência de gatilho | `ownerDm: false` por padrão; teto próprio; **nunca** `paused` — falha honesta e registrada |
| Teto de proatividade | Limite diário agregado de gasto e de despertares por agente | — | Ajustável no painel, não constante de código |
| Política de aprovação | Regra declarativa determinística que decide pedir/negar/auto-aprovar uma chamada de tool | — | Avaliada **em código**, nunca pelo modelo; erro de parse = fail-closed; padrão = pedir |
| Política sugerida × vigente | A pasta *sugere* a política; ela só vale depois de aprovada no painel | mesmo padrão de `ACCESS:<folderId>` | Mantém a pasta compartilhável fora da fronteira de confiança |
| Tool nunca auto-aprovável | Tool que a política jamais pode liberar sozinha | — | `gmail.send`, `calendar.update`, `memory.remove` |
| Serialização por espaço | No máximo um run aberto por `<folderId>:<espaço>` | — | **Não confundir com reentrega**: aqui as mensagens são diferentes |
| Reentrega | O mesmo evento do Chat chegando duas vezes | `runId` estável do nome da mensagem | Já resolvido na pista P2 |
| Iniciativa | Mensagem que o agente manda **sem turno humano aberto** ("me manda msg") | — | Não é resposta: não há evento para responder. Exige canal que aceite envio fora do ciclo pedido→resposta |
| Canal de iniciativa | Por onde a iniciativa chega ao dono | — | Chat exige Workspace (ADR-031); e-mail existe nos dois, com cota 1.500/dia (Workspace) × **100/dia** (pessoal), `src/limits.ts:17-18`; painel não notifica |
| Pergunta não supervisionada | Run proativo que precisa de uma decisão humana ("me chame quando precisar") | — | **Hoje é impossível**: D7 proíbe `waiting`/`paused` em run proativo, e a entrega assíncrona de card novo pelo gatilho está fora de escopo (ADR-028, Consequências) |

## Auto-aprimoramento — o sonho **(planejado — track F5)**

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| Ciclo de sonho | Uma rodada completa: colher material → gerar candidatos → avaliar contra o juiz → gravar placar → propor promoção | `dreamCycle` | Nunca promove sozinho; termina em proposta, não em mudança |
| Material do sonho | As falhas reais colhidas do trace e dos runs que motivam a rodada | `DreamSeed` | Vem de `failed`, `stopped: steps` e recusa de tool — **nunca** inventado pelo modelo (evita o laço se auto-elogiar) |
| Candidato de prompt | Uma reescrita proposta de um papel (`SOUL`, `skills/`), em markdown | `PromptCandidate` | **Texto, nunca código** (ADR-002). Mora em `.gasclaw/dreams/<cycleId>/` na pasta do agente |
| Conjunto-juiz | Os cenários de eval que decidem se um candidato é admissível | `judgeSet` | Vêm do **repositório**, nunca do Drive: se o critério morasse na pasta compartilhável, quem edita a pasta daria a própria nota (ADR-017 §6) |
| Placar do sonho | Nota de cada candidato por cenário, mais o delta contra o papel vigente | `DreamBoard` | Artefatos no Drive; uma linha por ciclo na planilha (mesmo padrão do trace e dos limites) |
| Promoção | O ato de um candidato virar papel vigente | `promote` | **Só com aprovação do dono**, por card durável com diff do prompt e delta do placar (ADR-028). Nunca automática |
| Papel vigente × candidato | O que o agente usa hoje × o que o sonho propõe | `resolveRoles` (vigente) | Mesmo precedente de política sugerida × vigente: a pasta propõe, o painel decide |
| Passo de sonho | A unidade durável: **um par (candidato, cenário)** | passo do `DurableRun` | Um passe completo (174 s estimados) cabe em 6 min, mas 3 candidatos não — por isso a unidade é o par (ADR-026) |
| Capacidade | Poder opt-in de um agente: `dream`, `replicate`, `initiative`, `create` | Script Properties, aprovadas no painel | Quatro, nunca um interruptor só: blast radius diferente. A pasta **declara**, o painel **aprova**, o painel **mostra a procedência** (ADR-021 + ADR-035) |
| agente com a capacidade `create` | O único agente do ambiente que pode criar agentes | `CREATOR` (Script Property) = **um** `folderId` | Singleton **por forma do dado**, não por trava: não existe estado com dois agente criadors porque não há dois lugares onde escrever |
| Passar o bastão | Trocar quem é o agente criador | sobrescrever o valor de `CREATOR` | Reversível por construção — voltar é escrever o `folderId` anterior. Quem autoriza é o gate aberto |
| Linhagem | Geração, pai, diff do prompt, placar, delta e filhos criados | `.gasclaw/lineage/<generation>.json` + planilha | Sem ela "evoluiu" não é verificável, é fé |
| Squad | Agentes criados pelo agente criador para funções diferentes | pastas normais | Nascem **sem nenhuma capacidade**: executores, não criadores (`effectiveAccess(null)` já fecha) |
| **Persona** | Nome + papel em `subagents/<nome>.md` + **subconjunto** das tools do pai, rodando como passo do run do pai | `Subagent`, `parseSubagent`, tool `persona` | Declaração, nunca código (ADR-039). **Não tem pasta e NÃO precisa da chave** — era este o sentido ambíguo de "sub-agente" ([ADR-042](docs/adr/042-automation-subagente-persona.md)) |
| **Automação** | Projeto filho que é **só código**: sem pasta, sem prompt, sem modelo | `ChildKind = 'automation'` | A parte arriscada do desenho (entregar a credencial) **não se aplica**. É o caminho barato de crescer em capacidade |
| **Automação** | Projeto filho que é **só código**: sem pasta, sem prompt, sem modelo — e por isso **sem chave** | `ChildKind = 'automation'` (membro único) | Era um tipo de dois membros; o `subagent`, que precisava da chave, foi **removido** com a opção 4 da [ADR-040](docs/adr/040-isolamento-e-privilegio.md). A forma que precisa de credencial é estado **não representável**, e um `subagent` já gravado é **rebaixado** na leitura |
| Interseção (nunca união) | A persona nunca tem mais que o pai, só menos | `subagentTools` | **Não vem de graça:** `allowedTools` filtra contra o REGISTRO, não contra o pai (`registry.ts:115-116`). É também o 4º controle do repasse entre agentes |
| Span da persona | Quem da squad agiu, dentro do run do pai | `subagentSpan` → `subagent:<nome>` | Sem ele a squad é inauditável; nome inválido não vira span |
| Run proativo | Run que **ninguém pediu**: nasceu da agenda do painel | `DurableRun.proactive` (assinado) | Decide o que pode ser auto-aprovado e o que fazer diante de um card. Esbarrou em aprovação ⇒ **falha e registra**, nunca fica `waiting` |

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
- "fila deduplicada por espaço" (OpenClaw) junta dois problemas: **reentrega** (mesmo evento, já resolvido) e **serialização** (mensagens diferentes, run em voo). Usar os dois nomes separados; "dedupe" sozinho é ambíguo.
- "schedules/" (Eve), "cron", "agendamento" e "heartbeat" são **o mesmo mecanismo**: usar **compromisso** e **agenda**. Heartbeat é um compromisso, não um sistema.
- "policy" (Eve, `approval: policy`) aqui é sempre **regra determinística em código**, nunca texto avaliado pelo modelo. Se alguém disser "política em linguagem natural", é outra coisa e está recusada.
- "hook" (Eve, `hooks/`) **não existe aqui**: seria código lido da pasta do Drive, proibido pela ADR-002. Não reutilizar a palavra para outra coisa.

### Relationships
- Agente tem muitas sessões; cada mensagem gera um turno e um run de trace; o turno tem até N passos; cada passo pode gerar spans `llm_call` e `tool_call`.

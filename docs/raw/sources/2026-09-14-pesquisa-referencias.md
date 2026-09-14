# Pesquisa de referências — 2026-09-14

Registro bruto (imutável) das análises feitas antes do design. Resumos dos relatórios dos
agentes de pesquisa; links e caminhos de arquivo citados como evidência.

## fluencer-ai/devmode
- Não há CLI `devmode`; `/devmode adopt|wiki` são slash commands do Claude Code que rodam da
  raiz do repo devmode (`integrations/conductor-beads/install.sh`, `integrations/llm-wiki/install.sh`).
- Layout baseado em `conductor/` (tracks com spec/plan/learnings/decisions), sem `docs/`.
- Lean = skill `minimal-code`: escada (precisa existir? → repo já faz? → stdlib → nativo da
  plataforma → dependência existente → uma linha → mínimo). Nunca cortar validação, erros,
  segurança, acessibilidade. Atalhos com comentário `minimal:`.

## tanaikech/adk-gas (GASADK) — MIT, v2.0.0
- `dist/GASADK.js` 278 KB, concatenado por CI sem pin (GeminiWithFiles, A2AApp, MCPApp, MCPA2Aserver, FileSearchApp).
- `LlmAgent`: planner (structured output → DAG) → executor (`_runRemainingQueueAndSynthesize`) → synthesizer.
- Único ponto de chamada ao modelo: `LlmAgent._generateContent` → `GeminiWithFiles`. Só Gemini.
- HITL: hook BeforeTool `suspend` → `saveState()` em Property `HITL_STATE_<id>` (estouro de 9 KB) → `throw "SUSPENDED"` → `resume(id, allow|deny)`.
- Timeout (`timeoutMs` 280 s) aborta e sintetiza parcial — **não retoma**.
- Skills: subpastas de `skillFolderId` com `.md`, frontmatter via regex, corpo inteiro vira system instruction.
- Testes: funções globais rodadas no editor; mock trocando `UrlFetchApp`/`fetch_`.

## vercel/eve — Apache-2.0 (NOTICE)
- `agent/` com slots: instructions.md, agent.ts, tools/, skills/, schedules/, channels/, hooks/, connections/, subagents/.
- Compilação: discovery → manifest JSON (markdown embutido) + bundle de código.
- `defineTool({approval: never|once|always|policy})`; pausa `input.requested` (tool-approval|question|session-limit).
- Durabilidade por step (1 chamada de modelo + tools); step interrompido reexecuta → idempotência.
- Skills progressivas via tool `load_skill`.

## openclaw/openclaw — MIT
- Workspace: AGENTS.md, SOUL.md, USER.md, IDENTITY.md, BOOTSTRAP.md (ritual, apagado), MEMORY.md (só sessão privada), memory/YYYY-MM-DD.md (hoje+ontem), skills/<n>/SKILL.md. Limites 20 k/arquivo, 60 k total.
- Heartbeat (30 min, `NO_REPLY`), cron, standing orders em AGENTS.md, flush de memória antes de compactar.
- Google Chat: cardsV2 de aprovação, placeholder "digitando", sessão por espaço, fila deduplicada.
- Onboarding: um comando, verificação com completion real, `doctor --fix`.
- Não copiar: gateway/daemon, sandbox/exec, 20 canais, SQLite/embeddings, ClawHub.

## google/clasp — Apache-2.0, v3.4.1
- Não é biblioteca (exports = CLI); chamar via shell `--json`.
- `push` substitui o projeto remoto inteiro; ordem alfabética + `filePushOrder`; `--force` em CI.
- `update-deployment <id>` mantém URL; `clasp run` exige GCP padrão vinculado (só pela UI), `executionApi`, login com `--use-project-scopes`.
- `tail-logs` imprime linha `PAST` espúria.

## leonhartX/gas-github — MIT
- Extensão Chrome que sincroniza editor GAS ↔ GitHub via Apps Script API `projects.getContent/updateContent`.
- Ideia aproveitada: detecção de divergência remoto × git antes do deploy.

## WildH0g/apps-script-engine-template — sem licença
- Só ideias: `.clasp.json` por ambiente, wrappers globais gerados pós-bundle, mocks de `google.script.run`.

## labnol/apps-script-starter — MIT
- Vite IIFE + plugin de ~20 linhas que expõe exports como funções globais.

## bergside/awesome-eve-agents — MIT
- Exemplos viáveis em Workspace: meeting-action-planner, customer-support-triage, knowledge-base-curator, revenue-operations-analyst (xlsx).

## eveclaw, awesome lists (oshliaer, labnol) — sem licença
- eveclaw: manifest de features ↔ arquivos, codegen de schedules com validação de cron.

## Auditoria de limites do GAS (docs oficiais Google)
- Chat: resposta em 30 s; assíncrono com card exige auth de app (service account); user auth só texto; framework add-on vs. clássico possivelmente irreversível.
- UrlFetch: `timeoutSeconds` documentado (padrão 360 s) — verificar; 50 MB; 100 k/dia Workspace; allowlist de domínios pelo admin.
- `eval` funciona no V8 → risco de execução como dono.
- Triggers: `everyMinutes` 1/5/10/15/30, 20/usuário/script, **6 h/dia de runtime de trigger** (maior bloqueio).
- Properties 9 KB/valor, 500 KB total; Cache 100 KB/chave, TTL ≤ 6 h.
- 200 versões por script; session control do Cloud pode derrubar tokens (Exempt trusted apps).
- Conversão xlsx: 10 M células; `Drive.Files.copy` com mimeType de planilha.
- Vertex AI serviço avançado GA 2026-01-12 (exige billing) — não usado (ADR-003).

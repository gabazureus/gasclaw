# Tracks

> Lista mestre das tracks de trabalho. Cada track pode ter a própria pasta em
> `conductor/tracks/<track_id>/`, com `spec.md`, `plan.md` e `learnings.md`. Crie tracks
> novas com `/conductor-newtrack`, depois do `grill-me`. Status: `[ ]` pendente ·
> `[~]` em andamento · `[x]` concluída · `[!]` bloqueada.
>
> O andamento detalhado (percentuais, fontes) fica em [PROGRESS.md](../PROGRESS.md); o estado de cada item, no Beads (`bd list`).

<!-- Tracks are appended below this line by /conductor-newtrack -->

---

## gasclaw

| Track | Status | Plano | Beads |
|---|---|---|---|
| F0 — fundação + primeira fatia (tela, Chat síncrono, OpenRouter, CLI, CI) | `[x]` concluída com ressalva: Task 10 (GitHub/CI, POC P7) adiada | [plano F0](../docs/plans/2026-09-14-gasclaw-f0-plano-implementacao.md) · [ADR-009](../docs/adr/009-ajustes-f0.md) | `gasclaw-mw8` (Task 10) |
| F1 — agente-pasta completo | `[~]` em andamento | [ADR-012](../docs/adr/012-agentes-em-docs-e-sheets.md) · [ADR-013](../docs/adr/013-autoria-editor-e-drive.md) · [ADR-017](../docs/adr/017-motor-de-tools-evals-e-aprovacao.md) | ver as linhas abaixo |
| ↳ P6 — agentes em Docs e Sheets nativos | `[x]` | [POC P6](../poc/p6-docs-nativos/README.md) | `gasclaw-0ce` |
| ↳ P10 — editor do Apps Script como pasta do agente | `[x]` | [POC P10](../poc/p10-editor/README.md) | `gasclaw-da8` |
| ↳ E0 — harness de evals (`./gasclaw eval`) | `[x]` | [ADR-017](../docs/adr/017-motor-de-tools-evals-e-aprovacao.md) · [evals](../evals/) | `gasclaw-6nf` |
| ↳ E1 — motor de tools (`now`, `memory.*`) | `[x]` | [ADR-017](../docs/adr/017-motor-de-tools-evals-e-aprovacao.md) | `gasclaw-4oz` |
| ↳ E5 — aprovação e `ask` (Chat e tela) | `[x]` verde no dev (v19) | [ADR-017](../docs/adr/017-motor-de-tools-evals-e-aprovacao.md) | `gasclaw-sh4` |
| ↳ P14 — trace do agente (lote de 1 min) | `[~]` | [POC P14](../poc/p14-trace/README.md) · [ADR-014](../docs/adr/014-trace-do-agente.md) | `gasclaw-exl` (duplicata aberta: `gasclaw-5rn`) |
| ↳ P15/P16 — painel de limites, modelos e custo | `[~]` código pronto, medição pendente | [ADR-016](../docs/adr/016-painel-de-limites.md) · [ADR-018](../docs/adr/018-modelos-e-custo.md) | `gasclaw-cmx` |
| ↳ P17 — tela de chat (texto) e voz | `[~]` texto no dev; voz adiada | [POC P17](../poc/p17-voz/README.md) · [ADR-019](../docs/adr/019-tela-de-chat-e-voz.md) | `gasclaw-zkt` |
| F2 — execução durável (P2–P5) | `[~]` em andamento; P3 e P4 medidas, P19 pendente | [ADR-026](../docs/adr/026-run-duravel.md) · [ADR-027](../docs/adr/027-gatilho-worker.md) | `gasclaw-lwn` |
| F3 — proatividade + dados (inbox Excel = POC P8) | `[ ]` planejada | Parte D do plano F0 | — |
| F4 — canais extras + `npx gasclaw` | `[ ]` planejada | Parte D do plano F0 | — |

Ressalvas da F0 ainda abertas: verificar o haicai no `SOUL.md` sem deploy, o histórico no Chat e a
conversa de outra pessoa do domínio (Task 9); salvar a chave e o agente na tela de prod.

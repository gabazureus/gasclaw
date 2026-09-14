# Tracks

> Lista mestre das tracks de trabalho. Cada track pode ter a própria pasta em
> `conductor/tracks/<track_id>/`, com `spec.md`, `plan.md` e `learnings.md`. Crie tracks
> novas com `/conductor-newtrack`, depois do `grill-me`. Status: `[ ]` pendente ·
> `[~]` em andamento · `[x]` concluída · `[!]` bloqueada.

<!-- Tracks are appended below this line by /conductor-newtrack -->

---

## gasclaw

| Track | Status | Plano | Beads |
|---|---|---|---|
| F0 — fundação + primeira fatia (tela, Chat síncrono, OpenRouter, CLI, CI) | `[x]` concluída com ressalva: Task 10 (GitHub/CI, POC P7) adiada | [plano F0](../docs/plans/2026-09-14-gasclaw-f0-plano-implementacao.md) · [ADR-009](../docs/adr/009-ajustes-f0.md) | `gasclaw-mw8` (Task 10) |
| F1 — agente-pasta completo | `[ ]` próxima; começa pela POC P6 (Docs/Sheets nativos) | [POC P6](../poc/p6-docs-nativos/README.md) · Parte D do plano F0 | `gasclaw-0ce` (P6) |
| F2 — execução durável + aprovação (P2–P5) | `[ ]` planejada | Parte D do plano F0 | — |
| F3 — proatividade + dados (inbox Excel = POC P8) | `[ ]` planejada | Parte D do plano F0 | — |
| F4 — canais extras + `npx gasclaw` | `[ ]` planejada | Parte D do plano F0 | — |

Ressalvas da F0, a resolver no começo da F1: verificar o haicai no `SOUL.md` sem deploy, o
histórico no Chat e a conversa de outra pessoa do domínio (Task 9); salvar a chave e o
agente na tela de prod.

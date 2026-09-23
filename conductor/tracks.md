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
| ↳ P21 — navegação do painel e hub de painéis | `[~]` código verde local; falta ver rodando no dev | [spec](tracks/p21-navegacao-e-hub/spec.md) · [plano](tracks/p21-navegacao-e-hub/plan.md) | — |
| F2 — execução durável (P2–P5) | `[~]` em andamento; P3, P4, P19 e P20 medidas | [ADR-026](../docs/adr/026-run-duravel.md) · [ADR-027](../docs/adr/027-gatilho-worker.md) · [ADR-028](../docs/adr/028-aprovacao-duravel.md) | `gasclaw-lwn` · `gasclaw-7yt` |
| F3 — proatividade + dados (inbox Excel = POC P8) | `[~]` em andamento | Parte D do plano F0 | — |
| ↳ F3a — proatividade e governança de ferramentas | `[x]` implementada (agenda no painel, auto-aprovação fechada, falha honesta; PROGRESS item 28) | [spec](tracks/f3-proatividade-e-governanca/spec.md) · [plano](tracks/f3-proatividade-e-governanca/plan.md) · [decisões](tracks/f3-proatividade-e-governanca/decisions.md) | — |
| ↳ P22 — custo da proatividade na cota de gatilho | `[x]` **aprovada 4/4** (13,87% da cota); a entrega ao dono veio na F9 ([ADR-045](../docs/adr/045-reach-out-entrega-ao-dono.md)) | [plano](tracks/f3-proatividade-e-governanca/plan.md) · [ADR-027](../docs/adr/027-gatilho-worker.md) | — |
| F4 — canais extras + `npx gasclaw` | `[ ]` planejada | Parte D do plano F0 | — |

> ⛔ **As tracks F5, F6, F7, F8 e F9 (e as POCs P23, P24, P25, P29) não valem na branch**
> **`consertos-e-reach-out`:** o auto-aprimoramento e a geração de código saíram dela. Elas ficam
> como registro do que foi construído e medido na `evolucao-f5-f8`. A track desta branch é a **F11**
> (ver [PROGRESS.md](../PROGRESS.md)).

| F5 — o sonho (auto-aprimoramento por evolução de prompt) | `[~]` capacidade no painel e medida na F9 (P36): o ciclo recusa com honestidade, sem falha real agrupada para sonhar | [spec](../docs/specs/2026-09-19-sonho-auto-aprimoramento.md) · [plano](tracks/f5-sonho/plan.md) · [decisões](tracks/f5-sonho/decisions.md) | — |
| ↳ P23 — cabe um ciclo de sonho na cota? | `[~]` C1 e C6 medidos; C2–C5 esperam o primeiro ciclo real (ver PROGRESS) | [POC P23](../poc/p23-sonho/README.md) | — |
| ↳ P25 — o trace tem combustível para aglomerado? | `[!]` **C1 REPROVOU**: 0 falhas agrupáveis no dev, tráfego 100% de eval | [POC P25](../poc/p25-aglomerado/README.md) | — |
| ↳ P24 — linhagem de CÓDIGO: o agente criador cria o projeto Apps Script do sucessor? | `[x]` aprovada por inteiro (ver PROGRESS) | [POC P24](../poc/p24-linhagem-de-codigo/README.md) · [ADR-038](../docs/adr/038-capacidades-e-linhagem.md) | — |
| F6 — o enxame: 15 filhos em 24 h, gerados e implantados pelo Opus 5 | `[~]` P29 medida e os defeitos D1/D2 consertados (ver PROGRESS); a rodada de 15 filhos em 24 h não foi feita | [spec](../docs/specs/2026-09-20-enxame-15-agentes-24h.md) · [plano](tracks/f6-enxame/plan.md) · [decisões](tracks/f6-enxame/decisions.md) | — |
| ↳ P29 — quantos filhos a plataforma aceita por dia? | `[x]` C1–C4 medidos (dev v132–v135): 5/5 criados, 40 `projects.create` sem recusa | [POC P29](../poc/p29-enxame/README.md) | — |
| F7 — o sucessor é o AGENTE, melhorado por patch do Opus 5; coroa com health | `[x]` primeiro sucessor coroado no dev | [spec](../docs/specs/2026-09-21-sucessao-por-patch.md) · [ADR-043](../docs/adr/043-sucessor-e-um-agente.md) · [track](tracks/f7-sucessao-por-patch/spec.md) | — |
| F8 — herança do pai, `sync` e o Chat depois da coroa | `[x]` health do coroado 10/10; P35 reprovou o repasse automático | [spec](../docs/specs/2026-09-21-heranca-e-roteamento.md) · [plano](tracks/f8-heranca-e-roteamento/plan.md) · [ADR-044](../docs/adr/044-chat-segue-o-coroado.md) | — |
| F9 — fechar a branch `evolucao-f5-f8` com as 4 capacidades medidas no real | `[x]` fechada: 10/10 no real; A4 decidido pelo dono (opção A) | [spec](../docs/specs/2026-09-21-fechamento-da-branch.md) · [plano](tracks/f9-fechamento-da-branch/plan.md) · [P36](../poc/p36-capacidades-no-real/README.md) | — |
| F11 — a branch dos consertos e do Reach out | `[x]` remoção cirúrgica concluída: `tsc` rc=0, suíte 1632 verde | [spec](../docs/specs/2026-09-23-skills-no-lugar-de-gerar-codigo.md) | [PROGRESS](../PROGRESS.md) |

Ressalvas da F0 ainda abertas: verificar o haicai no `SOUL.md` sem deploy, o histórico no Chat e a
conversa de outra pessoa do domínio (Task 9); salvar a chave e o agente na tela de prod.


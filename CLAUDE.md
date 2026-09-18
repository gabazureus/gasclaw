# gasclaw — built on devmode

## Regras do projeto (prevalecem sobre os defaults do devmode)

- **Runtime 100% Google Apps Script.** Nenhum servidor externo. O PC só compila (TS → JS) e publica via clasp.
- **Agente = pasta do Google Drive** (markdown). Nunca executar código vindo do Drive (sem `eval`).
- **Minimal code** (`.claude/skills/minimal-code`, intensidade `full`): escada antes de escrever; marcar atalhos com `// minimal:`.
- **Toda melhoria sobre o GASADK/limites do GAS precisa de POC em `poc/` com critério medido** e ADR em `docs/adr/`.
- **Zero operação manual** depois do setup inicial: tudo passa por `./gasclaw <comando>` idempotente.
- **Docs:** `docs/` é o hub (`docs/README.md`). Spec: `docs/specs/`. ADRs: `docs/adr/`. Wiki: `docs/wiki/` + `docs/raw/`. Tracks: `conductor/`.
- Idioma: conteúdo em pt-BR; identificadores de código em inglês.
- Exceção de idioma ([ADR-011](docs/adr/011-licenca-e-docs-da-comunidade.md)): `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` e `LICENSING.md` em inglês, com `README_PT_BR.md` espelhado. Licença MIT ([ADR-030](docs/adr/030-licenca-mit.md), substitui a Apache-2.0 do ADR-011).

> **If this file is imported (`@CLAUDE.devmode.md`) into an existing project's
> `CLAUDE.md`:** that project's own instructions are the host and **take
> precedence** over devmode's defaults wherever they conflict. devmode adds *how
> we build*; it never overrides the project's domain rules. (For a fresh project
> scaffolded by `/devmode start`, this file *is* the `CLAUDE.md`.)

This project uses **devmode as its base** and **Conductor as a layer on top**.
The hierarchy is deliberate:

```
        Beads        ← optional memory behind Conductor (persists across sessions)
   ┌──────────────┐
   │  Conductor   │  ← LAYER: organizes & persists the work (tracks, spec/plan, lifecycle)
   ├──────────────┤
   │   devmode    │  ← BASE: how we think, design, and test (the source of truth)
   └──────────────┘
```

**devmode is the foundation; Conductor is mounted on top to operationalize it.**
Remove Conductor and you still have a complete devmode project. Remove devmode
and Conductor is just generic spec-first project management.

## Base — devmode (non-negotiable here)

devmode is the source of truth for *how* we build. Its skills live in
`.claude/skills/` (or the global devmode install); its philosophy governs every
decision:

- **Code is not cheap.** A good codebase is one that's *easy to change*. Invest
  in the design of the system every day.
- **You are the strategy; the AI is the tactics.** Interfaces and module
  boundaries are designed deliberately; implementations behind them are delegated.
- **Align before assets** — reach a shared design concept with `grill-me` before
  writing a spec or plan.
- **Speak one language** — keep `UBIQUITOUS_LANGUAGE.md` current; it includes the
  **module map** (boundaries are part of the language).
- **Deep modules; functional core / imperative shell.** Separate pure decisions
  from I/O; hide complexity behind simple interfaces.
- **Test-first, small steps.** Test behavior at stable boundaries; mock only what
  you don't own; coverage is a diagnostic, never a target.

Skills: `grill-me`, `ubiquitous-language`, `write-prd`,
`functional-core-imperative-shell`, `design-interface-delegate-implementation`,
`feedback-loops`, `tdd`, `testing-principles`, `improve-codebase-architecture`.
Agents: `design-architect`, `requirements-planner`, `tdd-implementer`,
`architecture-refactorer`, `complexity-reviewer`.

## Layer — Conductor (organizes & persists the devmode flow)

Conductor turns the devmode process into trackable, resumable work. It **serves**
the base; it does not override it.

- `conductor/` holds `product.md`, `tech-stack.md`, `workflow.md`, `tracks.md`,
  `patterns.md`.
- Each track has `spec.md` (written with `write-prd` rigor) and `plan.md`
  (phased: functional core → imperative shell → critical paths).
- `/conductor-*` commands run the lifecycle. `conductor/workflow.md` is the task
  lifecycle **adapter** — it embeds and **defers to the devmode skills as the
  source of truth**.
- Beads (optional) backs Conductor with a dependency graph and notes that survive
  conversation compaction.

## When base and layer disagree, the base wins

Stock Conductor defaults that conflict with devmode are already overridden in
`conductor/workflow.md`:

- No blind ">80% coverage" gate → use `testing-principles`.
- No eager asset creation → run `grill-me` before `/conductor-newtrack`.
- No structure-blind TDD → deep modules + functional-core/imperative-shell + gray
  boxes.
- Handoff carries the **design concept and ubiquitous-language deltas**, not just
  task status.

## The flow

`grill-me` → `/conductor-newtrack` (writes `spec.md`) → `/conductor-implement`
(TDD loop per `conductor/workflow.md`) → verify (`feedback-loops` +
`complexity-reviewer`) → `/conductor-handoff` (design concept into memory).

Full map: `conductor/INTEGRATION.md`.

<!-- LLM Wiki schema (read before ingest/query/lint) -->
@KARPATHY.md

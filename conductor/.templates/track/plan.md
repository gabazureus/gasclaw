# Plan: <track name>

> Phased task list that `/conductor-implement` executes against `workflow.md`.
> Tasks are derived from the spec's **module & interface** section. Keep tasks
> small — one behavior each — so the red→green→refactor loop stays tight.
>
> Annotations the implementer reads:
> - `<!-- depends: phaseN -->` on a phase header → phase dependency (omit = sequential)
> - `<!-- execution: parallel -->` on a phase → tasks run as sub-agents
> - `<!-- files: path1, path2 -->` on a task → files it owns exclusively (parallel safety)
> - `<!-- core -->` / `<!-- shell -->` → marks functional core vs. imperative shell work
> - `<!-- gray-box -->` / `<!-- critical -->` → review depth for this task

## Phase 1: <name — usually the functional core>
<!-- depends: -->

- [ ] Define the interface for `<Module>` (signatures/types, named in ubiquitous language)
  <!-- core -->
- [ ] Test-first: pure core behavior — happy path
  <!-- core --> <!-- files: src/<module>/<core>.ts, src/<module>/<core>.test.ts -->
- [ ] Test-first: core edge cases (empty, boundary, failure, invariants)
  <!-- core -->

## Phase 2: <name — the imperative shell wiring>
<!-- depends: phase1 -->

- [ ] Wire the imperative shell: gather inputs → call core → perform effects
  <!-- shell --> <!-- files: src/<module>/index.ts -->
- [ ] Integration test for the shell (a couple, at the seam)
  <!-- shell -->

## Phase 3: <name — critical paths reviewed in full, if any>
<!-- depends: phase2 -->

- [ ] <task touching money/auth/security — implementation reviewed fully>
  <!-- critical -->

---

## Definition of done (per task)
See `workflow.md` → "Quality gates". In short: failing test first, behavior
tested at a stable boundary, edges/invariants covered, feedback loops green,
refactor done, interface matches spec, commit + git note + SHA in plan, Beads
synced.

<!-- beads_tasks mapping (filled when Beads enabled):
{ "phase1_task1": "bd-xxxx.1", "phase1_task2": "bd-xxxx.2" } -->

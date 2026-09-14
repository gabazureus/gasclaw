# Project Workflow (Conductor layer · adapter over the devmode base)

> **devmode is the base; this file is the Conductor-layer adapter.** Conductor's
> `/conductor-implement` runs the task lifecycle through this file, but the
> **devmode skills are the canonical source of truth** for *how* each step is
> done. When this file and a devmode skill seem to disagree, the skill wins; this
> file only adapts the devmode craft into Conductor's lifecycle.
>
> The devmode skills referenced below (`tdd`, `testing-principles`,
> `functional-core-imperative-shell`, `design-interface-delegate-implementation`,
> `feedback-loops`, `improve-codebase-architecture`) are invoked **by name** —
> they work wherever they're installed (project `.claude/skills/` or global).

## Guiding principles

1. **Code is not cheap.** A good codebase is one that is *easy to change*. Every
   task is a chance to improve the design, not just add a feature (invest in
   design every day).
2. **You are the strategy; the AI is the tactics.** Interfaces and module
   boundaries are designed deliberately; implementations behind them can be
   delegated.
3. **The plan is the execution log, not the design.** `plan.md` tracks *what's
   done*; `spec.md` + the ubiquitous language hold *what's intended*. Beads holds
   the durable memory.
4. **The rate of feedback is the speed limit.** Small, test-first steps. Never
   outrun your headlights with a big untested batch.
5. **Deep modules over shallow ones.** Consolidate logic behind simple
   interfaces; don't scatter it.

## Status markers

- `[ ]` Pending  `[~]` In progress  `[x]` Completed  `[!]` Blocked (with reason)

Blocked format: `- [!] Task name [BLOCKED: reason]`

## Architecture stance (decide before coding a task)

Before writing code for a task, settle the structure — this is what keeps the
codebase deep and testable (skill: `functional-core-imperative-shell`,
`design-interface-delegate-implementation`):

1. **Find the decision vs. the effect.** Separate the pure decision logic (the
   **functional core** — no I/O, deterministic) from the thin **imperative
   shell** that reads inputs and performs effects. Shape: shell gathers → core
   decides → shell acts.
2. **Confirm the interface.** The public interface for this module should match
   what `spec.md` committed to (real signatures/types, named in the ubiquitous
   language). The interface is the contract — don't bend it to make the
   implementation convenient; if it's wrong, run `/conductor-revise`.
3. **Decide review depth.** Non-critical deep modules can be delegated as
   *gray boxes* (verified from the outside via their interface tests). Modules
   touching money, auth, security, or irreversible effects are **never** gray
   boxes — review them fully.

## Task lifecycle (red → green → refactor)

Follow this for every task. One behavior at a time.

0. **Pre-flight (skill: `confidence-check`).** Before coding, confirm you know
   the goal, the interface, the constraints/edges, and *how you'll verify
   success*. If a gap remains, close it (`grill-me` / `/conductor-revise`) instead
   of guessing.

1. **Select task** — next `[ ]` task from `plan.md` (or `bd ready` if Beads is
   enabled). Mark it `[~]`. If Beads enabled: `bd update <id> --status in_progress`.

2. **Red — write one failing test.** Pick the smallest next behavior. Write a
   test that asserts it and **watch it fail for the right reason** (behavior
   missing, not a typo). A test you never saw fail is a test you don't trust.
   - Test at the **deepest stable interface** — for a core/shell feature, that's
     the pure core, tested with plain values and **no mocks** (skill:
     `testing-principles`).

3. **Green — make it pass simply.** Least code that turns the test green. Don't
   build ahead of the test.

4. **Refactor — improve the design (mandatory, not optional).** With the test
   green, remove duplication, sharpen names (use the ubiquitous language), and
   consolidate toward deep modules. Re-run tests. This is the design investment;
   skipping it is how entropy creeps in.

5. **Verify with feedback loops** (skill: `feedback-loops`): run static types,
   the linter/compiler, and the fast test suite. For UI work, look at the real
   rendered result in a browser. Run these on *every* small step, not at the end.
   If a test fails for a reason you don't understand, switch to root-cause-first
   debugging (skill: `systematic-debugging`) — don't stack guesses.

6. **Commit** with a clear message: `<type>(<scope>): <description>`
   (`feat`/`fix`/`refactor`/`test`/`docs`/`chore`). **Never `git push`** — commits
   stay local; the user decides when to push.

7. **Attach a git note** summarizing the task (what changed, files, the "why").
   `git notes add -m "<summary>" <commit_hash>`. This keeps an auditable trail.

8. **Record in `plan.md`** — mark the task `[x]` and append the 7-char commit SHA.
   Commit the plan update separately (`conductor(plan): mark '<task>' complete`).

9. **Beads completion (if enabled)** — add structured notes and close:
   ```bash
   bd update <id> --notes "COMPLETED: <what>
   KEY DECISION: <choice + rationale, if any>
   FILES CHANGED: <list>
   COMMIT: <sha>"
   bd close <id> --continue --reason "Task completed"
   ```
   If you discovered new work: `bd create "<issue>" --deps discovered-from:<id>`.

10. **Capture learnings** — append to the track's `learnings.md`. Crucially,
    record **ubiquitous-language and module-map updates** here, not just code
    notes (a new term, a sharpened invariant, a module that changed shape).

## Testing strategy (replaces coverage targets)

devmode rejects a blanket coverage percentage as a quality gate, because chasing
a number pushes you to test implementation details and over-mock — producing
brittle tests and green-over-broken-code. Instead (skill: `testing-principles`):

- **Test observable behavior at a stable boundary**, not private helpers. A good
  test fails only when behavior a caller depends on breaks.
- **Mock only what you don't own and can't make fast/deterministic** — network,
  clock, filesystem, third parties, randomness. **Never mock your own domain
  logic.** If you're tempted to, the unit boundary is wrong, or the code needs a
  functional-core/imperative-shell split.
- **Cover, in priority order:** the contract (happy path), the edges (empty,
  boundary, failure, concurrency), the invariants (from the ubiquitous language),
  and a regression test for every bug fixed.
- **Properties of a test worth keeping:** behavioral, deterministic, fast,
  readable as a spec, independent.
- **Coverage is a diagnostic, not a target.** Use it to *find* untested behavior,
  then ask "is there a real behavior here a caller depends on?" — don't write
  tests just to move the number.
- **If a test is painful to write, that's a design signal** — refactor toward a
  pure core before piling on mocks.

## Quality gates (before marking a task `[x]`)

- [ ] A failing test was written first and seen to fail for the right reason
- [ ] Behavior is tested at a stable interface; mocks only at seams you don't own
- [ ] Edges, invariants, and any fixed bug have tests
- [ ] Types/compiler/linter clean; suite green; UI verified in a real browser (if applicable)
- [ ] Refactor pass done — no obvious duplication or shallow-module sprawl introduced
- [ ] Public interface matches `spec.md`; ubiquitous language used in names
- [ ] Critical module (money/auth/security)? Implementation reviewed in full
- [ ] **Fresh verification evidence** before claiming done — ran the command, read
  the output (skill: `verification-before-completion`); never claim from confidence
- [ ] Commit + git note created; `plan.md` updated with SHA; Beads synced (if enabled)

## Phase completion verification

When a task finishes a phase:

1. Run the full suite and the type/lint checks; announce the exact commands.
2. **Look at it run.** Propose a concrete manual verification (the commands to
   start the app and the expected observable result) and **pause for the user's
   explicit confirmation** — this is the highest-value feedback loop.
3. Run the **review panel** for the diff per the `code-review` skill: the
   `complexity-reviewer` agent (design & entropy — shallow modules, leaked
   internals, growing interfaces, dead code) leads, with `code-quality-analyzer`,
   `security-scanner`, and `test-coverage-analyzer` in parallel for non-trivial
   changes. Act on every finding and **re-verify** (don't just note it); record
   any non-obvious choice in the track's `decisions.md` (ADR). Fix before checkpointing.
4. Create a checkpoint commit, attach a git note with the verification report,
   and record the checkpoint SHA in `plan.md`.
5. Beads (if enabled): update the epic notes (`COMPLETED / IN PROGRESS / NEXT /
   KEY DECISIONS`) so the state survives compaction, then `bd sync`.

## When the design is wrong (don't paper over it)

- **Spec/plan issue** → run `/conductor-revise`, update `spec.md`/`plan.md`, log
  it, then continue. Fixing the design beats forcing the implementation.
- **Structure rotting** (shallow modules, hard to navigate, tests binding to
  internals) → run the `improve-codebase-architecture` skill to consolidate into
  deep modules *before* building further. Before moving code, run
  `impact-analysis` on the blast radius. Keep tests green throughout.

## Commit & push policy

- Conductor commits **locally only**; never `git push` automatically.
- Conventional commit messages. Separate commits for code, plan updates, and
  checkpoints. Git notes carry the detailed rationale.

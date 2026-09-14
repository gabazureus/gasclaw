# devmode × Conductor-Beads — integration map

How the three pieces fit, and exactly where each devmode skill plugs into the
Conductor lifecycle. Read this before running the combined flow.

## The layering — devmode is the base, Conductor is the layer

**devmode is the foundation.** It is the source of truth for *how* we build, and
it is tool-agnostic — it stands alone with no Conductor and no Beads. **Conductor
is mounted on top** to organize and persist that work. **Beads** optionally backs
Conductor with durable memory. The layers stack on the base; they serve it, they
do not replace it.

```
            ┌──────────────────────────────────────────────────────────┐
 memory     │  Beads — DAG, ready-tasks, notes survive compaction      │
 (optional) │  bd init · prime · ready · update · close · sync · dep   │
            └──────────────────────────────────────────────────────────┘
                              backs ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  LAYER · Conductor — organizes & persists the work               │
   │  tracks · spec/plan · /conductor-* lifecycle                     │
   │  conductor/workflow.md = task-lifecycle ADAPTER (defers to base) │
   └──────────────────────────────────────────────────────────────────┘
                              sits on ▼
 ┌═══════════════════════════════════════════════════════════════════════════┐
 ║ BASE · devmode — how we think, design, and test (source of truth)         ║
 ║                                                                           ║
 ║ grill-me · ubiquitous-language · write-prd ·                              ║
 ║ prior-art · divergent-ideation · design-critique ·                        ║
 ║ functional-core-imperative-shell · architecture-boundaries ·              ║
 ║ design-interface-delegate-implementation · design-patterns ·              ║
 ║ feedback-loops · tdd · testing-principles · confidence-check ·            ║
 ║ impact-analysis · systematic-debugging · verification-before-completion · ║
 ║ subagent-driven-development · delegate-to-cli ·                           ║
 ║ improve-codebase-architecture · authoring-skills · …  (43 skills total)   ║
 ║                                                                           ║
 ║ + 8 agents: design-architect · requirements-planner · tdd-implementer ·   ║
 ║ architecture-refactorer · complexity-reviewer + review panel              ║
 ║ (code-quality-analyzer · security-scanner · test-coverage-analyzer)       ║
 └═══════════════════════════════════════════════════════════════════════════┘
```

Remove Conductor and you still have a complete devmode project. Remove devmode and
Conductor is just generic spec-first PM. They compose on **different axes**:
devmode = *design quality* (the base), Conductor = *execution organization* (the
layer), Beads = *durable memory* (backing the layer). **When the layer's defaults
conflict with the base, the base wins** (see "Frictions resolved" below).

## Lifecycle map — devmode skill → Conductor phase → Beads action

| # | Conductor phase | Run these devmode skills | Beads |
|---|-----------------|--------------------------|-------|
| 1 | `/conductor-setup` | Seed `UBIQUITOUS_LANGUAGE.md` (`ubiquitous-language`); fill `product.md`/`tech-stack.md` so feedback loops are real | `bd init` (or `--stealth`) |
| 2 | **Before** `/conductor-newtrack` | **`grill-me`** — reach the shared design concept first. Do NOT let newtrack create an asset before alignment. | — |
| 3 | `/conductor-newtrack` → `spec.md` | **`write-prd`** rigor: the spec's *module & interface* section is the heart; mark core/shell and gray-box/critical per `design-interface-delegate-implementation` + `functional-core-imperative-shell`. Before the spec, run **`prior-art`** on any load-bearing component — if it already exists as a product or an OSS project, that changes what the spec says. Pressure-test a high-stakes spec with **`design-critique`** before approving. | `bd create` epic + tasks; `bd dep add` for phase order (the design tree becomes a DAG) |
| 4 | → `plan.md` | Tasks fall out of the spec's modules; phase 1 = functional core, phase 2 = shell, critical paths flagged | tasks mapped in `metadata.json` |
| 5 | `/conductor-implement` | **`confidence-check`** pre-flight → **`tdd`** + **`testing-principles`** + **`feedback-loops`** per `workflow.md`; delegate gray-box implementations (**`subagent-driven-development`** / **`delegate-to-cli`**); **`systematic-debugging`** when a test fails; **`verification-before-completion`** before any "done" | `bd prime`, `bd ready`, `bd update`/`close --continue`, `discovered-from` |
| 6 | phase verification | **`feedback-loops`** (browser/types) + the **review panel** (`complexity-reviewer` leads; `code-quality-analyzer` / `security-scanner` / `test-coverage-analyzer` in parallel); record ADRs in `decisions.md` | epic notes (COMPLETED/IN PROGRESS/NEXT/KEY DECISIONS) + `bd sync` |
| 7 | `/conductor-handoff` | WARM START: write the **design concept + ubiquitous-language/module-map deltas + next step** into the notes so a fresh session recovers strategy, not just status | `bd update --notes`, `bd sync` (beats the 30s debounce) |
| 8 | `/conductor-revise` | When implementation reveals the design is wrong, fix the spec/interface — don't bend the implementation | `bd` status/dep updates |
| 9 | `/conductor-refresh` / `/conductor-archive` | **`impact-analysis`** (blast radius) → **`improve-codebase-architecture`** to consolidate shallow modules; elevate learnings → `patterns.md` + `UBIQUITOUS_LANGUAGE.md` | `bd compact` |

## Guided mode: `/devmode` / `devmode` skill (the orchestrator)

You don't have to run the lifecycle by hand. The **`devmode-orchestrator`** agent,
invoked as `/devmode` in Claude Code and Codex Desktop (or selected as `devmode`
through `/skills` in CLI/IDE), drives the entire map above for
you:
it does all the mechanical work — picking the phase, running the right
skill/agent, the TDD loop, the review panel, bookkeeping, handoff — and pauses
**only at the human decision gates**, which it presents as easy structured A/B/C
choices with a recommendation.

```
/devmode "build a coupon redemption endpoint"
  → ALIGN     (grill-me)        [GATE: confirm the design concept]
  → LANGUAGE  (ubiquitous-language)
  → SPECIFY   (prior-art + write-prd + divergent-ideation + design-critique) [GATE: resolve trade-offs, approve spec]
  → ARCHITECT (FCIS / boundaries / interfaces) [GATE: approve interfaces]
  → IMPLEMENT (tdd / feedback-loops / debugging) [GATE: "look at it run"]
  → REVIEW    (code-review panel)  [GATE: okay the merge] → verify
  → REFACTOR  (impact-analysis → consolidate)  as needed
```

It carries the **process**; you still make the **decisions** — but only the ones
that matter, made easy. It's a *thin conductor*: it delegates to the deep skills,
never reimplements them (the imperative shell of the process). Definition lives in
`agents/devmode-orchestrator.md`; the command in `commands/devmode.md`. Both are
installed into the project's `.claude/` by `install.sh`.

For Codex, `install.sh` also writes `AGENTS.md` / `AGENTS.devmode.md`,
`.codex/agents/`, `.codex/config.toml`, and, when guardrails are requested,
`.codex/hooks.json`. `.agents/skills/` contains relative links to the single
physical skill copy in `.claude/skills/`, plus the Codex-only `devmode` launcher.
Project-local Codex hooks run only after the project and hook definitions are
trusted in Codex.

The installer records written assets in `.devmode/managed-files`; the updater
refreshes only those owned paths and preserves the `--no-skills` profile. This
prevents same-name project skills, agents, references, and scripts from being
mistaken for devmode-owned files.

## Frictions resolved (devmode wins where they disagree)

These are the places stock Conductor-Beads cuts against devmode craft. The
templates in `templates/` already encode these resolutions:

1. **">80% coverage" gate → behavior-at-a-stable-boundary.** A coverage number as
   a gate pushes you to test implementation and over-mock. `workflow.md` replaces
   it with `testing-principles`: cover contract/edges/invariants/regressions;
   coverage is a *diagnostic*, not a target.
2. **Eager asset creation → grill first.** `/conductor-newtrack` wants to emit
   `spec.md` immediately. devmode runs `grill-me` *before* newtrack so the spec
   captures a genuinely shared design concept.
3. **Generic TDD → deep modules + FCIS + gray boxes.** Conductor's TDD is
   structure-blind. `workflow.md` adds the architecture stance (functional core /
   imperative shell, deep modules, gray-box vs. full-review) so implementation
   doesn't quietly grow shallow-module entropy.
4. **Status-only handoff → strategy handoff.** Beads notes normally carry task
   status; here they also carry the design concept and ubiquitous-language deltas,
   so a post-compaction session recovers *intent*, not just *position*.

## What lives where (source of truth)

- **Intent / design** → `spec.md` + `UBIQUITOUS_LANGUAGE.md` (devmode owns this)
- **Execution status** → `plan.md` + Beads (Beads is truth for status)
- **Durable cross-session memory** → Beads notes (survive compaction)
- **Accumulated craft** → `patterns.md` + `UBIQUITOUS_LANGUAGE.md`
- **Design rationale (the *why* behind choices)** → per-track `decisions.md`
  (lightweight ADRs, captured during implementation)
- **Task lifecycle rules** → `workflow.md` (devmode craft embedded)

## Capture decisions and hand off "warm"

Two cheap habits keep a long-horizon track resumable:

- **Decision capture (ADR):** when you make a non-obvious choice during
  implementation, append an entry to the track's `decisions.md` (context →
  decision → why → alternatives → consequences). Status is recoverable from git;
  *rationale* is not, unless you write it down. The `complexity-reviewer` and a
  fresh session both lean on this.
- **WARM START handoff:** before stopping (or at a phase boundary / compaction),
  write a handoff that lets the next session resume *cold*: the design concept,
  the current position, the single concrete next step, and any open decision —
  into Beads notes (`bd update --notes … && bd sync`) or the file-based
  `STATE.md` digest. A good handoff carries *intent*, not just status, so the next
  session doesn't re-derive the plan.

## Guardrails (gates-as-code, optional)

devmode's skills *persuade* via prompts; that's right for design judgment but
soft for hard safety rules. The optional **guardrails** add deterministic
*enforcement* that survives prompt drift — Claude Code hooks plus a Codex hook
adapter that block a small set of dangerous operations regardless of what the
agent intends.

- **Install:** `install.sh … --with-guardrails` copies **four** Claude hooks into
  `.claude/hooks/` and wires each into `.claude/settings.json` (idempotent):
  [`guardrails.py`](hooks/guardrails.py) on **PreToolUse**,
  [`verify_gate.py`](hooks/verify_gate.py) and
  [`devmode_phase_gate.py`](hooks/devmode_phase_gate.py) on **Stop**, and
  [`session_resume.py`](hooks/session_resume.py) on **SessionStart**. It also
  copies [`hooks/codex_hooks.py`](hooks/codex_hooks.py) (the single adapter
  covering all four behaviors) into `.codex/hooks/` and wires `.codex/hooks.json`
  for Codex. `update.sh` re-wires every one of them, so a project installed
  before a gate existed gains it instead of carrying a refreshed-but-inert file.
- **Rules** (first-match-wins, fail-open on any error):
  - **deny** — `sudo`, force-push, `--no-verify`/hook bypass, `rm -rf /`~`*`,
    writes to `.git/`, `.env*`, `.ssh/`, `*.pem`, credentials/secrets.
  - **ask** (user confirms) — `git reset --hard` / `clean -f` / `checkout .`,
    scoped `rm -rf`, reading a likely secret file.
  - **allow** (silent) — everything else; the common case stays frictionless.
- **devmode-built, devmode-shaped:** the hook is a **pure functional core**
  (`evaluate(tool, input) -> decision`, tested in `hooks/test_guardrails.py`) +
  a thin I/O shell — and was itself built test-first (the test caught a real
  `.env`-detection bug). Adapted (lean, stdlib-only) from the R-rule engine in
  `Chachamaru127/claude-code-harness` (MIT) — *patterns, not its Go binary*.
- **Optional extension — agent-as-hook:** the harness also runs a cheap model on
  every write to flag secrets/stubs. You can add that as a second `PreToolUse`
  hook that shells out to a fast model CLI; it's left out of the default install
  because it needs a model call (cost + a CLI dependency). Wire it only if you
  want a model-level pre-write guard on top of the deterministic rules.

## Prerequisites & honest costs

- **Beads CLI** (`npm i -g @beads/bd`, or brew/go). bd ≥ 1.0 uses an **embedded
  Dolt** engine by default — `bd init` just works, no server to run. (Only the
  opt-in `--server` mode needs an external `dolt sql-server`.) Verified on bd
  1.0.3: `bd init --stealth` initialized cleanly with no separate server.
- Beads is **optional**: every Conductor command works without it (`enabled:false`
  in `beads.json` or just don't `bd init`). You still get the full devmode +
  Conductor flow, minus the persistent graph/compaction-survival.
- **Lightweight memory alternative:** if you want compaction-survival without the
  `bd`/Dolt dependency, use a file-based `STATE.md` digest (template at
  `integrations/conductor-beads/templates/STATE.md`; a <100-line living memory
  that carries the design concept + position) instead of Beads. Use one or the
  other as the source of truth, not both.
- The `conductor`/`beads`/`conductor-*` skills may already exist globally in your
  environment — `install.sh` won't duplicate them unless you pass `--with-conductor`.

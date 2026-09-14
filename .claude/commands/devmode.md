---
description: Guided devmode mode. `start <name> <idea>` scaffolds a new workspaces/<name> project; `adopt <folder>` deploys+discovers an existing one; `update <folder>`|`update wiki <folder>` refreshes devmode (or a wiki's schema) in a project to the current base; `goal|plan <objective>` emits a ready-to-run Claude /goal or /plan command; `lean <idea>`|`lean goal <objective>` runs with the minimal-code (ponytail) discipline; `do <task>` routes & runs ONE task gated; `wiki start|adopt` deploys a Karpathy LLM Wiki; `c [comment]` applies the gates to an ad-hoc turn; `<idea>`/blank guides or resumes the current project.
argument-hint: start <name> <idea> | adopt <folder> | update <folder>|wiki <folder> | goal <objective> | lean <idea>|goal <objective> | do <task> | wiki start|adopt <path> | c [comment] | <idea> | (blank to resume)
---

# /devmode — guided mode

**For the modes that DRIVE THE PHASE MACHINE — `start`, `adopt`, `lean <idea>`, or
a bare idea / blank resume (Mode Start / Adopt / Lean / Resume, below) — the
phase work MUST run through the `devmode-orchestrator` agent via the Task tool**
(`subagent_type: "devmode-orchestrator"`). For `start` and `adopt`, first complete
their deterministic guard/scaffold/doctor steps, then delegate before ALIGN. For
`lean <idea>`, a bare idea, or blank resume, delegation is the first action. Do
**not** embody the phase machine inline — *spawn the orchestrator and relay its
gate*. The orchestrator does the mechanical work and pauses only at the human
decision gates (easy structured choices). The modes that
**do NOT** spawn the orchestrator: **`c`, `do`, `wiki`, and `update`** run inline
with the gates (Modes C-lite, Do, Wiki, Update, below); **`goal`/`plan`** (and
`lean goal`/`lean plan`) *emit a ready-to-run command* (Mode Goal). None of these
spin up the orchestrator.

This is **enforced, not advisory** (text alone gets ignored under pressure): the
`devmode_phase_gate.py` **Stop hook BLOCKS** ending a full `/devmode` turn that did
not spawn the orchestrator — override only with `DEVMODE-OK: <reason>` when
delegation genuinely doesn't apply (e.g. a one-line resume). The same hook
**auto-refreshes `devmode-dashboard.html`** from `.devmode/scorecard.json`, so the
dashboard can never go stale (it used to, because nothing forced the refresh).

> ⚠️ **Run `/devmode` from the project directory** (the one with `.devmode/`,
> `conductor/`, `.claude/`). If the session is rooted elsewhere (e.g. the devmode
> base repo), that project's `verify_gate.py`/`guardrails.py` hooks don't load
> (they key off `$CLAUDE_PROJECT_DIR`) and the ops-safety gates go inert.
>
> ⚠️ **…except the installer modes, which run from the devmode BASE repo.**
> `start`, `adopt`, `update`, `update wiki`, `wiki start` and `wiki adopt` invoke
> scripts under `integrations/…`, and those paths are relative to the base repo —
> an *installed project has no `integrations/` directory at all*, so running them
> there exits 127. Before any of those six: **confirm you're at the devmode repo
> root** (the dir containing `integrations/conductor-beads/install.sh`). If you're
> not, ask the user for the base path and prefix the command with it — never
> report success from a command that failed to launch.

Raw input: **$ARGUMENTS**

## Decide the mode from $ARGUMENTS

### Mode C-lite — `c [comentário]`  (first token is `c`)  ← CHECK THIS FIRST
The **per-turn discipline trigger**. Use for ops/debug/any ad-hoc work where the
heavy phase machine doesn't fit but the devmode *gates* must still apply. Do **NOT**
spin up the orchestrator, tracks, or phases. Parse everything after `c` as the task.

Apply this **operating contract** to the task this turn (it's why the gate exists —
CLAUDE.md alone gets ignored under pressure; here the gates are re-injected live and
the `Stop` hook `verify_gate.py` *enforces* the last one):

1. **Root cause before any change** (`systematic-debugging`). If something is broken,
   *investigate and state the root cause first*. No fix, rebuild, or config change
   before you can name the cause. Don't guess-and-rebuild.
2. **Risky op → backup first, then plan the check.** Before
   `rebuild`/`docker build`/`deploy`/`.env` changes: back up images + `.env`; never
   `--full`/`--super-power` (wrong-direction sync). Say how you'll verify *before* you act.
3. **No "done" without fresh end-to-end evidence** (`verification-before-completion`).
   Run a real check (a job reaching `completed/`, tests passing, a container log /
   HTTP 200) and *show it*. The `Stop` hook blocks the turn otherwise. If a check
   truly doesn't apply, write `VERIFY-OK: <reason>`.
4. **Honest self-read** — if you slipped on 1–3, say so plainly (`self-scorecard`).

Then do `[comentário]` under that contract. Keep the user *led, not quizzed*.

### Mode Do — `do <task>`  (first token is `do`)  ← also runs INLINE
Do ONE bounded task, **routed and gated** — the single-task sibling of the full
flow. Like `c`, it runs **inline** (do NOT spin up the orchestrator, tracks, or
phases); unlike `c`, it adds *routing* + a short pipeline. Parse everything after
`do` as the task. Refuse a missing `<task>`. Run these steps, briefly, out loud:

1. **Route.** Classify the task and name the skill lane(s) (+ an agent if it
   helps). State it in one line — `Routing: <skill(s)> [+ <agent>]`. Examples:
   - bug/failure → `systematic-debugging` (+ `tdd` for the regression)
   - new behavior → `tdd` + `testing-principles` (interface first: `design-interface-delegate-implementation`)
   - security/money/auth → `security-hardening` (control checklist) — **reviewed in full, never gray-boxed**
   - refactor/rename → `impact-analysis` first; migration/deprecation → `migration`
   - unknown to learn → a *code* `prototyping` spike (capture → delete); an
     *information* gap (unfamiliar tech/domain) → grounded perspective research
     (`grill-me`'s research technique: diverse perspectives, cite everything)
   - unclear ask → **stop and `grill-me`** before touching code
2. **Understand.** If ambiguous, ask the one/two questions that matter or read the
   nearest doc contract (`doc-contracts` / module map). Confirm goal, interface,
   constraints, and *how you'll verify* (`confidence-check`).
3. **Plan.** The smallest change + the check that proves it; failing test first for
   anything non-trivial.
4. **Execute.** Small steps; critical modules in full; constraints-not-steps if you delegate.
5. **Verify — evidence, not assertion** (`verification-before-completion`): run the
   real check and **show the output**. The `Stop` hook `verify_gate.py` blocks a
   "done" with no fresh check after a rebuild/deploy/`.env` change (`VERIFY-OK: <reason>` to override).
6. **Deliver.** What changed, the evidence, one line of next/watch. If it turned
   out project-sized, say so and hand off to the full `/devmode` flow.

Keep the user *led, not quizzed*.

### Mode Wiki — `wiki start <path>` | `wiki adopt <folder>`  (first token is `wiki`)  ← runs INLINE
Deploy a **Karpathy LLM Wiki** (the opt-in `integrations/llm-wiki/` module): a
persistent, LLM-maintained **markdown** knowledge base — no app, no database, no
server. It's a *knowledge* base, not the code phase machine, so it runs **inline**
(do NOT spin up the orchestrator). **Guard first: you must be at the devmode base
repo** (see the installer-modes warning above). The **second** token selects:

- **`wiki start <path>`** — scaffold a FRESH wiki at `<path>`:
  ```bash
  integrations/llm-wiki/install.sh "<path>"
  ```
- **`wiki adopt <folder>`** — add the wiki to an EXISTING project (non-destructive;
  audits, moves nothing):
  ```bash
  integrations/llm-wiki/install.sh "<folder>" --adopt
  ```

Parse everything after the subcommand as the path. Refuse a missing path. A
fresh start must refuse an existing non-empty directory and direct the user to
`wiki adopt`; adopt must require an existing directory. The installer activates
the schema for both hosts without replacing project instructions: Claude Code
gets an idempotent `@KARPATHY.md` import in `CLAUDE.md`, while Codex gets an
idempotent explicit read instruction in `AGENTS.md`.

Then, briefly: confirm the scaffold; point the user at the human how-to
(`README.md`, or `.llm-wiki/README.md` when adopt preserved a host README) and
`KARPATHY.md` (the schema that makes the agent a disciplined
maintainer); and offer to **ingest** a first
source — they drop a file in `raw/sources/`, you write a `wiki/sources/<slug>.md`
summary and update every affected page. The 7 page types, the frontmatter spec,
and the ingest/query/lint operations all live in the deployed `KARPATHY.md` —
read it and follow it. Keep the user *led, not quizzed*.

### Mode Lean — `lean <idea>` | `lean goal|plan <objective>`  (first token is `lean`)
Run with the **`minimal-code`** discipline (the "lazy senior dev" ladder) in the
foreground — write only what the task needs and **never cut validation, error
handling, security, or accessibility**. Two forms by the **second** token:
Refuse a missing `<idea>` or `<objective>` for the selected form.

- **`lean <idea>`** — drive the **full guided flow via the orchestrator** (like a
  bare idea), but brief it to keep `minimal-code` active *every* step: at ARCHITECT
  prefer stdlib/native/installed deps over new abstractions; at IMPLEMENT climb the
  ladder before writing, mark deliberate simplifications with a `minimal:` comment,
  keep the diff shortest-that-works. Delegate:
  `Task(subagent_type="devmode-orchestrator", …, "foreground the minimal-code skill at every code step; default intensity 'full' (say 'ultra' to push, 'lite' to only suggest)")`.
- **`lean goal <objective>`** (also `lean plan`) — exactly Mode Goal (below), but the
  emitted brief **bakes in the lean directive** so the executing `/goal`/`/plan`
  agent builds minimally. After scaffolding the brief from the track `spec.md`
  (`.devmode/goal_brief.py scaffold … --kind goal|plan`), prepend a short directive
  to it, e.g.:
  > *Lean build (ponytail ladder): before each change, take the first that holds —
  > skip-if-unneeded → stdlib → native → installed dep → one line → minimum.
  > Shortest working diff; no unrequested abstractions. NEVER cut validation,
  > error handling, security, or accessibility.*
  Then guarantee the limit (`printf '%s' "<brief>" | python3 .devmode/goal_brief.py check --budget 3800` → must say `PASS`) and emit the ready-to-run `/goal …` (or `/plan …`). Re-emit on request.

Keep the user *led, not quizzed*.

### Mode Update — `update <folder>` | `update wiki <folder>`  (first token is `update`)  ← runs INLINE
Refresh the devmode-MANAGED files in an existing project to the **current base**,
without touching anything the project owns. Runs **inline** (a sync, not the phase
machine). Refuse a missing `<folder>`. **Guard first: you must be at the devmode
base repo** (see the installer-modes warning above). The **second** token selects
what to update:

- **`update <folder>`** — update the **devmode system** in `<folder>`:
  ```bash
  integrations/conductor-beads/update.sh "<folder>"
  ```
  Overwrites the devmode-owned set (`.claude/skills/`, the role agents + the
  orchestrator, the `/devmode` command, the hooks incl. `session_resume`, the
  `.devmode/*.py` scripts, the references, the `conductor/workflow.md` adapter +
  `INTEGRATION.md` + track templates, and `CLAUDE.devmode.md` *only if it exists*).
  It also refreshes Codex adapters (`AGENTS.devmode.md` when used,
  `.agents/skills/` links, `.codex/agents/`, and opted-in hooks) without
  replacing project-owned Codex settings. `.codex/config.toml` is **merged, not
  replaced**: only the keys devmode declares are refreshed (marked in-file by the
  `devmode-managed` line); your own keys, tables and comments survive, and a file
  without that marker never has a value rewritten.
  **Never touches** the project's `CLAUDE.md`, `UBIQUITOUS_LANGUAGE.md`, conductor
  product/tracks/patterns, `.devmode/scorecard.json`, the dashboard, or any code.
- **`update wiki <folder>`** — update a deployed **LLM Wiki's schema** in `<folder>`:
  ```bash
  integrations/llm-wiki/update.sh "<folder>"
  ```
  Refreshes only installer-owned schema/how-to docs (`KARPATHY.md`, the deployed
  `README.md` or `.llm-wiki/README.md`, and installer-owned `raw/README.md`), and
  backfills the idempotent Codex pointer in `AGENTS.md` — a wiki deployed before
  Codex support has none, leaving its schema invisible to Codex; **never touches**
  knowledge (`wiki/` pages, `raw/sources/`, `CLAUDE.md`) and never replaces
  host-owned docs (the `AGENTS.md` change is additive and idempotent).

After running, tell the user to review with `git -C "<folder>" status` (only
devmode-managed files should appear) and summarize what was refreshed. Keep the
user *led, not quizzed*.

### Mode Start — `start <name> <idea>`  (first token is `start`)
Scaffold a brand-new project under `workspaces/` and begin work in it. Parse the
**second** token as `<name>` (slugify: lowercase, spaces→`-`) and **everything
after** as `<idea>`.

Refuse missing `<name>` or `<idea>`. After slugification, require `<name>` to
match `^[a-z0-9][a-z0-9-]*$`; reject dots, slashes, absolute paths, `..`, and any
other value that could escape or ambiguously address `workspaces/`.

1. **Guard:** confirm you're at the devmode repo root (the dir containing
   `integrations/conductor-beads/install.sh`). If not, tell the user to run it
   from the devmode repo. Refuse if `workspaces/<name>` already exists (suggest a
   new name or `/devmode` to resume).
2. **Create the working repo before initializing memory:** Beads needs repository
   context, so create the target and initialize Git before the installer runs:
   ```bash
   mkdir -p "workspaces/<name>"
   git -C "workspaces/<name>" init -q
   ```
3. **Scaffold (copy everything in):** run the installer to copy the devmode base
   (CLAUDE.md, 43 skills, 8 agents, references), mount the Conductor layer, drop
   the orchestrator + `/devmode` command, init Beads, and **wire the deterministic
   guardrails hook**:
   ```bash
   integrations/conductor-beads/install.sh "workspaces/<name>" --beads-stealth --with-guardrails
   ```
4. **Announce the new project path**, then prove the memory layer is live — don't
   assume it (see *Memory gate* below):
   ```bash
   python3 "workspaces/<name>/.devmode/beads_doctor.py" "workspaces/<name>"
   ```
5. **Begin:** treat `<idea>` as the goal, enter the new project
   (`workspaces/<name>`), and start **Phase 1 (ALIGN)** — the orchestrator's
   `grill-me` interview. From here, follow the orchestrator playbook end to end.

> `workspaces/` is gitignored scratch in the devmode repo — perfect for spinning
> up an isolated project without touching the base. Bring learnings back by hand.

### Mode Adopt — `adopt <folder>`  (first token is `adopt`)
Deploy devmode into an **existing** codebase and discover it (do NOT scaffold a
blank project). Parse everything after `adopt` as `<folder>` (an absolute or
relative path to the target repo). Refuse a missing `<folder>`.

1. **Guard:** confirm you're at the devmode repo root (the dir containing
   `integrations/conductor-beads/install.sh`) — the installer path below is
   relative to it. Then confirm `<folder>` exists and looks like a code repo. If
   it already has `conductor/` + `.claude/`, offer to refresh discovery instead
   of redeploy.
2. **Deploy the base+layer in place:** run the installer against the existing
   folder (it's idempotent — won't clobber files without `--force`):
   ```bash
   integrations/conductor-beads/install.sh "<folder>" --beads-stealth --with-guardrails
   ```
2b. **Existing instructions stay the host.** The installer leaves their content
   intact and only **appends one idempotent pointer** to `CLAUDE.md`
   — `@CLAUDE.devmode.md` — so the devmode base is composed in via Claude Code's
   native import, while the project's own instructions stay the host (and take
   precedence on conflict). **Default: leave it exactly like that** — don't merge.
   Just confirm to the user that their `CLAUDE.md` is untouched apart from the
   pointer line, and that `CLAUDE.devmode.md` holds the base. Existing
   `AGENTS.md` receives the equivalent small pointer to `AGENTS.devmode.md` for
   Codex. *Only if the user
   explicitly wants a single flat file* should you offer to inline the import
   (merge `CLAUDE.devmode.md` in, then drop it). (`/devmode start` writes the
   `CLAUDE.md` directly — no pointer needed.)
2c. **Prove the memory layer is live — don't assume it** (see *Memory gate* below):
   ```bash
   python3 "<folder>/.devmode/beads_doctor.py" "<folder>"
   ```
3. **Run discovery** (skill: `discovery`) on the codebase — Scout → Map → Domain
   → Synthesize. Produce, with 🟢/🟡/🔴 confidence tags:
   - seed `<folder>/UBIQUITOUS_LANGUAGE.md` (terms + module map),
   - `<folder>/DISCOVERY.md` (purpose, provisional design concept, architecture,
     **readiness read** — test safety-net + operational — and risks/gaps).
4. **Resolve the gaps & plan the approach:** enter the **ALIGN** gate (`grill-me`)
   aimed at the 🔴 gaps discovery surfaced — confirm the provisional design concept
   with the user *before* proposing any change, and let the **readiness read** set
   the first move (a 🔴 test safety-net → write characterization tests *before*
   touching the code). Discovery proposes; the human confirms.
5. From there, normal guided flow (the user states what they want to build/fix in
   the now-understood codebase).

### Mode Goal — `goal <objective>`  (first token is `goal`)  ·  also `plan <objective>`
Produce a ready-to-run **`/goal`** command (≤3800 chars for Claude compatibility) that
references a detailed spec — the opt-in bridge to `/goal`/`/plan` (skill:
`goal-brief`). **devmode does not start `/goal` automatically; it emits the
command for you to run each iteration.** This mode is **only** triggered by an explicit `goal`/
`plan` token — `/goal` is never wired into the normal flow.
Refuse a missing `<objective>`.

1. **Ensure the objective doc exists** (the brief references it for the detail):
   if no spec covers `<objective>`, create one first — `grill-me` → `write-prd`
   → `/conductor-newtrack`, so `spec.md` carries the **step-by-step + tests +
   acceptance criteria**. Reuse the existing track `spec.md`/`plan.md` when present.
2. **Build + budget-check the brief** (skill: `goal-brief`):
   ```bash
   python3 .devmode/goal_brief.py scaffold conductor/tracks/<id>/spec.md \
     --plan conductor/tracks/<id>/plan.md --kind goal \
     --ref conductor/tracks/<id>/spec.md --budget 3800
   ```
   Omit `--plan` only when that track genuinely has no `plan.md` yet.
   Refine it to reference the file in detail, then guarantee the limit:
   `printf '%s' "<brief>" | python3 .devmode/goal_brief.py check --budget 3800`
   (must say `PASS`). Use `--kind plan` to emit a `/plan` brief instead (plan the
   goal before executing it; the `/plan ↔ /goal` recursion).
3. **Emit the ready-to-run command** to the user (`/goal …` or `/plan …`), note
   it references `spec.md`, and re-emit an updated one whenever they ask (each
   iteration reflects the current spec/plan).

### Mode Resume — `<idea>` or blank  (no `start`/`adopt`/`goal`/`plan`)
Run/resume in the **current** project (don't scaffold):
- Blank → check `bd ready` + the track `plan.md`/notes; offer to resume from where
  it stands (design concept + next step).
- An idea → treat it as the goal and enter Phase 1 (ALIGN).

## Memory gate — `start` and `adopt` must prove Beads is live

Beads is the memory that survives compaction. Its failure is **silent**: if `bd`
isn't installed the install still finishes, `conductor/beads.json` keeps saying
`enabled: true`, and the session quietly falls back to the agent's own context —
found out much later, when a handoff you believed was durable never existed.

So **run the doctor and show its output** before entering ALIGN:

```bash
python3 <project>/.devmode/beads_doctor.py <project>
```

It checks the *running* system, not the config: `bd` on PATH, `.beads/` present,
and `bd` actually answering **inside that project** (exit 0 = live, 1 = not).

- **Green** → say so in one line (`memory: live — N issues`) and continue.
- **Red** → **stop and tell the user before any phase work.** Name the exact
  consequence: *handoffs will live only in this conversation and be lost on
  compaction.* Give the fix (`brew install beads` / `npm i -g @beads/bd`, then
  `bd init --stealth`), then let them choose: fix it now, or continue explicitly
  without durable memory. Never proceed silently — that's the failure this gate
  exists to prevent. (The installer already flips `beads.json` to `enabled:false`
  when the doctor fails, so the state on disk never claims memory it doesn't have.)

## Then drive the phase machine (phase-driving modes only)

Delegate per phase; do mechanical work autonomously; stop only at gates:
ALIGN (grill-me + confidence-check) → LANGUAGE (ubiquitous-language) →
SPECIFY (prior-art + write-prd + divergent-ideation + design-critique, /conductor-newtrack) → ARCHITECT
(FCIS / boundaries / interfaces) → IMPLEMENT (/conductor-implement: tdd,
testing-principles, feedback-loops, systematic-debugging) → REVIEW (code-review
panel) → REFACTOR (impact-analysis → improve-codebase-architecture) as needed.

At every gate: batched, structured A/B/C choices with a recommendation. Honor the
base-wins rules (grill before assets, no blind coverage gate, fresh verification
before "done", critical modules reviewed in full). Hand off warm (design concept
+ position + next step → Beads notes + `bd sync`) before stopping.

**Always show the score (skill: `self-scorecard`).** At each phase gate, give a
one-line overview of what was done and an evidence-backed 0–10 score on the five
criteria, rendered with the tracker so the user sees the trend:
`echo '<json>' | python3 .devmode/scorecard.py`. Then refresh the visual
dashboard: `python3 .devmode/dashboard.py .` (writes `devmode-dashboard.html` —
open it anytime; no server, no registration). At the end, run
`python3 .devmode/scorecard.py --final` with per-criterion **recommendations**.

Keep the user *led*, not quizzed: do the work, ask only what matters.

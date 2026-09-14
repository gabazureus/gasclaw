---
name: goal-brief
description: >-
  Turn a devmode spec into a ready-to-run `/goal` (or `/plan`)
  command — a compact launch brief (≤3800 chars) that references the spec file in
  detail (step-by-step + tests + acceptance criteria) and is guaranteed to fit
  the limit. Use ONLY when the user explicitly asks for it (e.g. `/devmode goal`,
  "make me a /goal", "generate the goal prompt", "I want to run this as a /goal").
  Do NOT wire `/goal` into the normal phase flow — it's opt-in. By contract,
  devmode emits the command for the user to run each iteration.
---

# goal-brief

`/goal` and `/plan` are available in Claude Code and current Codex surfaces, and
Claude Code applies a prompt limit (~4000; work to ≤3800 for cross-host
compatibility). The hard part is that a great
`/goal` needs a *lot* of detail (steps, tests, acceptance criteria) that won't
fit. devmode already solves that: the **`spec.md` + `plan.md`** of a track *are*
that detailed objective doc. This skill turns them into a **compact launch brief
that references the file** — so the long detail lives in the spec, and the
`/goal` command stays small.

## Key fact: devmode emits the command; you run it

This cross-host workflow deliberately **produces a ready-to-run `/goal` command**
for the user instead of starting goal mode automatically. That preserves the
same explicit opt-in behavior on Claude Code and Codex, even where Codex exposes
goal state programmatically. Re-emit it from the current spec/plan each time the
user asks.

## Opt-in only

This is **not** part of the normal Align→…→Review flow. Only reach for it when the
user explicitly wants a `/goal` (or `/plan`) — typically via `/devmode goal
<objective>`. Don't auto-emit `/goal` during a normal build.

## The recursion (`/plan` ↔ `/goal`)

- **`/plan`** plans the objective. devmode's grill + `write-prd` already *is* the
  planning, producing `spec.md`/`plan.md`. Emit a `/plan` brief (`--kind plan`)
  when you want the active agent to *plan* the goal before executing it.
- **`/goal`** executes the objective from the spec. Emit a `/goal` brief
  (`--kind goal`).
- You can chain them: `/plan` to refine the spec → re-run this skill → `/goal` to
  execute. Each emission reflects the *current* spec/plan state.

## How to produce a brief

1. **Ensure the objective doc exists.** Reuse the track's `spec.md` (+`plan.md`).
   If there's no spec yet, produce one first ([`write-prd`](../write-prd/SKILL.md),
   after [`grill-me`](../grill-me/SKILL.md)) — it must carry the **step-by-step,
   the testing strategy, and the acceptance criteria**, because the brief points
   at it for the detail.
2. **Scaffold the brief** from the spec:
   ```bash
   python3 .devmode/goal_brief.py scaffold conductor/tracks/<id>/spec.md \
     --plan conductor/tracks/<id>/plan.md --kind goal \
     --ref conductor/tracks/<id>/spec.md --budget 3800
   ```
   Omit `--plan` only when the track has no plan yet. The script extracts the
   objective, acceptance criteria, plan steps, and test line, wraps them with
   devmode execution rules, references the file, and reports the char count.
3. **Refine** so the brief *references the file in detail* (the spec path, what
   it contains, the acceptance criteria to meet) while staying terse — the file
   holds the depth; the brief is the pointer + the must-knows.
4. **Guarantee the limit** (the feedback loop):
   ```bash
   printf '%s' "<your brief>" | python3 .devmode/goal_brief.py check --budget 3800
   ```
   It must report `PASS`. If `OVER`, condense (rely more on the file reference,
   summarize the acceptance criteria) and re-check. **Never hand over a brief
   that hasn't passed `check`.**
5. **Emit the ready-to-run command** to the user: `/goal <brief>` (or `/plan …`).
   Tell them it references `spec.md`, and that you'll re-emit an updated one
   whenever they ask (each iteration).

## What a good brief contains (compact)

- **Objective** in one or two lines.
- **"Read `<spec path>` IN FULL"** — the step-by-step, tests, acceptance criteria.
- The **acceptance criteria** (or, if too long, a count + the file pointer).
- The **devmode execution rules** condensed: test-first, verify with evidence,
  critical modules reviewed in full, don't claim done without running checks,
  report a `self-scorecard` at the end.
- A clear stop condition (stop only at a real blocker / a decision needing the human).

## Red flags

- Emitting a `/goal` without a spec to reference (the brief becomes a vague wish).
- Handing over a brief that hasn't passed `goal_brief.py check` (may exceed the limit).
- Wiring `/goal` into the default flow (it's opt-in — only on explicit request).
- Pretending devmode started `/goal`; this mode's explicit contract is to emit it.

> devmode-original. `/goal` and `/plan` are cross-host commands (referenced, not
> vendored). The budget guard is `scripts/goal_brief.py` (installed to
> `.devmode/goal_brief.py`).

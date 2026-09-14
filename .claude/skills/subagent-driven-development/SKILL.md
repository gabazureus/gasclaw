---
name: subagent-driven-development
description: >-
  Execute an implementation plan by dispatching a fresh subagent per task and
  running a two-stage review (spec compliance, then code quality) after each.
  Use this when you have a plan or PRD with mostly-independent tasks and want to
  build it in the current session without polluting your own context — the
  operational "how" behind devmode's design-interface/delegate strategy. Trigger
  when the user says "implement this plan", "delegate these tasks", "build this
  with subagents", or after write-prd / a Conductor plan is approved.
---

# Subagent-driven development

This is the *operational mechanism* for the strategy in
[`design-interface-delegate-implementation`](../design-interface-delegate-implementation/SKILL.md):
design the interface yourself, then delegate the implementation as a **gray box**
verified from the outside. That skill says *why*; this one says *how* — dispatch
a fresh subagent per task, review its output in two stages, and keep your own
context for coordination.

**Why a fresh subagent per task:** you construct exactly the context each task
needs — it never inherits your session's history, so it stays focused and you
preserve your own context for orchestration. **Core loop:** fresh implementer →
spec-compliance review → code-quality review → next task.

## When to use it

- You have a plan/PRD with tasks that are **mostly independent**.
- You're staying in **this session** (no parallel-session handoff).
- Tasks are well-enough specified that an isolated agent can execute them.

If tasks are tightly coupled, or the design isn't settled, stop and
[`grill-me`](../grill-me/SKILL.md) / [`write-prd`](../write-prd/SKILL.md) first.

## The process

1. **Read the plan once.** Extract *all* tasks with their full text and context;
   build your own task list. Don't make subagents re-read the plan — hand them
   the text.
2. **Per task, dispatch an implementer subagent** with a self-contained prompt:
   the task text, where it fits, the interface/contract it must hit (from the
   spec), and the constraints/invariants — *not* the implementation steps.
   Instruct it to work test-first ([`tdd`](../tdd/SKILL.md)), self-review, and
   commit.
3. **Answer questions before it builds.** A good implementer asks up front;
   answer clearly, then let it proceed.
4. **Stage 1 — spec-compliance review** (separate subagent). Does the code match
   the spec — nothing missing, nothing extra? Issues → implementer fixes →
   re-review. Don't start stage 2 until this is ✅.
5. **Stage 2 — code-quality review** (separate subagent). Deep modules, names in
   the [`ubiquitous language`](../ubiquitous-language/SKILL.md), no shallow-module
   sprawl, tests at stable boundaries. Issues → fix → re-review.
6. **Verify, then mark complete** — apply
   [`verification-before-completion`](../verification-before-completion/SKILL.md)
   to the diff (don't trust the agent's "success" report).
7. **After all tasks**, run a final review over the whole change — the review
   panel per [`code-review`](../code-review/SKILL.md) (`complexity-reviewer` leads
   the lanes); act on findings and re-verify before calling it done.

## Handling implementer status

Implementers report one of four states — never ignore an escalation:

- **DONE** → only if it came with an **evidence-backed self-review** (each claim
  + the actual command output, per the `tdd-implementer`'s evidence-gated
  handoff). A "DONE" with empty/fabricated evidence bounces back *before* you
  spend a reviewer on it. Then proceed to spec review.
- **DONE_WITH_CONCERNS** → read the concerns; address correctness/scope ones
  before review; note observations and continue.
- **NEEDS_CONTEXT** → supply what's missing and re-dispatch.
- **BLOCKED** → diagnose: more context? more capable model? task too large
  (split it)? plan wrong (escalate to the human)? Never force the same model to
  retry unchanged.

## Parallelize with isolation, not luck

The fresh-implementer / separate-reviewer split *is* the maker/checker discipline
of loop engineering — never let the model that wrote the code be the one that
grades it. To run implementers **concurrently**, give each its own **git
worktree** (or branch/clone) so parallel writes can't collide; merge after each
passes its reviews. Dispatching parallel implementers into the *same* working
tree on overlapping files is the classic conflict (see red flags) — isolation,
not hope, is what makes the fan-out safe.

## Model selection (cost/speed)

Use the least powerful model that can do the role:
- 1–2 files with a complete spec → fast/cheap model (most tasks are mechanical).
- Multi-file integration / debugging → standard model.
- Architecture, design, or review judgment → most capable model.

## Delegation discipline (the gray-box contract)

- **Fix the interface and the tests first** — that's what lets you *not* read
  every line. A gray box is only safe when its boundary is pinned.
- **Critical modules are never gray boxes.** Money, auth, security, irreversible
  effects → review in full regardless of the subagent's report.
- **Give constraints, not steps.** Prescribing how throws away the agent's
  tactical strength.
- **Spec review before quality review** — wrong order lets over/under-building
  slip through.

## Red flags

- Skipping either review, or proceeding with unfixed issues.
- Dispatching multiple implementers in parallel on overlapping files (conflicts).
- Making a subagent read the plan instead of handing it the text.
- Trusting self-review as a substitute for an independent review.
- Letting an agent's "success" stand in for inspecting the diff.

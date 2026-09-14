---
name: confidence-check
description: >-
  Run a quick pre-flight readiness check before starting a non-trivial build —
  do I understand the goal, the interfaces, the constraints, and how I'll verify
  success? Use right before implementation begins, when a task feels
  underspecified, when you notice yourself about to "just start coding", or when
  the user says "are we ready to build this?", "do you have what you need?". This
  is the gate at the START of work; verification-before-completion is the gate at
  the END.
---

# Confidence check

Most wasted implementation work isn't bad coding — it's *confident coding on a
shaky foundation*. The AI will happily start building from an underspecified
task and discover the gaps halfway through. This skill is a short pre-flight gate:
before you write code, confirm you actually have what you need. It's the bookend
to [`verification-before-completion`](../verification-before-completion/SKILL.md)
— readiness before, evidence after.

## The five checks

Before starting implementation, answer each honestly. Any "no" is a stop signal.

1. **Goal** — can I state *what* this must do and *why*, in the project's
   [`ubiquitous language`](../ubiquitous-language/SKILL.md)? (Not just the *how*.)
2. **Interface** — do I know the contract I'm building to — signatures, types,
   inputs/outputs, error shapes? Is it settled, or am I guessing?
3. **Constraints & edges** — do I know the invariants, the failure cases, the
   performance/security limits, and what's explicitly out of scope?
4. **Context** — do I understand where this fits and what it depends on? For a
   change, have I done [`impact-analysis`](../impact-analysis/SKILL.md) on the
   blast radius?
5. **Verification** — do I know the concrete check that will prove this works
   (the command, the test, the observable outcome)? If I can't name it, I'm not
   ready to claim "done" later either.

## Prove the read with worked examples

The Goal check fails silently when you *restate* the task and it sounds right —
abstract agreement is exactly where a misread hides. Before building anything
non-trivial, make the interpretation concrete: give **three examples of what the
result will actually do — at least one an edge case** — and confirm they match
what the user meant. An example that forks into "well, it depends" isn't a detail
to guess at later; it's a gap to resolve *now* — surface it as a question. Cheap
to confirm up front, expensive to discover after you've built the wrong thing.

## What to do with the result

- **All five solid** → proceed; build test-first ([`tdd`](../tdd/SKILL.md)).
- **A gap in goal / constraints / context** → don't fill it by guessing. Go back
  to [`grill-me`](../grill-me/SKILL.md) (align) or
  [`write-prd`](../write-prd/SKILL.md) (specify). Surfacing the gap as a question
  is the high-value move.
- **A gap in interface** → settle it with the human or the `design-architect`
  before delegating any implementation.
- **A gap in verification** → define the success check *now*; a task with no
  verifiable success criterion isn't ready.

## Why a number isn't the point

Treat this as a *checklist of gaps to close*, not a score to optimize. A
"confidence percentage" invites the AI to rationalize a high number and proceed;
the value is in **naming the specific missing thing** and resolving it. One real
unresolved gap matters more than an averaged score that looks fine.

## Red flags

- "I'll figure out the edge cases as I go" (without knowing what they are).
- Starting to code while the interface is still ambiguous.
- Not being able to name the command/test that will prove success.
- Treating the check as a formality to pass rather than gaps to close.

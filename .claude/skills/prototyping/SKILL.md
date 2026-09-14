---
name: prototyping
description: >-
  Build throwaway code that answers ONE question, then delete it — a spike to
  validate a design decision before committing production work. Use when you're
  unsure how a state machine behaves at the edges, which of several UI/API shapes
  is right, whether a library can do the thing, or how data really looks; when
  the user says "spike", "prototype", "throwaway", "let's just try it", "proof of
  concept", "explore before we build". The opposite of production code: no tests,
  no abstractions, no persistence — just an answer.
---

# Prototyping (the spike)

A prototype is **throwaway code that answers a question.** Its only job is to turn
an unknown into a known cheaply, so the *real* design decision is made on evidence
instead of speculation. The question decides the shape; once it's answered, the
prototype is deleted (its learning captured) — keeping it is how a spike rots into
unowned production code.

This is the deliberate, bounded version of "let's just try it". It belongs
*before* the [`write-prd`](../write-prd/SKILL.md)/[`tdd`](../tdd/SKILL.md) commit
when an assumption is load-bearing and unverified — a cheap input to a confident
[`design-critique`](../design-critique/SKILL.md), not a substitute for it.

## Identify the question first

A prototype with no question is just unowned code. State it in one line — "does
the quota reset correctly across a DST boundary?", "which of these three table
layouts reads best?", "can this API page beyond 10k rows?". The question picks the
shape:

- **Logic / behavior** → a tiny interactive harness (a script, a REPL, a terminal
  loop) that drives the thing through the edge cases that are hard to reason about
  on paper. **Surface the state after each step** so the behavior is visible.
- **Shape / interface** (UI or API) → build *several* radically different options
  side by side (toggle via a flag/param/route), so you're choosing between real
  alternatives, not defending the first one.

Picking the wrong branch wastes the whole spike — when ambiguous, default to a
logic harness for backend modules and a shape comparison for surfaces.

## Build it deliberately throwaway

- **Name it as a prototype** and colocate it near the code it validates, but keep
  it obviously separate (a `prototype/` or `spike-<question>` path) so no one
  mistakes it for production.
- **One command to run it** (`python spike_quota.py`, `npm run spike`, …),
  following the project's existing run conventions.
- **Strip everything not load-bearing for the question:** no tests, no error
  handling, no abstractions, no persistence — *unless persistence itself is the
  question* (then a scratch db/file is fine).

## Capture the answer, then kill it

The deliverable of a spike is the **answer, not the code.** Write what it revealed
where the decision lives — a commit message, an ADR
([`documentation`](../documentation/SKILL.md)), an issue, or a `NOTES.md` — then
**delete the prototype** or fold the validated decision into production via
[`tdd`](../tdd/SKILL.md) (re-derived test-first, not pasted). A migration-style
rule applies: a spike isn't done until it's deleted or promoted, never left to rot
([`migration`](../migration/SKILL.md): kill zombie code).

## Red flags

- A prototype with no written question (you'll learn nothing specific).
- A spike growing tests, abstractions, or a second feature — it's becoming
  production; stop and start it properly.
- "We'll just keep the prototype" — now you have untested, unowned production code.
- Pasting spike code straight into the codebase instead of re-deriving it test-first.
- Spiking what you could answer by reading the docs/source
  ([`source-of-truth`](../source-of-truth/SKILL.md)) — don't prototype a known.

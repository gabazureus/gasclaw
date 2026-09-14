---
name: design-interface-delegate-implementation
description: >-
  Split work between strategy and tactics — design module interfaces carefully
  yourself, then delegate the implementation behind them to the AI as a gray
  box verified from the outside. Use this when planning how to build a feature
  with an AI agent, when deciding what to review closely versus delegate, when
  the user says "design the interface", "delegate this", "I don't want to
  review every line", "treat this as a black box", or when a feature is large
  enough that reviewing every implementation line would exhaust you. The
  interface plus its tests pin the behavior, so the implementation can be
  delegated safely.
---

# Design the interface, delegate the implementation

AI is a superb tactical programmer and a poor strategist. The leverage in this
process comes from putting each where it's strong: **you (or the
`design-architect`) own the interfaces; the AI owns the implementations behind
them.** This is both a quality strategy and a sanity strategy — it's how you
ship far more code than before without your brain melting trying to hold every
line in your head.

The mental model is the **gray box**. A deep module is a box with a simple
interface on top and a lot of logic hidden inside. You design the lid — the
interface — with real care, because that's the contract everything else depends
on and the thing that's expensive to change later. The inside, you can leave
largely to the AI: you don't read every line, you verify the box from the
*outside* through its interface and tests. Gray, not black, because you can open
it when you need to — but you usually don't need to.

## What to design carefully vs. delegate

**Design carefully (this is strategy — keep it in your head):**

- The **public interface**: signatures, types, return/error shapes, events,
  endpoints. Name things in the
  [`ubiquitous language`](../ubiquitous-language/SKILL.md).
- The **boundary**: what data crosses in and out, and what stays hidden inside.
- The **invariants and contract**: what's always true, what errors are possible,
  what the caller may assume.
- Which modules are **critical** (money, auth, data integrity, security) — these
  you review fully; the gray-box trust does not extend to them.

**Delegate (this is tactics — let the AI cook):**

- The implementation *inside* a non-critical deep module, once its interface and
  tests are fixed.
- Routine wiring, boilerplate, and mechanical transformations.

## How to delegate safely

This skill is the *strategy*; the *mechanism* lives in
[`subagent-driven-development`](../subagent-driven-development/SKILL.md) (dispatch
a fresh subagent per task with two-stage review) and
[`delegate-to-cli`](../delegate-to-cli/SKILL.md) (offload to an external model
CLI). Both enforce the same gray-box contract below.

A gray box is only safe if the outside is locked down. Before you delegate the
inside:

1. **Fix the interface.** Write the signatures and types. This is the contract;
   it should not change just because the implementation was inconvenient.
2. **Write the tests against the interface first.** The tests are what let you
   *not* read every line — they pin behavior from the outside. Lean on
   [`tdd`](../tdd/SKILL.md) and
   [`testing-principles`](../testing-principles/SKILL.md) for where the boundary
   sits and what to assert. A pure
   [`functional core`](../functional-core-imperative-shell/SKILL.md) makes this
   boundary especially clean.
3. **State the constraints, not the steps.** Tell the agent the invariants,
   performance budget, and data shapes — then let it choose how. Prescribing
   implementation steps throws away the AI's tactical strength.
4. **Verify from the outside.** Run the tests, types, linter, and (for UI) a
   real browser. If the box passes its interface tests, accept it without
   line-by-line review — that's the whole point. Open the box only if a test
   fails or the module is critical.

## Why this saves your brain

Shipping fast with AI is exhausting when you try to keep every line in working
memory — both you and the model have to hold the whole tangle. Deep modules with
trustworthy interfaces let you *forget* the inside. You reason about the system
as a handful of boxes and their contracts, not thousands of lines. That smaller
mental model is what makes a high volume of AI-generated code sustainable rather
than crushing.

## Design the interface twice when it's high-stakes

Spending attention on the interface doesn't mean polishing your first idea — your
first idea is rarely the best. When an interface is high-stakes or hard to
reverse, sketch **2–3 radically different shapes** before committing, each under a
different forcing constraint (minimise the surface to 1–3 entry points / maximise
flexibility / optimise the most common caller), and for each note its signatures +
invariants, one usage example, what it hides, and its trade-offs. Then commit to
the shape that is **deepest** (most behavior per unit of interface) and puts the
seam in the right place — or to a hybrid. Reserve this for interfaces that earn
it; routine ones don't need a bake-off.
[`prototyping`](../prototyping/SKILL.md) covers making those alternatives
*runnable* when paper isn't enough, and
[`subagent-driven-development`](../subagent-driven-development/SKILL.md) lets you
generate the competing shapes in parallel.

## Guardrails

- A gray box is only as safe as its interface tests. If a module is
  under-tested, you don't yet have the right to stop reading it.
- Critical modules (finance, auth, security, irreversible side effects) are
  never gray boxes — review them fully regardless of test coverage.
- If the AI keeps wanting to change the interface to make the implementation
  easier, that's a design signal: either the interface is wrong (fix it
  deliberately) or the implementation is fighting a missing
  [`functional-core/imperative-shell`](../functional-core-imperative-shell/SKILL.md)
  split.
- The interface is expensive to change and cheap to get right up front. Spend
  your attention there.

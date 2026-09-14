---
name: write-prd
description: >-
  Turn an aligned design concept into a Product Requirements Document that is
  explicit about which modules and interfaces change and how. Use this after
  reaching shared understanding (e.g. via grill-me) and before implementation,
  whenever the user says "write a PRD", "write up the spec", "document this
  feature", "create a plan for this", or when a change is large enough that
  jumping straight to code would lose the design. The PRD must name module
  boundaries and interface changes, not just user-facing behavior — investing
  in the design of the system is the whole point.
---

# Write a PRD

A PRD here is not a wish list of features. It is where you **invest in the
design of the system** (Kent Beck: do this every day). "Specs-to-code" fails
because it divests from design — it describes behavior and lets the compiler
invent the structure, which decays a little more every run. A good PRD does the
opposite: it commits to *what behavior is needed* and *how the system's
structure changes to support it*, so implementation has a spine to follow.

Write the PRD only after the design concept is shared (see
[`grill-me`](../grill-me/SKILL.md)), and write it in the project's
[`ubiquitous language`](../ubiquitous-language/SKILL.md) so the terms mean the
same thing here as in the code.

## Structure

Use this template (a ready-to-copy version lives at
[`assets/prd-template.md`](assets/prd-template.md)). Keep each section tight — a
PRD earns its length by being specific, not long.

```markdown
# PRD: <feature name>

## Problem & purpose
What problem this solves, for whom, and why now. One short paragraph.

## Design concept
The agreed theory of the change in 3–5 sentences. The shared understanding
from grilling, stated plainly so a reader new to the conversation gets it.

## Scope
- In scope: ...
- Out of scope: ... (be explicit — boundaries prevent drift)

## Behavior
The observable behavior, written as concrete scenarios:
- Happy path: ...
- Edge cases: empty input, failure, limits, concurrency
- Errors: what the user/system sees when things go wrong

## Module & interface changes   <-- the heart of the PRD
For each affected module:
- **<Module>** — purpose of the change. New or modified?
  - Interface: the public surface that changes (signatures, types, events,
    endpoints). Design this carefully — it's the contract you'll test against.
  - Implementation notes: only what constrains the design (invariants,
    performance, data shape). Leave routine implementation to the builder.
  - Boundary: what crosses in and out, and what stays hidden inside.

## Data
Shapes, sources of truth, migrations, state transitions.

## Testing strategy
Where the test boundaries sit (which interfaces get verified from the
outside), what to mock, and what "done and correct" means. See
testing-principles.

## Open questions / risks
Anything still unresolved, and what would resolve it.
```

## Why the module & interface section matters most

The AI is a strong tactical programmer but a weak strategist. If the PRD only
describes user-facing behavior, the AI invents the structure — and it tends
toward shallow modules and entropy. By naming the modules that change and
designing their **interfaces** here, you set the strategy and let the AI fill
the implementation. This is the same idea as
[`design-interface-delegate-implementation`](../design-interface-delegate-implementation/SKILL.md):
the interface is yours, the implementation can be delegated, because the
interface plus tests pin the behavior from the outside.

Be concrete about interfaces: real signatures, real types, real endpoint shapes
or event names. "Add a service to handle billing" is not a design; it's a
restatement of the feature. "`BillingGateway.charge(seatId, amount): Result<Receipt, ChargeError>`,
called only by the imperative shell, pure-validated by the functional core" is
a design.

## Working style

- Write in the ubiquitous language, and work from its **module map** — the
  PRD's module & interface section should reference the modules named there, and
  if the change adds or reshapes a module, update that map as part of this work.
  If a needed term isn't in the glossary, add it there too.
- Prefer the smallest design that satisfies the concept. Don't pre-build for
  hypothetical futures — that's its own form of entropy.
- Surface trade-offs rather than silently resolving them; if a decision is the
  user's to make, list it under open questions.
- **Make every resolved decision land.** A trade-off you settled (or an ADR) isn't
  done when it's *recorded* — it's done when the behavior or module/interface
  section actually reflects it. Before approving, confirm each decision is
  referenced somewhere downstream, not stranded in a log (the decision-coverage
  check in [`feedback-loops`](../feedback-loops/SKILL.md)).
- Before approving a high-stakes PRD, pressure-test it with
  [`design-critique`](../design-critique/SKILL.md) — review it through several
  expert lenses and surface the trade-offs while it's still cheap (on paper).
- When the PRD is approved, it becomes the brief for implementation — typically
  handed to [`tdd`](../tdd/SKILL.md) and the `tdd-implementer` agent.

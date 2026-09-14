---
name: impact-analysis
description: >-
  Map the blast radius before changing code — who depends on the thing you're
  about to touch, what breaks if its behavior or signature changes, and whether
  there are cycles or orphans. Use before any non-trivial refactor, interface
  change, rename, or deletion; when the user asks "what breaks if I change
  this?", "what depends on X?", "is this safe to remove?", "what's the impact
  of this change?"; or when a small change keeps breaking distant code. Turns a
  scary refactor into a bounded, evidence-backed one.
---

# Impact analysis

A change is only as safe as your knowledge of what depends on it. The AI's
failure mode is to edit a function and discover the fallout later, in distant
broken code. This skill front-loads that discovery: before you touch something,
trace *who depends on it* and decide deliberately. It's the missing input to a
safe [`improve-codebase-architecture`](../improve-codebase-architecture/SKILL.md)
refactor and a sharper [`architecture-boundaries`](../architecture-boundaries/SKILL.md).

## The four questions

Before changing an entity (function, module, type, endpoint, table), answer:

1. **Recipients — who calls/imports this?** The direct dependents. Changing the
   behavior or signature affects all of them. (Reverse dependency: "find
   references", not "find definition".)
2. **Transitive blast radius — who depends on the recipients?** Follow the
   reverse edges outward to the depth that matters. A leaf change is cheap; a
   change near the root of the graph is expensive — know which you're making.
3. **Cycles — is this part of a dependency cycle?** Cycles mean a change can loop
   back on itself; they're a refactoring hazard and a design smell to surface.
4. **Orphans — does anything still use this at all?** If nothing depends on it,
   the safest change is often *deletion* (cut the dead code rather than maintain it).

## How to trace it (use what you have)

devmode is tool-agnostic — use the cheapest reliable source of reverse edges:

- **Language tooling first.** LSP "find all references", IDE call hierarchy, or
  the type system — these are precise and cheap. Prefer them.
- **Search as a fallback.** `grep`/ripgrep for the symbol, the import, the
  endpoint string, the event name. Watch for dynamic dispatch and string-based
  wiring (reflection, DI containers, config) that static search misses — note
  them explicitly as uncertainty.
- **Git history** for "what changed with this before" (co-change is a dependency
  signal even when the code doesn't import directly).
- **A persistent index (optional)** for large/brownfield codebases: maintaining a
  reverse-dependency graph with a *why* on each edge (DSP-style) makes this
  instant and survives across sessions. Worth it when the codebase is too big to
  re-scan each time; overkill for small ones.

## Use the result to decide

- **Small radius, no cycles** → refactor freely (test-first).
- **Large radius** → keep the interface stable and change behavior behind it (a
  gray-box-friendly move, see
  [`design-interface-delegate-implementation`](../design-interface-delegate-implementation/SKILL.md)),
  or stage the change with a deprecation path.
- **Cycle found** → break it before refactoring, not during.
- **Orphan** → delete it; entropy removed is the best refactor.
- **Pin the radius with tests** at the affected boundaries *before* you change,
  so the blast radius is verified, not assumed
  ([`testing-principles`](../testing-principles/SKILL.md),
  [`tdd`](../tdd/SKILL.md)).

## Renames: the radius includes tests, and search hits substrings

A rename is the most under-estimated change. Its blast radius includes the
**test files and imports** (not just `src/`), and a naive find-replace will hit
**substrings** — replacing `_period(` silently mangles `within_period(` too. So:
scope the rename precisely (whole-symbol, not substring), include tests in the
sweep, and **re-run the full suite right after** — a rename isn't done until green
(this is exactly what [`verification-before-completion`](../verification-before-completion/SKILL.md)
catches: a broken import that "looks" like a clean rename).

## Reusing a state value inherits every behavior keyed on it

The four questions trace an *entity* you're changing. But there's a blast radius
with no symbol to "find references" on: **repurposing an existing state value** —
a status, flag, enum case, or column value — to mean something new (`trialing` as
a migration bridge, `pending` as "awaiting review", `archived` as "soft-deleted").
You aren't changing the type's signature, so entity-tracing never fires — yet the
value you write is read all over the system. Reusing it silently *inherits*
everything already keyed on it: schedulers, event handlers, access gates,
grant/cleanup sweeps, UI branches. The one behavior you wanted rides in with all
the others.

Before adopting the reuse, **grep every consumer of the value** (the value, not
just the type) across every layer and list what each one does with it — the
inherited behavior set is part of the decision, not a surprise. Then **verify by
diffing the whole system's response** — side-effect records, related rows, any
ledger/audit trail — before and after, not just the fields you predicted would
change. The tell that you skipped this: you validated the one behavior you wanted
and discovered the rest one bug at a time.

## Record the "why" on dependencies

When a dependency is non-obvious (this module calls that one *because*…), capture
the reason next to the [`module map`](../ubiquitous-language/SKILL.md), or in the
decision log. A reverse edge with a recorded *why* is what lets a future session
(or the AI after compaction) judge whether the dependency is essential or
accidental.

## Red flags

- Renaming/deleting before tracing references ("nothing uses this" — verified?).
- Changing a signature near the graph root without checking the blast radius.
- Trusting `grep` alone where dynamic dispatch or DI hides the real callers.

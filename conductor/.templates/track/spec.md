# Spec: <track name>

> Conductor's track spec, written with devmode's `write-prd` rigor. Produce this
> **only after** reaching a shared design concept with `grill-me` — do not let
> `/conductor-newtrack` rush to an asset before alignment. Write it in the
> project's ubiquitous language (`UBIQUITOUS_LANGUAGE.md`).

## Problem & purpose
<What problem this solves, for whom, and why now. One short paragraph.>

## Design concept
<The agreed theory of the change in 3–5 sentences — the shared understanding
reached while grilling, stated so a reader new to the conversation gets it.>

## Scope
- **In scope:** <...>
- **Out of scope:** <... — be explicit; boundaries prevent drift>

## Behavior
- **Happy path:** <...>
- **Edge cases:** <empty input, boundaries, limits, concurrency>
- **Errors:** <what the user/system sees when things go wrong>

## Module & interface changes  ← the heart of the spec
> For each affected module. This is where you invest in the design of the system
> and what makes `plan.md` tasks fall out cleanly. Keep the project's module map
> (in `UBIQUITOUS_LANGUAGE.md`) in sync with this.

### <Module name> — <new | modified> — <critical? yes/no>
- **Purpose of the change:** <...>
- **Interface (the contract tests verify):**
  - `<real signature / type / endpoint / event>`
- **Core vs. shell:** <what pure decision logic lives in the functional core;
  what I/O lives in the imperative shell>
- **Boundary:** <what crosses in/out; what stays hidden inside>
- **Delegation:** <gray box (delegate implementation, verify via interface tests)
  | full review (critical: money/auth/security/irreversible)>
- **Implementation notes (constraints only):** <invariants, performance, data shape>

## Data
<Shapes, sources of truth, migrations, state transitions.>

## Testing strategy
<Where the test boundaries sit (which interfaces are verified from the outside),
what to mock (only what you don't own), what "done and correct" means. No blanket
coverage target — cover contract, edges, invariants, regressions.>

## Acceptance criteria
- [ ] <observable, verifiable outcome>
- [ ] <...>

## Open questions / risks
- <Anything unresolved, and what would resolve it. Decisions that are the user's.>

---
<!-- Beads linkage (filled by /conductor-newtrack when Beads is enabled) -->
<!-- beads_epic: bd-xxxx -->

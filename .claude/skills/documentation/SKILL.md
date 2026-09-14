---
name: documentation
description: >-
  Write documentation that earns its keep — ADRs for decisions, READMEs that get
  someone running, comments that explain *why* not *what*, and docs that live
  next to the code. Use when documenting a decision, a module, an API, or a
  project; when the user says "document this", "write an ADR", "README",
  "add comments", "explain why". Good docs capture the rationale that the code
  can't — and stale docs are worse than none, so write the kind that stays true.
---

# Documentation & ADRs

Code shows *what* and *how*; it cannot show *why* — and "why" is exactly what the
next person (or the AI after compaction) most needs and most often lacks. The job
of documentation is to capture the durable rationale and the fast on-ramp, not to
narrate the obvious. Stale docs mislead, so write the kinds that stay true.

## Comments: explain *why*, not *what*

- **Bad:** `// increment i` — restates the code.
- **Good:** `// retry 3x: the upstream rate-limiter returns 429 in bursts` —
  captures a reason the code can't.
- Prefer making code self-explaining (good names in the
  [`ubiquitous language`](../ubiquitous-language/SKILL.md)) over commenting it.
  Comment the surprising, the non-obvious constraint, the deliberate trade-off.
- Delete comments that lie or have gone stale — a wrong comment is worse than none.

## ADRs: record the decisions

An **Architecture Decision Record** captures a non-obvious choice so it isn't
re-litigated or silently undone. One short file per decision:

```
# ADR-NNN: <title>
Status: accepted | superseded by ADR-MMM
Context: the forces / what was at stake
Decision: what we chose
Why: why this over the alternatives
Alternatives considered: options rejected + reason
Consequences: what this makes easy/hard later
```

Write an ADR when a choice is hard to reverse, surprising, or the subject of a
trade-off (often the ones surfaced by [`design-critique`](../design-critique/SKILL.md)).
This is the same `decisions.md` habit the Conductor integration captures during
implementation — *status is recoverable from git; rationale is not, unless you
write it down.*

**Supersede, don't mutate.** When a later phase or an ops signal invalidates a
past decision (a loop-back to Specify), write a *new* ADR that marks the old one
`superseded by ADR-MMM` and explains what changed — never silently edit the
original. A decision you deliberately *deferred* ("authz: out of scope", a 🟡)
is **tracked, not accepted forever**: when the risk is promoted to in-scope, the
superseding ADR is the receipt that the workflow looped back on purpose, with the
history intact.

## READMEs & module docs

- **README's job:** get a newcomer from clone to running in minutes — what it is,
  how to set up, how to run/test, where to look next. Lead with the on-ramp.
- **Module/API docs:** the public contract and how to use it — point at
  [`api-design`](../api-design/SKILL.md) for the contract itself.
- **Keep docs next to the code** and update them *in the same change* — docs in a
  separate, forgotten wiki rot fastest.

## Principles

- **Document the why and the non-obvious; let the code show the what.**
- **Update docs in the same commit as the change** they describe.
- **Anchor code references on the durable identifier** — when a doc/ADR/handoff/
  glossary points into code, cite the symbol name plus a short quoted excerpt of
  the load-bearing lines, not a bare `file:line`. Line numbers rot the moment
  unrelated code shifts above them; the symbol and the lines that matter don't —
  and a drifted excerpt is *visibly* wrong (fixable), while a stale line number
  silently points somewhere plausible-but-wrong.
- **Less, but true** — a small set of accurate docs beats a large stale set.
- **Right altitude** — enough to act on, not a transcription of the code.

## Red flags

- Comments that restate the code or have drifted from it.
- A big decision made with no ADR ("why is it like this?" → nobody knows).
- A README that doesn't actually get you running.
- Docs updated "later" (i.e. never), in a separate place from the code.

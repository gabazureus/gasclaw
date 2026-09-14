---
name: ubiquitous-language
description: >-
  Build and maintain a shared glossary of domain terms — a ubiquitous language
  (DDD) — used identically by the user, the AI, and the code. Use this when
  starting work on an unfamiliar codebase, when the AI's output feels too
  verbose or keeps drifting from what was planned, when onboarding to a new
  domain, when terms in conversation don't match terms in the code, or when the
  user mentions "domain language", "glossary", "ubiquitous language", "shared
  terminology", or asks why implementations keep missing the intent. Keep the
  generated glossary open during planning and reference its terms everywhere.
---

# Ubiquitous language

Verbose, drifting AI output usually isn't a reasoning problem — it's a language
problem. When you and the model don't share precise terms for the domain, the
model pads its thinking with circumlocution and translates intent through fuzzy
synonyms, so the implementation drifts from the plan. This is the same gap a
developer hits with a domain expert in microchips or insurance or logistics:
without shared vocabulary, every exchange is a lossy translation.

Domain-Driven Design's answer is a **ubiquitous language**: a single set of
terms, defined once, used everywhere — in conversation with the user, in the
AI's reasoning, and in the code itself. When the language is shared, the model
thinks more tightly and the code it produces lines up with what was planned.

## What to produce

Create or update a `UBIQUITOUS_LANGUAGE.md` (or the project's equivalent) at
the repo root, starting from [`assets/glossary-template.md`](assets/glossary-template.md).
It is a living glossary, organized by sub-domain, of the terms that matter. Use
markdown tables so it stays scannable:

```markdown
## <Sub-domain name>

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| Subscription | A customer's ongoing paid access to a plan | `Subscription` aggregate | Always has exactly one active `Plan`; cancelling sets `endsAt`, never deletes |
| Seat | One assignable license within a subscription | `Seat` entity | A seat is `assigned` or `free`; never both |
| Dunning | The retry process after a failed payment | `DunningRun` | Max 4 attempts over 14 days |
```

The `In code as` column is what makes the language *ubiquitous* — it ties each
domain word to the concrete type, function, or module that represents it, so
the term means the same thing in a meeting and in a file.

## How to build it

1. **Scan the codebase first.** Read module names, type names, key function
   names, database tables, and existing docs. The vocabulary already in use is
   the starting point — capture it before inventing anything.
2. **Extract the real terms.** Pull out the nouns and verbs that carry domain
   meaning. Skip generic plumbing (`Controller`, `Service`, `Helper`) unless it
   carries domain-specific meaning in this project.
3. **Define each precisely.** A good definition names the concept, its
   boundaries, and any invariant that's always true of it. Ambiguity here is the
   bug you're trying to kill.
4. **Resolve synonyms and conflicts.** If the code says `User` in one place and
   `Account` in another for the same thing, flag it and pick one. Divergent
   terms for one concept are a smell worth surfacing to the user.
5. **Note relationships.** Where one term is defined in relation to another
   (a Seat belongs to a Subscription), say so — that's the domain model leaking
   through, which is exactly what you want.

6. **Optionally, stress-test the slippery boundaries in a short dialogue.** A flat
   table defines each term in isolation, so it hides the ambiguities that live
   *between* related terms — the exact bug you're trying to kill. When two terms
   feel slippery against each other, write a 3–5 line exchange between a developer
   and a domain expert that uses the terms precisely and forces the boundary into
   the open. Keep it in the glossary next to the terms it clarifies:

   > **Dev:** When a customer places an Order, do we create the Invoice then?
   > **Expert:** No — an Invoice is only generated once a Shipment is confirmed. A
   > single Order can produce several Invoices if items ship separately.
   > **Dev:** So a Shipment cancelled before dispatch has no Invoice?
   > **Expert:** Right — the Invoice is tied to the Shipment, not the Order.

   Reach for it only where a definition alone hasn't settled the argument.

## Don't let a primitive delete the domain concept

Reusing a primitive one layer down — a token, a link, a session, a cache key — is
a virtue right up until it erases the thing the feature is actually about. The
trap is fusing a **property the feature requires** (email-binding, single-use,
consent) with an **implementation that happens to carry it today** (an auth link,
a signed URL, a session). Once fused, the reuse looks automatically correct, and
you borrow an *ephemeral* artifact to stand in for a *durable* domain record.

Separate the two: **name the property, then ask whether the primitive *models* it
or merely *coincides* with it today.** An auth link is not an invitation; a cache
key is not a job; a session is not an audit trail.

The tell is **lifecycle**. When the concept must be revoked, resent, expired on
its own clock, run several at once, or record who accepted and when, that
lifecycle *is* a domain term — it belongs in the glossary as a first-class entry
with its own status invariant (e.g. `requested → active / declined`), not smuggled
into a primitive that can't hold those states. Adding a well-chosen, durable term
is the *deep* move here — the counterweight to reuse
([`minimal-code`](../minimal-code/SKILL.md)), not a contradiction of it.

## Map the modules too — they are part of the language

The ubiquitous language is not only domain nouns and verbs. Whenever you plan or
touch code, you and the AI both need to know the **module map** — the deep
modules in the system and their public interfaces — and know it *well*. A module
boundary is a domain concept: it has a name, a purpose, and a contract, and if
that name isn't shared, planning drifts exactly the way vocabulary drifts.

So the glossary should also carry an architecture section listing each deep
module, what it's responsible for, and its public interface. This is what makes
[`write-prd`](../write-prd/SKILL.md) able to be specific about *which modules and
interfaces change*, and what lets you reason about the system as a handful of
boxes rather than thousands of lines (see
[`design-interface-delegate-implementation`](../design-interface-delegate-implementation/SKILL.md)).
Keep the map current as modules are consolidated
([`improve-codebase-architecture`](../improve-codebase-architecture/SKILL.md)) —
a stale map misleads planning more than no map at all. For a *non-obvious*
dependency, record the **why** next to the edge (module A uses B *because…*) — a
dependency with a recorded reason is what lets a future session (or the AI after
compaction) judge whether it's essential or accidental, and it powers
[`impact-analysis`](../impact-analysis/SKILL.md).

| Module | Responsibility | Public interface | Depends on |
|--------|----------------|------------------|-----------|
| `Billing` | Decides and performs charges for renewals | `decideRenewal(sub, time) -> Decision`, `BillingGateway.charge(...)` | `Subscriptions`, payment provider |
| `Subscriptions` | Owns subscription + seat state and invariants | `load(id)`, `assignSeat(...)`, `cancel(...)` | datastore |

## How to use it

- **Keep it open during planning and grilling.** Reference its exact terms when
  you talk to the user and when you write the PRD. Consistency compounds.
- **Use the terms in code and tests.** Type names, test descriptions, and
  variable names should echo the glossary. This is what keeps the language from
  drifting back into vagueness.
- **Update it as the domain evolves.** When a new concept appears or a
  definition sharpens, edit the glossary in the same change. A stale glossary is
  worse than none.
- **Feed it to the AI explicitly.** When delegating implementation, point the
  agent at the glossary so its reasoning starts from your vocabulary, not its
  own paraphrase.

This skill pairs naturally with [`grill-me`](../grill-me/SKILL.md) (the grill
surfaces terms worth defining) and [`write-prd`](../write-prd/SKILL.md) (the
PRD should be written in this language).

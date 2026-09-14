---
name: api-design
description: >-
  Design stable, hard-to-misuse APIs and interfaces — contracts, error
  semantics, versioning, validation at the boundary, and types that make illegal
  states unrepresentable. Use when designing a REST/GraphQL/RPC endpoint, a
  library's public surface, a module contract, or a data schema; when the user
  says "design the API", "the contract", "request/response shape", "versioning",
  "breaking change". Complements design-interface-delegate-implementation
  (module interfaces) with the HTTP/contract specifics.
---

# API & interface design

An API is a promise. Once something consumes it, you own that promise — and
**Hyrum's Law** guarantees that *every observable behavior* of your API will be
depended on by someone, whether you documented it or not. So design the surface
deliberately and keep it small; the inside you can change, the contract you
cannot (cheaply). This is the same instinct as
[`design-interface-delegate-implementation`](../design-interface-delegate-implementation/SKILL.md),
made concrete for wire/library contracts.

## Principles

- **Contract-first.** Decide the request/response/error shapes (and write them
  down — OpenAPI/GraphQL schema/types) before implementing. The contract is the
  design; the handler is the delegable implementation.
- **Small, hard-to-misuse surface.** Few endpoints/functions, each doing a clear
  thing. Make the easy path the correct path; make illegal states impossible to
  express (see types below).
- **Design for the consumer's selection model — agents included.** When an LLM
  agent drives the surface, the *name* is the interface: it often picks before any
  schema/description loads, and reliably chooses one well-named entry-with-flags
  over several specialized variants — reconstructing the missing ones by hammering
  the general path instead of finding the precise one. Collapse near-duplicate
  variants into a single entry parameterized by a flag (direction / depth / mode),
  and make every name state what it does.
- **Consistency.** Same naming, pagination, filtering, error envelope, and
  date/ID formats across the whole API. Inconsistency is a per-call tax on every
  consumer.
- **Explicit error semantics.** Define the error shape once (code + message +
  machine-readable detail), use correct status codes, and never leak internals
  or secrets in errors (see [`security-hardening`](../security-hardening/SKILL.md)).
- **Validate at the boundary; trust inside.** All external input is untrusted —
  validate/parse it at the edge into typed domain values, so internal code can
  assume validity (the imperative shell validates; the functional core trusts —
  [`functional-core-imperative-shell`](../functional-core-imperative-shell/SKILL.md)).

## Make illegal states unrepresentable

Push correctness into types so misuse fails at compile time, not runtime:

- **Branded/opaque IDs** — a `UserId` is not interchangeable with an `OrderId`
  even though both wrap a string. Stops whole classes of "passed the wrong id."
- **Parse, don't validate** — turn raw input into a typed value once at the
  boundary; carry the typed value, not the raw string, everywhere after.
- **Sum types for states** — model "one of N" (pending | active | cancelled) as
  a tagged union, not a bag of optional booleans that allow impossible combos.

## Versioning & change

- **One-Version Rule (where you can):** prefer evolving a single version
  additively over a sprawl of versions. Additive changes (new optional field,
  new endpoint) are safe; removing/renaming/retyping is breaking.
- **Breaking changes get a deliberate path** — version the surface, deprecate
  with a window and migration notes (see [`migration`](../migration/SKILL.md)),
  never silently change a contract consumers rely on.
- **Default to backward-compatible.** New fields optional; tolerant readers,
  precise writers.

## Process

1. Name the consumers and what they need (grill if unclear).
2. Draft the contract (schema/types) — happy path + error shape + edge cases.
3. Pressure-test it ([`design-critique`](../design-critique/SKILL.md)): what's
   hard to misuse? what's the blast radius of a future change
   ([`impact-analysis`](../impact-analysis/SKILL.md))?
4. Pin it with tests at the contract boundary, then delegate the implementation.

## Red flags

- Designing the handler before the contract.
- Raw strings/ints for IDs and states (interchangeable, misusable).
- A different error shape per endpoint.
- A "small tweak" that changes an existing field's type/meaning (breaking).
- Validating external input deep inside instead of at the boundary.

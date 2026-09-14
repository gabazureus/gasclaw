---
name: testing-principles
description: >-
  Make the hard design decisions behind a test — how big a unit to test, what
  to mock, and which behaviors are worth asserting — so tests are stable,
  meaningful, and cheap to maintain. Use this whenever writing, reviewing, or
  fixing tests; when tests are flaky, slow, brittle, or over-mocked; when the
  user asks "what should I test here?", "is this a good test?", "how do I test
  this?", "why are these tests so brittle?", or when deciding test boundaries
  for a new module. Pairs with TDD (which sets the rhythm) and with the
  functional-core/imperative-shell skill (which makes code testable in the
  first place).
---

# Testing principles

Testing is hard, and it's hard for a specific reason: every test forces several
interdependent decisions, and getting any one of them wrong produces tests that
are flaky, brittle, slow, or simply meaningless. TDD gives you the *rhythm* of
red-green-refactor; this skill gives you the *judgment* for the decisions inside
each cycle. The two work together — and both get far easier when the code under
test has clean boundaries (see
[`functional-core-imperative-shell`](../functional-core-imperative-shell/SKILL.md)).

The north star: **test observable behavior at a stable boundary, not internal
implementation.** A good test fails only when behavior the user cares about
breaks. A bad test fails every time you refactor, training everyone to ignore
it.

## The three interdependent decisions

These decisions depend on each other — choosing a unit size constrains what you
must mock, which constrains which behaviors you can sanely assert. Decide them
together, not in isolation.

### 1. How big is the unit?

Test at the **deepest stable interface you can**, not at every internal
function. A deep module (lots of logic behind a simple interface) should be
tested *through that interface* — that's the boundary that won't churn. Testing
each private helper individually couples your tests to the implementation and
makes every refactor a test rewrite.

- Bigger units → fewer mocks, tests closer to real behavior, but slower and
  potentially flakier. Don't push the unit so large that failures become hard to
  localize or the test goes flaky.
- Smaller units → faster and more precise, but more mocking and more coupling to
  internals. Don't push so small that you're testing structure instead of
  behavior.
- Pick the size where the interface is **stable** (unlikely to change shape) and
  the behavior is **meaningful** (something a caller actually depends on).

### 2. What do you mock?

Mock at architectural seams, not inside your own logic. The reliable rule:
**mock what you don't own and can't make fast or deterministic** — the network,
the clock, the filesystem, third-party services, randomness. Don't mock your own
domain logic; if you find yourself doing that, the unit boundary is wrong or the
code needs the functional-core/imperative-shell split so the logic is pure.

- Every mock is an assumption about how a collaborator behaves. Mocks that
  drift from reality give you green tests over broken code — the worst outcome,
  because it destroys trust in the suite.
- Prefer real objects for things you own and that are fast. Prefer a single
  fake/stub at the boundary over deeply nested mock chains, which are a smell
  that you're testing too small a unit.
- For "don't own but need to integrate with", keep a thin layer of real
  integration tests at the boundary so your mocks can't silently lie.

### 3. Which behaviors do you assert?

Test behaviors a caller depends on, prioritized by risk:

- **The contract** — the documented happy-path behavior of the interface.
- **The edges** — empty, boundary, max, concurrent, and failure inputs. This is
  where real bugs live.
- **The invariants** — properties that must always hold (from the
  [`ubiquitous language`](../ubiquitous-language/SKILL.md): "a seat is assigned
  or free, never both").
- **Regressions** — every fixed bug gets a test that would have caught it.

Don't assert on internal call order, private state, or incidental details. Each
test should have one clear reason to fail; if you can't name what behavior a
test protects, delete it.

### Make edge coverage auditable — the edge probe

"Did you handle the edges?" is too easy to wave through. Turn it into an
**auditable probe**: enumerate the edge categories that apply and give each an
explicit verdict — never leave one silently unconsidered.

| Edge category | Ask |
|---|---|
| **Empty / none** | zero items, null, missing, default-constructed |
| **Boundary** | first/last, off-by-one, min/max, the `>=` vs `>` line |
| **Overflow / scale** | very large n, long input, precision/rounding limits |
| **Ordering / concurrency** | out-of-order, races, idempotency on retry |
| **Failure / adversarial** | I/O error, partial write, hostile input (see below) |

Mark each: **covered** (a test pins it) · **dismissed** (genuinely N/A — say why) ·
**backstop** (held by a type/constraint/guard, not a test) · **unresolved** (a
real gap — track it, don't bury it). An `unresolved` edge is a *known* risk, not a
silent one — the same ratchet as "every acceptance criterion has a passing test",
applied to edges. The categories are a starting checklist, not a straitjacket: add
the ones your domain needs; the discipline is the per-edge *verdict*, not the list.

## Properties of a test worth keeping

- **Behavioral** — asserts *what*, not *how*. Survives refactors.
- **Deterministic** — same result every run. No real clocks, no real network,
  no order dependence between tests. Flaky tests get muted, and muted tests
  protect nothing.
- **Fast** — the suite's speed is your feedback rate, which is your speed limit
  (see [`tdd`](../tdd/SKILL.md)). Push slow dependencies behind seams.
- **Readable as a spec** — the test name and body state the behavior in domain
  language. A new reader should learn what the code does by reading its tests.
- **Independent** — no shared mutable state; any test can run alone or in any
  order.

## Common failure modes and the fix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tests break on every refactor | Testing implementation, not behavior; unit too small | Raise the test to a stable interface; assert outcomes |
| Green tests, broken production | Over-mocking; mocks diverged from reality | Mock only at seams; add thin real integration tests |
| Flaky / intermittent failures | Real time, network, randomness, or shared state | Inject a clock/seed; fake the boundary; isolate state |
| Slow suite | Too many large/integration tests, or I/O in unit tests | Push I/O to the shell; keep a pure, fast core to test |
| "What do I even assert?" | Logic tangled with I/O | Apply functional-core/imperative-shell, then test the core directly |

## Anti-patterns to refuse

Four test smells are common enough to name and refuse outright:

1. **Testing the mock, not the code.** Asserting that a mocked element exists
   (`getByTestId('sidebar-mock')`) proves the mock is present, not that anything
   works. Before asserting on any mocked thing, ask: *"am I testing real
   behavior or just mock existence?"* If the latter, delete the assertion or
   stop mocking that thing and test the real behavior.
2. **Test-only methods in production code.** A `destroy()`/`reset()` that only
   tests call pollutes the production interface and lies about the real API.
   Keep test scaffolding in the tests (fixtures, fakes), not in production
   classes.
3. **Mocking without understanding the dependency.** A mock encodes an
   assumption about how a collaborator behaves; if you don't understand the
   collaborator, the mock will drift from reality and give you green tests over
   broken code. Understand it, or use the real thing.
4. **Tautological tests — the expected value comes from the code itself.** When
   the assertion recomputes the expected value the same way the code does
   (`expect(add(a, b)).toBe(a + b)`, a snapshot baselined from whatever the code
   just produced, a constant asserted equal to itself), the test passes *by
   construction* — it can never disagree with the code, so it survives every
   regression and proves nothing. The expected value must come from an
   **independent source of truth**: a known-good literal, a worked example
   computed by hand, or the spec. Before asserting, ask: *"where did this expected
   value come from — the spec, or the code's own logic?"*

## Trace acceptance criteria to tests

When a spec/PRD lists acceptance criteria, make each one **traceable to a test**.
Tag the test (or its name) with the criterion it covers, so coverage is judged by
*behaviors a caller depends on*, not by a line-percentage. A simple convention —
referencing the AC id in the test name or a comment — lets you (or a check) see
which criteria are unproven. This is the right kind of "coverage": every promised
behavior has a test that would fail if the promise broke. Pairs with the
verification gate in [`feedback-loops`](../feedback-loops/SKILL.md).

## Write tests a plausible regression would fail

A test only protects behavior if a realistic mistake would *break* it. Sanity
check each test: "if someone replaced this implementation with a naive/wrong
version, would this test fail?" If a green test survives the bug you're worried
about, it isn't pinning what you care about. (A boundary like `now >= exp` is
only protected by a test that exercises `now == exp` exactly.)

## "Not observed" is not "absent"

Don't conclude a behavior is fine just because you didn't see it fail. *No test
covering a case* means **unknown**, not **safe** — and an absent log line or
metric means you didn't look, not that nothing happened. Say "not observed" (and
add the test) rather than silently treating an untested path as passing. The
`test-coverage-analyzer` exists precisely to surface the *unknowns* a green suite
hides. This is the testing face of the verification rule: evidence, not absence
of contrary evidence.

## Pin invariants you can't directly observe

Some invariants aren't visible to a unit test — timing/constant-time behavior,
concurrency, randomness, "never logs the secret". A `==` swapped for a
constant-time compare produces identical functional results, so no assertion can
catch it directly. Don't fake it (a bogus "constant-time" assertion) and don't
skip it. Instead, pin it three ways:

1. **An adjacent observable proxy** — test the closest thing you *can* observe
   (e.g. "the secret never appears in the output/Verdict/error"), so a whole
   class of regressions still fails a test.
2. **A recorded decision (ADR)** — capture the invariant and its rationale so it
   isn't silently undone later.
3. **A review lane** — the `security-scanner` (or the relevant reviewer) confirms
   the invariant holds in the code, since the test can't.

## Test security-relevant code under *adversarial* input

Normal edges (empty, boundary, failure) are not enough for a control (a rate
limiter, auth check, validator, anything enforcing a limit or a permission). Its
invariant must hold under **hostile or corrupt** input too: negative/zero/huge
values, a `cost` of `0` or `-1`, a stored value that's already out of range, a
clock that runs backwards. These are exactly the inputs a happy-path test suite
misses and an attacker reaches for — in practice the review panel finds them when
the author's tests don't. For invariant-bearing code, add a test class that
*attacks* the invariant (assert it raises, clamps, or rejects), not just one that
exercises the nominal path. Pairs with
[`security-hardening`](../security-hardening/SKILL.md).

## The architecture connection

Most testing pain is really a design problem wearing a testing costume. When
logic is entangled with I/O, you're forced into heavy mocking, which makes tests
brittle and slow. The fix is usually structural: separate a **functional core**
(pure, deterministic logic you test directly with no mocks) from an
**imperative shell** (thin I/O you cover with a few integration tests). If
writing a test is painful, treat that as the design telling you to refactor —
reach for
[`functional-core-imperative-shell`](../functional-core-imperative-shell/SKILL.md)
or [`improve-codebase-architecture`](../improve-codebase-architecture/SKILL.md)
before adding more mocks.

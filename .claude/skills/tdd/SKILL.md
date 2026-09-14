---
name: tdd
description: >-
  Implement features test-first using red-green-refactor, forcing small,
  deliberate steps that keep the AI inside its feedback loop. Use this whenever
  writing or changing application logic — especially when the user says "use
  TDD", "test-driven", "write tests first", "implement this carefully", or when
  a change is non-trivial enough that writing a big batch of untested code would
  risk drift and bugs. Default to this for implementation work; the rate of
  feedback is the speed limit, and TDD keeps that rate high.
---

# Test-driven development

The rate of feedback is your speed limit. The classic AI failure mode is
**outrunning your headlights**: the model emits a large pile of code and only
*then* thinks to type-check or test it — by which point a small early mistake
has propagated everywhere. TDD fixes this structurally. It forces small,
deliberate steps where every step ends in a passing test, so feedback arrives
constantly and mistakes stay tiny.

TDD also does something subtler: writing the test first forces you to design
the interface from the *caller's* point of view before you write the
implementation. That pressure produces simpler, more usable interfaces — which
is exactly the design investment this whole process is about.

## The loop: red → green → refactor

Do this one behavior at a time. Never skip the refactor step — it's where the
design investment happens.

1. **Red — write one failing test.** Pick the smallest next behavior. Write a
   test that asserts it and watch it fail *for the right reason* (the behavior
   is missing, not a typo). A test you never saw fail is a test you don't trust.
2. **Green — make it pass simply.** Write the least code that turns the test
   green. Resist building ahead of the test; the goal is a passing bar, not a
   finished feature.
3. **Refactor — improve the design.** With the test green as a safety net,
   clean up: remove duplication, sharpen names (use the
   [`ubiquitous language`](../ubiquitous-language/SKILL.md)), consolidate toward
   deep modules. Run the tests again. This is where you
   *invest in the design of the system*.

Repeat. Each cycle should be small enough that if the test fails unexpectedly,
the cause is obvious because you only changed one thing.

## Why small steps matter with AI

The AI's instinct is to do too much at once — generate a whole feature, then
verify. That maximizes the blast radius of any error and makes failures hard to
localize. By gating every increment behind a test, you cap how far a mistake can
travel and you give the model a crisp, frequent signal. Slower-looking steps
produce faster real progress because you stop debugging giant tangles.

## Stack the feedback loops

TDD is one feedback loop; use it alongside the others so the AI can self-correct
without you. Setting these up and keeping them fast is its own discipline — see
[`feedback-loops`](../feedback-loops/SKILL.md):

- **Static types** (e.g. TypeScript) — catch whole classes of errors before a
  test even runs. If you're not using them where available, you're throwing away
  free feedback.
- **The compiler / linter** — run it constantly, not at the end.
- **A real browser or runtime** for UI and integration — give the agent eyes on
  the actual behavior, not just unit tests.
- **Fast test runs** — keep the suite quick so the loop stays tight. A slow
  suite lowers your speed limit.

## How this connects to the rest

- *What* to test, how big a unit, and what to mock are design decisions — see
  [`testing-principles`](../testing-principles/SKILL.md). TDD is the rhythm;
  testing-principles is the judgment.
- TDD is dramatically easier in a codebase with simple, stable boundaries.
  A [`functional core / imperative shell`](../functional-core-imperative-shell/SKILL.md)
  gives you pure logic that tests without mocks. If tests are painful to write,
  treat it as a design signal and consider
  [`improve-codebase-architecture`](../improve-codebase-architecture/SKILL.md)
  before pushing harder.
- Work from an approved [`PRD`](../write-prd/SKILL.md) when one exists — its
  testing-strategy section tells you where the boundaries are.

## Working rules

- One failing test at a time. See it fail before you make it pass.
- Don't write production code with no failing test demanding it.
- Keep the bar green between steps; never leave the suite red to "fix later".
- Refactor only on green, and treat it as mandatory, not optional polish.
- When a test fails for a reason you don't understand, switch to
  [`systematic-debugging`](../systematic-debugging/SKILL.md) (find the root cause)
  rather than guessing — and before claiming green, apply
  [`verification-before-completion`](../verification-before-completion/SKILL.md).

---
name: feedback-loops
description: >-
  Set up and actively exploit the full stack of feedback loops an AI can use to
  self-correct — static types, the compiler/linter, fast automated tests, and a
  real browser or runtime — so the model catches its own mistakes instead of
  drifting. Use this at the start of any implementation work, when setting up a
  project or repo for AI-assisted development, when the AI keeps shipping code
  that "looks right but doesn't work", when there's no type checking or the
  frontend has no browser access, or when the user mentions "feedback loops",
  "set up types", "give it browser access", "why does it keep breaking things".
  The rate of feedback is the speed limit — widen it.
---

# Feedback loops

When AI builds the right thing and it still doesn't work, the cause is almost
always missing or unused feedback. The model writes code, can't see the
consequences, and barrels on. The fix is to surround it with loops that turn
mistakes into immediate, legible signals — and then to make sure it actually
*uses* them, because by default it doesn't: the LLM tends to generate a large
batch of code and only afterward think "maybe I should type-check that." That's
outrunning your headlights. The rate of feedback is your speed limit; this skill
widens the limit and keeps the model inside it.

This is the *infrastructure* skill that makes [`tdd`](../tdd/SKILL.md) and
[`testing-principles`](../testing-principles/SKILL.md) effective. TDD is one loop
among several; here you set up and stack all of them.

## The loops, from fastest to slowest

Stack them so the cheapest, fastest signal fires first. Each one catches a class
of error the others miss.

1. **Static types.** The fastest possible feedback — errors caught before
   anything runs. If a typed option exists (TypeScript, mypy, typed Python,
   Sorbet, etc.) and you're not using it, you're throwing away free correction.
   Prefer precise types that make illegal states unrepresentable; the more the
   type system knows, the more the AI gets told "no" instantly.
2. **Compiler / linter.** Run on every change, not at the end. Treat warnings as
   signal. A clean compile is a loop the model can close by itself.
3. **Fast automated tests.** The behavioral safety net. Speed matters as much as
   coverage — a slow suite lowers your speed limit, so keep unit tests pure and
   quick (push I/O behind a
   [`functional core / imperative shell`](../functional-core-imperative-shell/SKILL.md)
   seam). Drive new behavior test-first via [`tdd`](../tdd/SKILL.md).
4. **A real browser or runtime.** For anything with a UI, the AI *must* be able
   to look at the actual result — open the page, click, read the console and
   network. Unit tests don't tell you the button is invisible. For services,
   give it a way to hit the running endpoint and read the response. Without eyes
   on real behavior, the model is guessing.

## Setting them up

- **Make them exist.** No type checking? Add it. Frontend with no browser
  access for the agent? Wire it up — this is non-negotiable for UI work. No fast
  test command? Create one. The loops can't help if they aren't there.
- **Make them fast.** Each loop's latency is felt on every iteration. A 2-second
  type-check and a 5-second test run keep the model moving; a 5-minute suite
  makes it skip the loop. Optimize for tight cycles.
- **Make them legible.** Errors should point at the cause. Clear type errors,
  focused test names, readable assertion failures — the model acts on what it
  can understand.
- **Make them automatic where possible.** Watch mode, pre-commit checks, and CI
  mean the loop fires without anyone remembering to run it.

## Making the AI actually use them

Setting up loops isn't enough — the failure mode is the model not running them
often enough. Counter it:

- **Run after every small step, not at the end.** Pair this with TDD's
  one-behavior-at-a-time rhythm so the loop fires constantly and any failure is
  trivial to localize.
- **Don't accept a large untested batch.** If a lot of code appeared without the
  loops being run, that's the headlights problem — stop and close the loops
  before going further.
- **Let a failing signal halt forward motion.** A red test, a type error, or a
  broken page is a stop sign, not a footnote to fix later.
- **Feed results back in explicitly.** When delegating, tell the agent which
  commands to run and to paste/observe the output before continuing — verifying
  a gray box from the outside (see
  [`design-interface-delegate-implementation`](../design-interface-delegate-implementation/SKILL.md))
  depends on these loops being live.

## A verification gate ladder

When you want to *prove* a change is good (not just iterate), run the loops as an
ordered ladder of machine-verifiable gates — cheapest first, stop at the first
failure:

| Level | Gate | Passes when |
|-------|------|-------------|
| L0 | Build / compile | exit 0 |
| L1 | Types | type-checker: 0 errors |
| L2 | Lint / format | linter: 0 errors |
| L3 | Unit tests | suite: 0 failures |
| L4 | Acceptance-criteria coverage | every AC has a passing test (see [`testing-principles`](../testing-principles/SKILL.md)) |
| L5 | Integration / runtime / browser-a11y | the real behavior verified, deterministically |

The point of the ladder is **objective judgment**: each level is decided by an
exit code or a count, never by an LLM judging an LLM. Reserve subjective review
(the `complexity-reviewer`) for *design* quality, not for "does it pass".

**Don't corrupt the signal you're reading.** A gate is only as trustworthy as the
exit code and output it inspects — so never pre-pipe an expensive build or test
through `head`/`tail` (or any truncating filter) to "keep it short". `head` can
close the pipe and kill the job early; `tail` throws away the earliest failure;
and either way the pipeline's exit status becomes the *filter's*, not the job's —
so a red run can read green. Run the job once, capture its true exit status and
full output, then derive a short failure summary from the saved output. This
applies equally when a CLI proxy or wrapper sits in front of the command.

**Decision coverage — the same ratchet for decisions.** Just as every acceptance
criterion needs a passing test (L4), every **decision** — an ADR, a resolved
trade-off — needs to actually *land*: referenced by at least one plan item or test
before a phase counts as planned/done. A decision recorded and then silently
ignored is a gap nothing else catches; check the decisions against the plan the
same mechanical way you check ACs against tests (grep the ADRs, confirm each is
referenced). It's a coverage check, not a taste call.

## The ratchet — agents can't grade their own homework

A subtle failure mode: an agent under pressure adds a trivial passing test and
declares the suite green. Prevent it with a **ratchet** — for the health gate,
count the tests that existed *before* this change as the bar that must stay
green, separately from new tests. New behavior still gets new tests (via
[`tdd`](../tdd/SKILL.md)), but a fresh trivial test can't paper over a regression
in existing behavior. The code is the source of truth; if a test and the spec
disagree, investigate rather than "fixing" the test to pass.

## Gate vocabulary

When you wire gates into a workflow, name what kind each is — it clarifies
recovery:

- **Pre-flight** — checks preconditions before starting; blocks entry, no partial
  work. (Recovery: fix the precondition, retry.)
- **Revision** — evaluates output and loops back with specific feedback, bounded
  by an iteration cap with stall detection. (Recovery: address feedback, re-check.)
- **Escalation** — surfaces an unresolvable issue to the human for a decision.
- **Abort** — stops to prevent damage/waste; preserves state, reports the reason.

The final gate before any "done" claim is
[`verification-before-completion`](../verification-before-completion/SKILL.md):
fresh evidence, not confidence.

## Signal you've got it right

The AI can take a task, make a change, and within seconds know whether it
helped — types, compile, tests, and (for UI) the rendered result all tell it the
truth automatically. Mistakes surface while they're still one line deep instead
of buried under a feature's worth of code.

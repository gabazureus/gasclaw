---
name: systematic-debugging
description: >-
  Find the root cause before proposing any fix, when facing a bug, test
  failure, build error, flaky test, performance problem, or any unexpected
  behavior. Use this the moment something doesn't work — especially under time
  pressure, when a "quick fix" looks obvious, or when a previous fix didn't
  stick — and when the user says "this is broken", "debug this", "the test
  fails", "why doesn't this work", "it crashes". Random fixes mask the real
  problem and create new bugs; this enforces root-cause-first discipline.
---

# Systematic debugging

Random fixes waste time and create new bugs. A quick patch on a symptom leaves
the real cause in place, where it resurfaces — often worse. Debugging is not
guessing-and-checking; it is investigation. This skill keeps you (and the AI,
which is strongly biased toward proposing a fix immediately) on the
root-cause-first path.

## The iron law

**No fix without a root-cause investigation first.** If you can't state *what*
is happening and *why*, you are not ready to change code. Proposing solutions
before tracing the cause is the failure mode this skill exists to prevent.

## The four phases — complete each before the next

### Phase 1 — Root-cause investigation
- **Read the error completely.** Stack traces, line numbers, codes — they often
  contain the answer. Don't skim past warnings.
- **Reproduce it with a red-capable loop.** Build one command you have *already
  run once* that goes RED on this bug's exact user-facing symptom (not merely
  "runs without erroring") and is deterministic and fast. Every time or
  intermittent? Can't reproduce → raise the reproduction rate (loop the trigger,
  add stress) or gather more data — don't guess. **No hypothesis until that red
  command exists.** (Loop mechanics live in
  [`feedback-loops`](../feedback-loops/SKILL.md).)
- **Minimise the repro.** Once it's red, shrink to the smallest scenario that
  still goes red — cut inputs, callers, config, and steps *one at a time*,
  re-running after each. Fewer moving parts shrink the hypothesis space, and the
  minimal repro becomes the regression test.
- **Check recent changes.** `git diff`, recent commits, new deps, config/env
  differences. What changed right before it broke?
- **Sweep for every site the symptom could come from — before you pick a
  subsystem.** Search the *whole* codebase for the symptom itself: the user's
  literal words, the error string, the observable behavior, across *every* layer.
  Enumerate all candidate sites first and rule on each, then narrow to one.
  Anchoring on the subsystem you happen to have been working in is the most common
  way a careful, well-grounded investigation lands on the wrong code — the volume
  of grounding you did *there* makes the wrong conclusion feel solid. Breadth
  first, then depth.
- **Instrument the boundaries** in multi-component systems. Prefer a debugger and
  one breakpoint over log-everything-and-grep; when you do log what enters and
  exits each component (API → service → DB; CI → build → sign), **tag every debug
  line with a unique prefix** (e.g. `[DEBUG-a4f2]`) so cleanup is a single grep.
  Run once to see *where* it breaks, then investigate that component — don't
  theorize blind. For performance problems logs mislead: **measure a baseline
  first** (timing/profiler), then bisect.
- **Trace the bad value backward.** Where does it originate? What passed it in?
  Keep going up the call stack to the source. Fix at the source, not the symptom.
- **A diagnostic's claim is a hypothesis, not a fact.** When a tool, log summary,
  or subagent that can't see the code names a file, a line, or "X is missing," treat
  it as evidence *pointing* somewhere — not a directive. Verify it against the real
  repo before acting; if the pointer is wrong (a hallucinated path), re-search by the
  *concept* (the error string, the symbol name), not its guess.

### Phase 2 — Pattern analysis
- **Find working examples** of similar code in the same codebase.
- **Compare against the reference.** If you're following a pattern/library, read
  the reference implementation *completely* — don't adapt from a half-read.
- **List every difference** between working and broken, however small. "That
  can't matter" is how bugs hide.

### Phase 3 — Hypothesis and minimal test
- **State one hypothesis:** "I think X is the cause because Y." Be specific.
- **Test it with the smallest possible change.** One variable at a time.
- **Verify before continuing.** Worked → Phase 4. Didn't → form a *new*
  hypothesis; do **not** stack another fix on top.
- **When you don't know, say so** and investigate more. Don't pretend.

### Phase 4 — Fix the root cause
- **Write a failing test first** that reproduces the bug (lean on
  [`tdd`](../tdd/SKILL.md) and [`testing-principles`](../testing-principles/SKILL.md)).
  **If no correct seam exists** — the only test you can write is too shallow to
  exercise the real bug pattern at its call site — that itself is the finding: the
  architecture is preventing the bug from being locked down. Note it and hand off
  to [`improve-codebase-architecture`](../improve-codebase-architecture/SKILL.md)
  rather than shipping a false-confidence test.
- **One fix, addressing the root cause.** No "while I'm here" extras.
- **Verify with evidence** (see
  [`verification-before-completion`](../verification-before-completion/SKILL.md)):
  test passes, nothing else broke, the original symptom is gone, and all
  `[DEBUG-…]` instrumentation is removed (grep the prefix).

### The 3-fix rule — question the architecture
If three fixes have failed — each revealing a new problem elsewhere, or each
needing "massive refactoring" — **stop**. This is not a failed hypothesis; it's
a wrong architecture. Surface it to your human partner and consider
[`improve-codebase-architecture`](../improve-codebase-architecture/SKILL.md)
instead of attempting fix #4.

## Fix the class, not just the line

A fix to the one line you were shown leaves every *sibling* defect intact — and
AI-written code is full of siblings, because the same shallow pattern gets
copy-pasted across sites. After the root-cause fix is verified (Phase 4), take one
more deliberate step: **recover the governing invariant and decide whether the
whole class needs closing.**

- **Recover the principle**, not the incident — the rule the bug violated
  ("compare timestamps in UTC", "validate this input before use").
- **Confirm it's a real class first.** Rule out a one-off before generalizing: a
  flaky/stochastic result, an external failure (a dependency or the environment,
  not your code), or a bad premise (the test/spec was wrong). Don't ratchet
  against noise.
- **Search for the siblings** — the other places the same latent defect lives.
  This is the *reverse* of Phase 2's "find working examples".
- **Close it both ways — as its own change, not smuggled into the bug fix**
  (Phase 4 stays one fix): *forward*, prevent the class; *backward*, migrate the
  existing population incrementally if it's large
  ([`migration`](../migration/SKILL.md)), scoped with
  [`impact-analysis`](../impact-analysis/SKILL.md) so the sweep stays bounded.
- **Install a ratchet** — a lint rule or a test that fails on the *pattern*, not
  just this input. The regression test guards the incident; the ratchet guards the
  class.

## Red flags — stop and return to Phase 1

- Naming the culprit subsystem before searching the whole repo for the symptom
- "Quick fix now, investigate later" · "just try changing X" · "it's probably X"
- Proposing fixes before tracing data flow
- Changing multiple things at once
- "One more fix attempt" after 2+ failures
- "I don't fully understand but this might work"

## Common rationalizations

| Excuse | Reality |
|--------|---------|
| "It's simple, skip the process" | Simple bugs have root causes too — the process is fast for them. |
| "Emergency, no time" | Systematic is *faster* than guess-and-check thrashing. |
| "Try this first, investigate later" | The first fix sets the pattern. Do it right from the start. |
| "I'll test after I confirm the fix" | Untested fixes don't stick. The failing test proves the cause. |
| "Reference is long, I'll adapt it" | Partial understanding guarantees bugs. Read it fully. |

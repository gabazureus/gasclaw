# Failure modes → remedies

This process is organized around the concrete ways AI-assisted development goes
wrong. Use this as a diagnostic: match the symptom you're hitting to the skill
that fixes it. The symptoms below are the recurring failure modes; the remedy
column is where to go.

| # | Failure mode (the symptom) | Root cause | Remedy |
|---|----------------------------|-----------|--------|
| 1 | **The AI didn't do what I wanted.** It built something different from what was in your head, or invented requirements. | You and the AI never shared a *design concept*. No one knows exactly what they want until forced to articulate it. | [`grill-me`](../skills/grill-me/SKILL.md) — interview relentlessly to reach shared understanding before any asset exists. |
| 2 | **The AI is way too verbose** and its output keeps drifting from what was planned. | A language gap — you don't share precise domain terms, so every exchange is a lossy translation. | [`ubiquitous-language`](../skills/ubiquitous-language/SKILL.md) — build a shared glossary; reasoning tightens and implementation aligns. |
| 3 | **It built the right thing but it doesn't work.** | Missing or unused feedback loops — the model can't see the consequences of its code, or doesn't check. | [`feedback-loops`](../skills/feedback-loops/SKILL.md) + [`tdd`](../skills/tdd/SKILL.md) — stack types, compiler, fast tests, real browser; take small test-first steps. |
| 4 | **The AI does too much at once**, then a small early mistake has propagated everywhere. | Outrunning your headlights — generating a big batch before verifying. | [`tdd`](../skills/tdd/SKILL.md) — red/green/refactor forces small steps so feedback arrives constantly. |
| 5 | **Tests are flaky, brittle, slow, or meaningless** — or you don't know what to even test. | The hard, interdependent testing decisions (unit size, what to mock, what to assert) were made badly. | [`testing-principles`](../skills/testing-principles/SKILL.md) — test behavior at a stable boundary; mock only what you don't own. |
| 6 | **Writing a test requires heavy mocking** and the logic can't be exercised without standing up the world. | Decisions are braided together with I/O. | [`functional-core-imperative-shell`](../skills/functional-core-imperative-shell/SKILL.md) — isolate pure logic so it tests with no mocks. |
| 7 | **The AI explores but lands in the wrong place** or misjudges dependencies; small changes break distant code. | A codebase of shallow modules — scattered, leaky, hard to navigate. Software entropy. | [`improve-codebase-architecture`](../skills/improve-codebase-architecture/SKILL.md) — consolidate into deep modules with simple interfaces. |
| 8 | **You're shipping more but your brain can't keep up** — exhausted holding every line in your head. | You're trying to keep the whole tangle in working memory instead of reasoning about boxes and contracts. | [`design-interface-delegate-implementation`](../skills/design-interface-delegate-implementation/SKILL.md) (+ [`subagent-driven-development`](../skills/subagent-driven-development/SKILL.md) to operationalize it) — design interfaces, delegate implementations as gray boxes verified from the outside. |
| 9 | **Something broke and the AI fires off random fixes** that mask the problem or create new ones. | Guessing instead of investigating — no root cause found before changing code. | [`systematic-debugging`](../skills/systematic-debugging/SKILL.md) — root-cause-first; no fix without investigation; 3 failed fixes = question the architecture. |
| 10 | **"Done" / "fixed" / "passing" turns out to be false** — trust breaks, rework follows. | Claims made from confidence, not from fresh verification evidence. | [`verification-before-completion`](../skills/verification-before-completion/SKILL.md) — run the command, read the output, *then* claim. |
| 11 | **A change ripples across many unrelated files; logic is welded to the DB/framework.** | No system-level boundaries; policy depends on detail; one module serves several actors. | [`architecture-boundaries`](../skills/architecture-boundaries/SKILL.md) — point dependencies inward, split by actor, keep the framework at the edge. |
| 12 | **Indirection everywhere, or a missing pattern leaves an if/else-on-type sprawl.** | Either no pattern where one would deepen the module, or a pattern used as decoration. | [`design-patterns`](../skills/design-patterns/SKILL.md) — pick by smell/goal, only when it reduces complexity. |
| 13 | **About to refactor/rename/delete and unsure what depends on it** — fallout shows up in distant code. | Changing first, discovering dependents later. | [`impact-analysis`](../skills/impact-analysis/SKILL.md) — trace recipients/blast radius/cycles/orphans *before* touching it. |
| 14 | **The AI starts coding from an underspecified task** and discovers gaps halfway through. | No pre-flight readiness check — confidence without a settled goal/interface/verification. | [`confidence-check`](../skills/confidence-check/SKILL.md) — close the gaps before building; reach for grill-me/write-prd if any remain. |
| 15 | **A weak design only reveals its holes once it's code** (expensive to change). | The design was never pressure-tested from multiple angles before building. | [`design-critique`](../skills/design-critique/SKILL.md) — review the design/PRD through several expert lenses; surface trade-offs on paper. |
| 16 | **"Looks done" ships with gaps the author couldn't see** (e.g. an untested module, an unpinned invariant). | No independent review before done — the author is blind to their own blind spots. | [`code-review`](../skills/code-review/SKILL.md) — run the review panel, act on every finding, re-verify before merge. |
| 17 | **You committed real production work to an assumption that didn't pan out** — a design/library/shape that only failed once built. | Building before validating the load-bearing unknown. | [`prototyping`](../skills/prototyping/SKILL.md) — spike throwaway code that answers the one question, capture the answer, delete it. |
| 18 | **The AI broke a local convention it "couldn't have known"** — this folder tests/deploys/structures differently from the rest. | Per-area rules live only in someone's head; nothing local told the agent before it edited. | [`doc-contracts`](../skills/doc-contracts/SKILL.md) — a tree of AGENTS.md contracts walked root→area before editing, updated in the same commit. |
| 19 | **The AI over-builds** — a whole component/library/abstraction for what a native feature or a few stdlib lines would do; bloat, boilerplate, needless deps. | It reaches for the heavy solution before asking whether a lighter rung works — and "more code" feels like "more done." | [`minimal-code`](../skills/minimal-code/SKILL.md) — climb the ladder (YAGNI → stdlib → native → installed dep → one line) and stop at the first rung; never cut safety. |

## How the remedies build on each other

The failure modes aren't independent — fixing the early ones makes the later
ones rarer:

- A shared **design concept** (1) and **language** (2) mean the PRD and code say
  what you actually meant, so "doesn't work" (3) is usually a real bug, not a
  misunderstanding.
- **Feedback loops** (3) and **small TDD steps** (4) keep mistakes one line deep.
- **Deep modules** (7) and the **functional-core/imperative-shell** split (6)
  are what make testing (5) easy and gray-box delegation (8) safe.

If you find yourself fighting a later failure mode repeatedly, suspect an
unfixed earlier one. Brittle tests (5) are often really a tangled-architecture
problem (6/7); "doesn't work" (3) is often really a missing-alignment problem
(1/2).

See [`foundations.md`](foundations.md) for the principles behind each remedy.

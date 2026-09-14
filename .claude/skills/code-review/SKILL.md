---
name: code-review
description: >-
  Review a change before it's "done" — run the review panel, act on every
  finding, and re-verify — and know how to request a review and how to receive
  one. Use at any change/PR boundary or phase completion, especially for
  critical modules (auth/money/security), and when the user says "review this",
  "is this ready to merge?", "code review", "check my change". The author is
  blind to their own gaps; independent review is what catches them before they
  ship.
---

# Code review

You cannot see your own blind spots — that's what makes them blind spots. In a
devmode smoke test, the implementer shipped a feature that *looked* complete, and
an independent review lane immediately found two real gaps (an untested boundary
module and an unpinned security invariant). That is the rule, not the exception.
This skill is the discipline that turns "looks done" into "reviewed and proven".

**How this relates to the rest:** the *who* are the review agents
(`complexity-reviewer` leads; `code-quality-analyzer`, `security-scanner`,
`test-coverage-analyzer` are the lanes). One execution mode,
[`subagent-driven-development`](../subagent-driven-development/SKILL.md), builds
review in per-task. This skill is the review *standard* and the
request → receive → act → re-verify *loop* you apply at any change boundary,
whether or not you're using that mode.

## Two stages, in order

Review in two passes — wrong order lets over/under-building slip through:

1. **Spec compliance first.** Does the change do what the spec/PRD asked —
   nothing missing, nothing extra? Issues here mean it's not done yet.
2. **Quality second** (only once spec is ✅). The panel in parallel:
   - **design & entropy** (`complexity-reviewer`): deep vs. shallow modules,
     leaked internals, growing interfaces, dead code.
   - **code quality** (`code-quality-analyzer`): readability, duplication, naming.
   - **security** (`security-scanner`): vulnerabilities, secret leakage, authz.
   - **test adequacy** (`test-coverage-analyzer`): untested behaviors/edges/ACs —
     and any test disabled/skipped or assertion commented-out/weakened **in the
     same diff as the fix it was meant to satisfy** (green-by-deletion is an
     automatic finding).

**Critical modules** (auth, money, security, irreversible effects) are reviewed
**in full** — never accepted on a gray-box basis.

**The gate's independence is immutable.** The reviewer is a *fresh, separate*
agent — never the implementer grading its own work (the panel lanes are spawned
independently for exactly this reason). And you do **not** collapse that
independence under pressure: a security or quality gate on a critical path is not
self-certified to save a round, however small the change *feels*. Maker and
checker stay different — that's what makes the green meaningful.

**Independence is temporal, not just structural.** Form your own read of the
*actual diff* before you ingest the author's summary or the PRD's abstraction of
it (and before leaning on any scanner output). A review anchored on the author's
framing inherits whatever that framing silently dropped — you end up checking the
change against the story told about it, never against what it really does. Read
the code first; read the story second.

## Requesting a review (make the reviewer effective)

A reviewer who has to guess scope reviews badly. Give them:
- **The change** (the diff/files) and **the contract** it should meet (spec/PRD,
  interface, acceptance criteria).
- **What's critical** and what to focus on (e.g. "this touches auth — scrutinize
  the signature comparison").
- **What's out of scope**, so they don't flag deliberate omissions.

## Receiving a review (the part that's hard)

This is where the value is realized or lost:

- **Read what the loop produced — don't accrue comprehension debt.** Reviewing
  AI-generated code is not optional ceremony: every diff you accept without
  understanding is debt you (or the next session) pay later, with interest. The
  point of the loop is to *accelerate* your understanding of the system, not to
  *replace* it. If you can't explain why the change is correct, you haven't
  reviewed it — you've rubber-stamped it.
- **Treat every finding as a gift**, not an attack. The reviewer found something
  you couldn't see — that's the whole point.
- **Fix the root cause**, not the symptom. If it's a bug, switch to
  [`systematic-debugging`](../systematic-debugging/SKILL.md).
- **Adopt the finding; verify the *fix*, not just the diagnosis.** A reviewer's
  finding can be right while the remedy they suggest is wrong — it can break a
  behavior the finding never mentioned (in a smoke test, a security lane correctly
  found a quota-reset bypass but proposed a fix that would have disabled the
  legitimate window reset). Take the problem; design the fix yourself against the
  spec; re-run the suite to prove it closes the finding *without* regressing.
- **Re-verify after fixing** — apply
  [`verification-before-completion`](../verification-before-completion/SKILL.md)
  to the fix; a fix you didn't run isn't a fix. The reviewer re-checks; don't
  skip the re-review.
- **Don't rationalize a finding away.** "It's probably fine", "edge case won't
  happen", "I'll do it later" is exactly the gap that ships. If you disagree,
  say why with evidence — don't dismiss silently.
- **Don't mark done with open findings.** Spec-reviewer found issues = not done.

## The loop has to converge

"Act on every finding" means *resolve* every finding — not *fix* every one, and it
is not a licence for the reviewer to keep widening scope until nothing ships. Each
finding gets one honest response: **fix it** (the default for anything material),
**defer it** — only for a genuinely non-material or out-of-scope finding, and only
as a *recorded* follow-up with a written reason — or **refute it** with evidence.

**Materiality bar.** Reviewers raise findings that affect correctness, safety,
changeability, or an acceptance criterion — not stylistic wishes dressed as
blockers. **New scope** a reviewer uncovers (a pre-existing issue, an adjacent
improvement) becomes a follow-up item, not a gate on *this* change.

**Stopping rule.** The quality pass is done when no material finding is left
unresolved — each one fixed, deferred-with-rationale, or refuted. The exceptions
that can never be deferred: spec-compliance findings, and any finding on a
**critical module** (auth/money/security/irreversible effects) — those block until
fixed. That keeps the gate both meaningful and bounded.

## Red flags

- Marking a change complete without any review on a critical module.
- Starting the quality pass before spec compliance is ✅.
- Arguing with or ignoring a finding instead of fixing or refuting it with evidence.
- Trusting an agent's "approved" without seeing the findings.
- Fixing a finding and claiming done without re-running verification.

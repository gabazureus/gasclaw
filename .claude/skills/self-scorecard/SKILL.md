---
name: self-scorecard
description: >-
  Verify, validate, and judge your own work with numbers — at each phase give a
  short overview of what was done and a 0–10 score across 5 criteria
  (Correctness, Design, Testing, Safety, Clarity), tracked with deltas so
  progress is visible; at the end, recommend how to strengthen each criterion.
  Use during a multi-step build (especially driven by /devmode), at every phase
  boundary, or when the user asks "how's it going?", "score this", "what's the
  quality?", "where can we improve?". Self-judgment, but grounded in evidence —
  not vibes.
---

# Self-scorecard

The agent that builds is the worst judge of its own work — unless it's forced to
score itself against fixed criteria, with evidence, every step. This skill turns
"looks good" into **numbers you can track**: a short overview of what was done
plus a 0–10 score on five criteria, with the delta from the last phase, so you
can watch the agent's own judgment of the work rise (or fall) as it goes.

It is *self-assessment, grounded in evidence* — the score on Correctness must be
backed by an actual test run (see
[`verification-before-completion`](../verification-before-completion/SKILL.md)),
not a feeling. Honesty is the whole point: a dishonest 9 is worse than an honest 5.

## The five criteria (0–10 each)

| Criterion | Scores high when… | Backed by |
|-----------|-------------------|-----------|
| **Correctness** | it works: tests pass, ACs met, fresh verification evidence | the actual test/build output |
| **Design** | deep modules, FCIS split, low complexity, easy to change | `functional-core-imperative-shell`, `improve-codebase-architecture` |
| **Testing** | behavior at stable boundaries, edges+invariants, no over-mock, ratchet | `testing-principles`, `tdd` |
| **Safety** | no secrets, input validated, guardrails respected, critical modules reviewed | `security-hardening`, the guardrails hook, `code-review` |
| **Clarity** | ubiquitous language, comments explain *why*, ADRs, readable | `ubiquitous-language`, `documentation` |

**Score bands:** <4 Weak · 4–6 Developing · 6–8 Solid · 8–9 Strong · 9+ Excellent.
Anchor your scores: a 10 means "I have evidence it's excellent here," not "no
problems came to mind." Reserve 8+ for things you've actually verified.

## How to run it (each phase)

1. **Gather evidence** for the phase — the test output, the diff, the review
   findings, the a11y/lint/audit results. Don't score from memory.
2. **Score each criterion 0–10** with a one-line, evidence-based note. Be
   harsh on what you haven't verified ("not observed" ≠ "fine").
3. **Render it** with the script (consistent format + delta + trend):
   ```bash
   echo '{ "phase":"Implement", "summary":"<what was done>",
     "scores": { "correctness":{"score":8,"note":"12/12 green"},
       "design":{"score":7,"note":"deep core/shell"},
       "testing":{"score":8,"note":"edges+invariants, no mocks"},
       "safety":{"score":6,"note":"guardrails on; auth review pending"},
       "clarity":{"score":7,"note":"UL used; 1 ADR missing"} } }' \
     | python3 scripts/scorecard.py
   ```
   It stores history in `.devmode/scorecard.json` and shows ▲/▼ deltas so the
   user tracks the trend across phases.
4. **Show the user the overview + scores.** This is the per-phase check-in.

## At the end — recommendations

When the work is done, run the **final** scorecard and attach
**recommendations per criterion** — the concrete next move that would raise the
weakest scores:

```bash
echo '{ "phase":"Review", "summary":"...", "scores":{...},
  "recommendations": {
    "safety":"add a no-leak test + review the auth path in full",
    "testing":"add the concurrency edge case",
    "clarity":"write the ADR for the storage choice" } }' \
  | python3 scripts/scorecard.py
python3 scripts/scorecard.py --final     # trend + recommendations
```

Recommendations are *judgment* (the script renders them; you author them). Aim
each at moving a specific criterion up a band, and point at the skill that does it.

## Honesty rules

- **Every 8+ needs evidence you actually saw this phase.** No optimistic scores.
- **Score down for unknowns.** Untested path → Testing/Correctness can't be high.
- **Don't game the trend.** If a phase regressed a criterion, show the ▼ — that's
  the signal that makes the scorecard worth anything.
- A criterion you can't yet assess (e.g. Correctness before any code) gets a low,
  honest score with the note "no code yet", not a placeholder high one.

> devmode-original. The renderer is `scripts/scorecard.py`; this skill is the
> rubric + the discipline of honest, evidence-backed self-judgment.

---
name: authoring-skills
description: >-
  Write, edit, and audit devmode skills (SKILL.md files) so they actually change
  behavior and stay consistent. Use when creating a new skill, editing an
  existing one, reviewing the skill pack for quality/duplication/broken links,
  or when the user says "write a skill", "improve this skill", "audit the
  skills", "is this skill good?", "the skill doesn't trigger". A skill is a
  knowledge-delta tool, not a tutorial — this skill keeps the pack sharp and
  internally consistent.
---

# Authoring skills

devmode *is* a skill pack, so maintaining the skills well is part of the work.
A skill is not a tutorial and not a story about how you once solved something —
it is a **knowledge-externalization mechanism**: edit a markdown file, and the
model's behavior changes on the next invocation, at zero training cost. This
skill keeps that mechanism effective and the pack consistent.

## The value test: knowledge delta

> **Good skill = expert-only knowledge − what the model already knows.**

A skill earns its place only by the *gap* it closes: decision trees, trade-offs,
edge cases, anti-patterns, domain-specific judgment — things experience teaches.
If the model already does it well without the skill, the skill is noise. Before
writing, ask: "what does an agent get *wrong* without this?" If the honest answer
is "nothing", don't write it.

## Write skills test-first (TDD for documentation)

Writing a skill is [`tdd`](../tdd/SKILL.md) applied to process docs:

1. **RED — watch it fail first.** Run a realistic pressure scenario *without* the
   skill and record the exact wrong behavior and the rationalizations the agent
   uses. If you didn't watch it fail, you don't know what the skill must teach.
2. **GREEN — write the minimal skill** that addresses those specific failures.
3. **REFACTOR — close loopholes.** Re-run; find the new rationalization the agent
   reaches for; plug it; re-verify. Repeat until it complies under pressure.

**Editing is not just adding.** When you change a skill that already works, a new
rule can dilute or quietly contradict guidance it already carried — the pack
accretes edits over many passes, so behavior it once handled can regress. Don't
stop at proving the new failure is fixed: re-run a scenario the skill *already*
handled to confirm you didn't break it, and try one *different*, unseen case in
the same class so the fix generalizes instead of overfitting the single scenario
you watched fail.

This is why the strongest skills (see
[`systematic-debugging`](../systematic-debugging/SKILL.md),
[`verification-before-completion`](../verification-before-completion/SKILL.md))
carry rationalization tables and red-flag lists — those are the plugged loopholes.

## Anatomy of a devmode skill

- **Frontmatter:** `name` (matches the directory) and a **pushy `description`**
  that states *what it does AND when to trigger* — concrete user phrasings and
  contexts. Under-triggering is the common failure; make the description specific
  and a little insistent.
- **Body (imperative, <500 lines):** lead with the *why* (the problem and the
  principle), then the steps/decision rules, then anti-patterns/red flags.
  Explain reasoning rather than barking MUSTs — the model has good theory of mind
  and follows understood rules better than rote ones. **Steer by the positive.** A
  prohibition drags the forbidden behavior into context and makes it *more*
  available (say "don't think of an elephant" and the elephant is all there is), so
  state the target — "write one-line comments", not "never write verbose
  comments". Keep a bare "don't" only as a guardrail you genuinely can't phrase
  positively, and even then pair it with what to do instead.
- **Cross-references:** link sibling skills by relative path; reference them by
  *name* in templates that get copied into other projects.
- **Bundled resources** (`assets/`, `references/`, `scripts/`) only when they pull
  their weight; keep SKILL.md scannable.

## Leading words

The cheapest way to steer behavior is to **recruit a concept the model already
holds**. A *leading word* is a compact term already in the model's pretraining —
`lesson`, `fog of war`, `tracer bullets`, `tight`, `red` — that the agent thinks
*with* while running the skill. Used as a repeated token (never restated as a
sentence), it accumulates meaning across the skill and anchors a whole region of
behavior for almost no tokens, because the priors come free.

It pays twice: in the body it anchors *execution* (the agent reaches for the same
behavior every time the word appears — the consistency a skill exists to buy); in
the description, and wherever the same word lives in your prompts, PRDs, and code,
it anchors *invocation*. devmode already runs on this (`grill`, `ratchet`,
`headlights`) — name the concept, don't paraphrase it. Coin your own word only if
you then *define* it: a made-up term recruits no priors, so you pay in definition
tokens what a pretrained word gives free. And a word too weak to beat the default
(`be thorough` when the agent already is) is a **no-op** — the fix is a stronger
word (`relentless`), not more prose.

## Audit checklist

Run this when reviewing the pack (the script below automates the mechanical parts):

- **Frontmatter present & valid** — `name` matches the folder; `description`
  states what + when.
- **Knowledge delta is real** — not restating what the model already knows; apply
  the same test line by line (a line the model already obeys is a no-op), and
  settle no-op disputes by running the skill, not by debating the default.
- **Right altitude** — concrete enough to act on, general enough to reuse; not
  overfit to one example.
- **Progressive disclosure** — SKILL.md under ~500 lines; detail pushed to
  references with clear pointers.
- **No contradiction or duplication** — it doesn't fight another skill's advice
  or duplicate it (e.g. coverage targets vs. testing-principles; patterns-as-
  decoration vs. deep modules). Overlapping skills must scope against each other
  explicitly.
- **Consolidate, don't just patch** — removal, merge, and compression are
  first-class skill edits, not only addition. When a skill has been patched
  repeatedly and reads as accreted (stale, redundant, or conflicting rules),
  prefer a wholesale rewrite for coherence over one more append. This is
  [`improve-codebase-architecture`](../improve-codebase-architecture/SKILL.md)'s
  shallow→deep instinct applied to the skill *document*.
- **Links resolve** — every relative link points at a real file.
- **No provenance inside the skill** — a skill carries only what it *does*. Where
  a rule came from (an upstream repo, its license, a URL) is metadata the agent
  can't act on, and a loaded file re-spends that attention on every task. Credit
  belongs in the human-facing docs (`README.md`, `ATTRIBUTION.md`) — which is also
  where a licence's attribution *condition* is satisfied. Same rule for agents,
  commands, and deployed templates; the auditor enforces it.
- **Reasoning over MUSTs** — heavy ALL-CAPS rules are a yellow flag; reframe as
  explained principles.

## The audit script

`scripts/audit_skills.py` checks the mechanical invariants across the whole pack
— skills *and* agents (frontmatter, name↔folder/file match, line budget,
resolvable internal links) — and prints a report. Run it after any skill or agent
change:

```bash
python3 scripts/audit_skills.py
```

Use it as the fast gate; use the checklist above for the judgment calls a script
can't make.

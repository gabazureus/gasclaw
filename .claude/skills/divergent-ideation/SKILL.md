---
name: divergent-ideation
description: >-
  Generate a wide set of genuinely different candidates for an OPEN, hard-to-
  reverse decision — an architecture fork, an API/CLI/SDK surface, a naming
  scheme, a migration approach, or a bug with no known root cause — before
  choosing one. Use when the user says "give me options", "what are the
  alternatives", "how else could we do this", "I only have one idea", or whenever
  a high-stakes decision is about to be made from a single candidate. This is the
  generative counterpart to design-critique, which evaluates a design you already
  have.
---

# Divergent ideation

The default failure isn't picking the wrong option — it's never having a second
one. An AI optimizes the change in front of it: asked how to do X, it produces the
obvious, textbook answer and everything downstream treats that as the design. The
answer is usually *correct*, which is exactly why it goes unchallenged. This skill
forces a real candidate set into existence *before* anything converges on the
first idea.

[`design-critique`](../design-critique/SKILL.md) pressure-tests a design you've
already chosen; it can tell you the chosen thing is weak, but it can't invent the
alternative you never generated. Reach for this first, then hand the winner to
that skill.

## The wall between diverge and converge

**Generate first, judge second — never at the same time.** The critic strangles
the generator: evaluate while you ideate and you'll only produce ideas you can
already defend, which are the safe ones you'd have reached anyway. Hold the two
phases apart deliberately. This is a discipline, not a scoring ceremony — no
points, no weighted totals.

## Diverge

**Push past the obvious first three.** The first candidates are the 30-second
senior-engineer answers — correct, conventional, forgettable. The interesting
region is the awkward middle *after* those and *before* the absurd. If your list
reads as three variations of one idea, you converged and called it divergence.

**Vary the generator, not the output.** Don't ask "what else?" — that produces
paraphrases. Re-pose the *whole problem* from a few distinct frames, and let each
frame produce its own candidate:

- **Inversion** — what if the opposite were true (push instead of pull, client
  instead of server, no state at all)?
- **Remove the load-bearing assumption** — which constraint is everyone treating
  as fixed? Delete it and re-solve.
- **Zero budget** — the version with no new dependency, no new service, no new
  table.
- **3am on-call** — design it for the person debugging it under pressure.
- **The adversary / the regulator** — someone actively trying to break or audit it.
- **Explain it to a newcomer** — the shape that survives being described simply.

When the frames need real independence, dispatch **one fresh subagent per frame**
using the perspective-guided research plumbing in
[`grill-me`](../grill-me/SKILL.md) — including its context-isolation rule, so a
frame doesn't just mirror your leaning back at you.

## Converge

A *separate* pass, once generation is done:

1. **Cluster by underlying angle, not by keyword.** Ten candidates often collapse
   into three real strategies; name the strategies.
2. **Name the traps mechanistically.** "Risky" is not a finding — say *how* it
   fails (what breaks, under what load, at which boundary). Borrow the lenses in
   [`design-critique`](../design-critique/SKILL.md) rather than re-deriving them.
3. **Surface the non-obvious-but-viable candidate explicitly.** The whole point of
   diverging is that it exists; if you bury it next to the safe pick, you wasted
   the exercise.

## Recommend — don't dictate, don't abstain

End with a **recommended option and why**, *plus* the non-obvious viable one and
what would make it the right call instead. Handing back a menu of equal-weight
options is the cop-out this skill exists to prevent — and so is quietly deciding
for the human. Trade-off resolution stays theirs (the same stance as
[`grill-me`](../grill-me/SKILL.md)). Then hand the chosen candidate to
[`design-critique`](../design-critique/SKILL.md) to be pressure-tested.

## Red flags

- One idea presented as *the* design for a hard-to-reverse decision.
- A "candidate set" that is one idea in three costumes.
- Evaluating while generating ("that won't work") — the critic ran too early.
- Weird options generated for their own sake, with no converge pass.
- Ending on an equal-weight menu with no recommendation, or on a recommendation
  with no alternative.

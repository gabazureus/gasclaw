---
name: grill-me
description: >-
  Reach a shared design concept with the user by interviewing them
  relentlessly BEFORE writing any plan, spec, or code. Use this whenever the
  user describes a feature, change, or product idea and you sense any ambiguity
  about what they actually want — especially at the start of a task, when the
  user says "I want to build X", "help me design Y", "grill me", "interview
  me", "let's plan this", or when a request is vague enough that jumping
  straight to a plan would be guessing. Prefer this over eagerly producing a
  plan document: align first, then write the asset.
---

# Grill me

No one knows exactly what they want — not the user, not you. The gap between
what's in the user's head and what you build is the single biggest source of
wasted work. This skill closes that gap by reaching a **shared design concept**
(Frederick Brooks' term): the invisible, agreed-upon theory of what is being
built. It is not a document. You cannot save it to a file. It lives in the
shared understanding between you and the user, and you only get there by asking.

The mistake to avoid is rushing to create an asset. The instinct to produce a
plan immediately feels productive, but a plan written before alignment just
freezes a guess. Interview first. The conversation you generate here is the raw
material that later becomes a PRD or a set of issues — but the alignment is the
point, not the document.

## How to grill

Interview the user relentlessly about every aspect of the idea until you reach
genuine shared understanding. Treat yourself as a friendly adversary whose job
is to surface every hidden assumption.

Walk the **design tree**: every design decision opens branches, and branches
depend on each other. Don't fire questions randomly. Pick a branch, resolve the
decisions on it, and follow the dependencies those decisions create before
moving to the next branch. A decision about storage might depend on a decision
about data volume, which depends on a decision about who the users are — chase
that chain to the bottom.

Ask about, at minimum:

- **Purpose & users.** Who is this for? What problem does it solve? What
  happens if it doesn't exist?
- **Scope boundaries.** What is explicitly *not* part of this? What's the
  smallest version that delivers value?
- **Behavior & edge cases.** What happens on the happy path? On failure? On
  empty input? At the limits?
- **Constraints.** Performance, security, compliance, deadlines, existing
  systems it must fit into.
- **Data & state.** What is the shape of the data? What's the source of truth?
  What can change and when?
- **Trade-offs.** Where decisions conflict, make the tension explicit — then say
  which side you'd pick and why. A neutral menu with no opinion is abdication
  dressed up as balance. *Ask* when the call is the user's (product, priorities,
  taste); *decide* when it's an engineering call and defend it until shown wrong.
- **Success.** How will we both know this is done and correct?

## Classify what's unclear — then ask the right kind of question

Not all gaps are the same; the *type* of gap determines the *kind* of question.
Before firing a question, classify the fault:

- **Intention fault** — the real goal isn't recoverable. ("Make it better" —
  better how, for whom? "Can you check if X is possible?" often means "do X".)
  → Ask for the underlying outcome.
- **Premise fault** — an assumption in the request is wrong. ("Fix the race
  condition in the cache" — when there is none; or it asks for something the
  system can't do.) → Surface and test the assumption *before* accepting the task.
- **Parameter fault** — required details are missing or conflicting. ("Build a
  login page" — OAuth? email/password? SSO? "Simple but handle every edge case".)
  → Ask for the missing parameter or resolve the contradiction.
- **Expression fault** — the wording blocks a unique reading. ("Update that
  component" — which? "Clean up the API" — refactor, deprecate, or document?)
  → Disambiguate the term or referent.

Then note which *direction* the gap pulls: **semantic** (multiple meanings →
"A or B?"), **too broad** (huge scope → "which part matters most now?"), or **too
narrow** (oddly specific → "what's the broader outcome?").

## Choose questions by information gain

Don't ask "what should I ask?" Ask "what are the plausible interpretations, and
which question eliminates the most of them?"

1. Generate 2–4 competing interpretations of the request.
2. Find the axis on which they disagree.
3. Ask about that axis — the answer that collapses the most uncertainty.

This is the difference between dream-extraction and a checklist: each question
is chosen to resolve the largest open branch of the design tree, not to fill a
form. Explicitly check whether parts of the request *conflict* with each other —
inconsistencies are the hardest gaps to spot and the costliest to discover late.

**Offer structured choices when the axis is discrete.** When a decision has a
small set of plausible options, don't ask open-endedly — present them as labeled
choices (A / B / C / D), each with its trade-off in a phrase, plus an "other /
none of these" escape. It's faster for the human to pick than to compose, and it
forces *you* to have actually thought through the interpretations. Reserve
open questions for genuinely open axes.

## Ask in rounds — work the frontier, not a drip

Serial one-question-at-a-time is slow and makes the user wait on you. Batch by
**frontier**: every decision whose prerequisites are *already settled* — the
questions you can ask now without guessing at answers you haven't heard yet. Ask
that whole frontier in one round: **number each question and give your recommended
answer**, then stop and wait. A question whose answer depends on another question
still open in this round belongs to the *next* round, not this one.

Each round's answers reshape the design tree — settled decisions push the frontier
outward and unblock what depended on them. Recompute and ask the next round.
You're done when **the frontier is empty**: every branch visited, nothing left
silently assumed.

(This is how "one branch at a time" is *paced*, not a contradiction of it: you
still finish a line of dependent decisions before opening an unrelated one — you
just don't drip-feed questions that were all answerable at the same moment.)

## Ground a knowledge gap before you guess (perspective-guided research)

Some gaps aren't in the *user's* head — they're shared ignorance: an unfamiliar
library, protocol, or domain; "what are the known failure modes of approach X?".
Quizzing a user who also doesn't know is useless, and guessing freezes a bad
premise (a *premise* or *parameter* fault that's really ignorance). When that
happens, **investigate before you grill** — a small grounded spike that writes
from research, not priors:

1. **Pick 3–5 distinct perspectives**, not one (e.g. a skeptic, an ops/SRE, a
   security reviewer, a maintainer, the official docs). Diverse viewpoints surface
   the *unknown unknowns* a single angle misses.
2. **Dispatch one fresh subagent per perspective**
   ([`subagent-driven-development`](../subagent-driven-development/SKILL.md)), each
   given **only the question plus minimal context — never your running conversation
   or your own stated leaning**. When you're also the one synthesizing, feeding a
   voice your position makes it mirror that position back, destroying the very
   independence you dispatched it for. Each is issued web search/fetch and told to
   bring back **cited** findings — every claim carries a source or it doesn't count
   ([`verification-before-completion`](../verification-before-completion/SKILL.md)).
3. **Cross-examine**: where the perspectives disagree is where the real decision
   lives — surface the contradiction, don't average it away.
4. **Bring the cited findings back into the interview** to ground the next
   questions (and later the PRD/ADR). Keep them in a short markdown findings note.

This is a *technique inside the grill*, not a separate research mode — reach for
it the moment a gap turns out to be ignorance, not preference. (Run it ad hoc via
`/devmode do "research <question>"`.)

## Rules of engagement

- **Ask a lot.** Real grilling means dozens of questions — keep going until the
  understanding is genuinely shared, not until you hit a quota. It is normal for
  this to run long.
- **One branch at a time.** Don't scatter. Finish resolving a line of
  dependent decisions before opening a new one, so the user can think clearly.
- **Facts are your job; decisions are theirs.** Never ask the user for something
  you could look up — the filesystem, the code, the docs, the dependency's actual
  API. Go find it (dispatch a subagent if it's slow) and don't block on it: only
  the questions *downstream* of that fact wait, so ask the rest of the round now.
  Asking the user to do your research is how an interview turns into a chore.
- **Surface assumptions, don't smuggle them.** Whenever you'd otherwise fill a
  gap by guessing, turn the guess into a question.
- **Disagree out loud — once.** When you believe the user's direction is wrong,
  say the unwelcome thing plainly, with the reason *and* an alternative — deferring
  to a plan you think is wrong to seem agreeable is negligence, not respect. On a
  judgment call (product, taste, priorities), if the user overrules you, do it
  their way, note the residual risk once, and don't relitigate. Correctness,
  security, and data-safety are the exception: never drop those to seem agreeable.
  Challenge, don't obstruct.
- **Reflect back.** Periodically summarize the design concept as you understand
  it so far and ask the user to correct it. This is how you confirm the concept
  is actually shared.
- **Don't write the asset yet.** Resist producing a plan, spec, or code until
  the user signals the concept is solid. When they do, hand the conversation to
  [`write-prd`](../write-prd/SKILL.md) (large changes) or turn it directly into
  issues (small ones).

## When you're done

You've reached a shared design concept when you can restate the what, the why,
the boundaries, and the key trade-offs, and the user agrees without
corrections. At that point, stop grilling and offer to capture it — as a PRD,
as issues, or as a short summary the user can hand to an AFK agent.

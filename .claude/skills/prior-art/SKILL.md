---
name: prior-art
description: >-
  Before building anything non-trivial, find out whether it already exists —
  as a product you can buy, an open-source project you can adopt, or (when
  nothing has shipped) a published technique you can implement. Judge fit over
  popularity, price it at three horizons, and only then recommend build / adopt
  / buy. Use at SPECIFY before write-prd, when the user says "let's build X",
  "how should I implement X", "has anyone solved this", "what's the state of the
  art", or whenever a component is about to anchor the architecture. Skip for
  glue code, CRUD, and anything the user has already decided.
---

# Prior art — is this already solved?

The most expensive code is the code you didn't need to write. An agent asked to
build X starts designing X; it almost never asks whether X already exists, ships
today, and is maintained by people whose whole job it is. That question is worth
more than any amount of clever implementation, and it has to be asked *before*
the PRD, because the answer can delete the PRD.

This is [`minimal-code`](../minimal-code/SKILL.md)'s reuse ladder pointed
**outward**: that one asks "does this repo already do it?", this one asks "does
the world already do it?" — and it runs early enough to change what gets built.

## When to run it — and when not to

Run it when the thing is **load-bearing**: a component that will anchor the
architecture, a capability that is a product in its own right (auth, chat,
search, payments, sync, scheduling), or anything expensive to redo once wrong.

Skip it — and say you're skipping it — for glue code, plain CRUD, a one-off
script, or when the user has already chosen the approach. Re-opening a settled
decision is not diligence, it's churn.

## 1. Frame before you search

State the frame in one line, because it changes the whole answer:

- **Greenfield** — nothing exists yet; the question is *what to build on*.
- **Existing system** — the question is *what to keep, what to change*, and
  whether the new capability should be built, adopted, or bought.

If the request is too vague for the answer to be stable — you don't know the
user, the must-have workflow, the scale, or whether paid tools are allowed —
**ask before searching**, in one batch (see
[`grill-me`](../grill-me/SKILL.md)'s round discipline). Whatever they don't
answer becomes a **written assumption**, visible in the output, never a silent
guess.

## 2. Search — the world, not just GitHub

Look for three things, in this order:

1. **Products that already do it** (including paid ones — cost is a fact to
   weigh, not a reason to skip the option).
2. **Open-source projects** doing the same job.
3. **How comparable systems solved it** — the shape of the solution, even if
   you adopt none of them.

Stop at the smallest evidence set that could change the decision: two or three
comparables, the primary documentation for each material claim, and the official
pricing page for each cost claim. Expand only when sources conflict or a
material claim is still unverified. Don't browse to accumulate links.

**Keep an evidence ledger** — for each claim: the **source**, the **date you
observed it** (pricing and limits rot), what it **establishes**, and what it
**does not**. The "does not" column is the one that prevents over-claiming.
And never describe a one-source check as if it were a survey.

## 3. Judge fit, not popularity

This is where the search usually goes wrong.

**Stars are a bookmark count that only goes up.** They tell you people liked
something once — not that it fits you, not that it's maintained, not that it's
right at your scale. Ranking by popularity is outsourcing your judgment to
strangers with a different problem.

For every comparable worth mentioning, write **both** halves:

- **What transfers** — the part that applies to your situation.
- **What must not be copied** — the part that exists because of *their* team
  size, traffic, deployment history, or business model. A mature project's
  heavy infrastructure is usually an answer to a question you don't have.

If the best fit is the less popular option, say so and say why. If the research
*doesn't* change the recommendation, say that too — confirming fit is a result.

## 4. Price it at three horizons

A managed service is cheap until precisely the moment it isn't, and that moment
is usually the day you succeed. Price every candidate at three points:

| Horizon | The question |
|---|---|
| **Prototype** | what it costs while nobody is using it (often free) |
| **Launch** | what changes the day real users, real storage, and real jobs appear |
| **Growth** | which line item scales fastest, and where lock-in starts |

Watch the metered dimensions, not the sticker: seats/MAU, requests, tokens,
storage and egress, background jobs, environments, and the add-ons that turn out
to be enterprise-only. Cite verified prices with the date observed; when you
can't verify, name the *dimension* that would overturn the choice rather than
inventing a number.

## 5. Escalate to research only when nothing shipped exists

Sometimes the honest finding is "nobody has shipped this." That is not the end —
the *technique* may be published even when no product exists. Escalate to the
research literature only when all three hold (otherwise you're paying a large
cost for a CRUD answer):

1. There's a real **technical mechanism** to research — a coordination scheme, a
   ranking/retrieval approach, a caching or consistency strategy, a protocol,
   anything where the naive version breaks at scale.
2. The user is **committing real effort** to it — it anchors the architecture or
   is expensive to redo.
3. The approach is still **open** — they haven't already named the algorithm.

When you do escalate, read in **isolation, then converge**: one fresh subagent
per paper or source, each given only the problem and its own document — never
your running conversation or your leaning, so they can't echo each other
([`grill-me`](../grill-me/SKILL.md)'s anti-anchoring rule). Then *you* commit to
**one** recommended path, with citations, the first concrete step, and the
failure modes the literature already documents. A pile of summaries is not an
answer.

**Harvest the rejected options before you drop them.** A candidate you didn't
pick still tells you two things worth keeping: the **failure mode it documents**
(a pitfall named by an option you rejected will still bite you on the path you
chose — collect the warnings from *all* of them, not just the winner's), and
**why it lost** — one honest sentence per runner-up on the trade-off that
decided it. That sentence is what lets someone switch paths later on purpose
instead of re-running the whole search. Rejecting an option is not the same as
learning nothing from it.

## 6. Recommend — build, adopt, or buy

End with a single recommendation and the trade-off stated bluntly:

- **What you gain** — the specific speed, simplicity, or reliability.
- **What you give up** — control, portability, flexibility.
- **What gets harder later** — migration, scaling, compliance, local dev.
- **When this becomes wrong** — the concrete condition (a user count, a price
  tier, a compliance need) that should trigger revisiting it. A recommendation
  without its invalidation condition is a guess with good posture.

Then hand off: the chosen direction feeds [`write-prd`](../write-prd/SKILL.md),
the alternatives you rejected feed
[`divergent-ideation`](../divergent-ideation/SKILL.md) if the decision is still
open, and the winner gets pressure-tested by
[`design-critique`](../design-critique/SKILL.md).

## Red flags

- Designing the implementation before asking whether it exists.
- Ranking candidates by stars, downloads, or vibes.
- Copying a big project's architecture without asking which parts are there
  because they're big.
- A stack recommendation with no cost curve — or a cost claim with no observed date.
- Escalating to literature research for glue code, or refusing to when the
  component is genuinely novel and load-bearing.
- Presenting a recommendation with no stated condition that would overturn it.

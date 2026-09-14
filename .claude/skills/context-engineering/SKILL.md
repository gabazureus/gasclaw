---
name: context-engineering
description: >-
  Curate what an agent has in its working context — load the right files at the
  right time, keep the working set tight, and hand off cleanly across sessions.
  Use when an agent is drowning in irrelevant context, losing the thread on long
  tasks, repeatedly re-reading the same files, approaching compaction, or when
  the user says "manage context", "it forgot", "too much in context", "hand off".
  Context is a scarce resource: what you load (and don't) determines the quality
  of the work.
---

# Context engineering

An agent's output quality is bounded by what's in its working context. Too little
and it guesses; too much and the signal drowns in noise and it loses the thread.
Context is a budget to *curate*, not fill. This is the discipline of deciding
what the agent sees, when, and how it survives across sessions.

## Load the right thing at the right time (progressive disclosure)

- **Load on demand, not up front.** Pull the specific file/skill/reference for
  the current step; don't preload everything "to be safe." (This is why skills
  themselves use progressive disclosure — metadata always, body on trigger,
  references as needed.)
- **Place durable instructions at the latest reliable point.** Every standing or
  global instruction spends attention and narrows choices for *every* task, not
  just the one that needs it. Keep the persistent channel (CLAUDE.md, the agent
  brief) to outcome + acceptance + authority; surface narrow policy at the decision
  point where it actually applies, not up front.
- **Prefer the stable summary over the raw pile.** A tight design concept, the
  [`module map`](../ubiquitous-language/SKILL.md), and the relevant interface beat
  twenty whole files. Reach for the detail only when you need it.
- **Curate for subagents.** When delegating
  ([`subagent-driven-development`](../subagent-driven-development/SKILL.md)), hand
  the worker *exactly* the task text + context it needs — never your whole
  session history. Constructing a clean, minimal brief is the point.

## Keep the working set tight

- **Notice the smells:** re-reading the same files, output drifting from the
  goal, "what were we doing?" mid-task — these mean the working set is wrong
  (too cluttered or missing the key thing).
- **Summarize and drop.** Replace a long exploration with its conclusion; you
  don't need the search transcript once you have the answer.
- **One concern at a time.** A focused context for a focused task; don't carry
  five half-finished threads at once.
- **Park distractions, don't chase them.** When a second concern intrudes mid-task
  ("the retry logic probably has this same bug"), it's a *later*-task, not a
  *now*-task. Log it verbatim to durable memory with a one-line **anchor** so it
  reads cold after compaction — the task you're mid-way through · the file/area
  "this"/"here" points at · `branch@sha` — filled only from coordinates you already
  hold. Then ack in one line and resume *at the same pace*: don't act on it, don't
  open its files, and **don't cut corners on the current task to "get to" it.**

## Survive compaction (hand off cleanly)

Long tasks outlive a single context window. Hand off **while the model is still
reasoning sharply** — output stays crisp inside a window and degrades past it, so
hand off *before* you cross it, not once you're already pushing on a degraded
context. Write a **handoff that carries intent, not just status** — the design concept,
the current position, the single next step, open decisions — into durable memory
(Beads notes / a `STATE.md` digest). A fresh session should resume *cold* from
it, not re-derive the plan. (This is the WARM START habit in the Conductor
integration.) A good handoff also:

- **Points to artifacts, doesn't duplicate them** — link the PRD/plan/ADR/issue/
  diff by path, don't paste their contents (that's the whole token win).
- **Names the next skills** — a short "suggested skills" line tells the resuming
  agent what to reach for first (e.g. "resume at IMPLEMENT via `tdd`").
- **Redacts secrets/PII** — never carry API keys, tokens, or personal data into a
  handoff doc; scrub them out.
- **Lives where the next session looks** — durable memory the loop reads on start
  (Beads / `STATE.md`), or the OS temp dir for a one-off agent-to-agent pass —
  not buried in chat scrollback.
- **Forks — it doesn't continue in place.** A handoff opens a *fresh* session that
  reads the doc, so the verbatim history survives *in the doc*. Compaction instead
  summarizes earlier turns in place and the verbatim history is lost — so compact
  only at intentional breaks *between* phases, never mid-phase.
- **Test the handoff in a fresh session.** A document's existence proves only that
  it was written — not that it works. Before trusting a handoff or durable note,
  open a cold session and confirm it actually retrieves the route and changes
  behavior; fix what the fresh agent misses.

## Process

1. For the current step, identify the *minimum* context that makes it doable.
2. Load that; resist loading more "just in case."
3. When delegating, build the subagent's brief deliberately and minimally.
4. Summarize finished sub-threads down to their conclusions.
5. Hand off durable intent before you run out of room.

## Red flags

- Preloading the whole codebase/all skills before starting.
- Pasting a worker your entire history instead of a curated brief.
- The agent re-reading files it already saw, or losing the goal on a long task.
- Pushing work on a degraded context, or compacting mid-phase.
- Trusting a handoff you never verified from a cold start (writing it ≠ it works).
- Chasing a passing thought mid-task — or rushing the current task to reach it —
  instead of parking it verbatim and resuming.
- Stopping a long task with no handoff (the next session starts from zero).

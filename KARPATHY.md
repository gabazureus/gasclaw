# KARPATHY.md — the LLM Wiki schema for this project

> **What this is.** The *schema* that turns an LLM from a forgetful chatbot into a
> disciplined **wiki maintainer**. Read it at the start of any session that
> ingests, queries, or maintains this knowledge base — it defines how the wiki is
> structured and the workflows to follow. Without a schema the LLM re-derives
> everything every time; with it, knowledge **compounds**.
>
> **Concept:** Andrej Karpathy's *LLM Wiki* pattern (a public gist).
> Pure markdown — no app, no database, no server. Browse it in any editor
> (Obsidian follows the `[[wikilinks]]`); maintain it with any LLM coding agent.
> Deployed by devmode's `/devmode wiki` module.

---

## The problem this solves

The usual LLM-over-documents experience is **RAG**: you drop files, the model
retrieves chunks, answers, and **throws everything away**. Every query starts from
zero — nothing accumulates. A subtle question that needs five documents synthesized?
The model re-finds the fragments every single time.

The LLM Wiki is the opposite: the LLM **builds and maintains a persistent wiki** —
a graph of interlinked markdown that sits between you and the raw sources. Each new
source gets *integrated*: entity pages updated, summaries revised, contradictions
flagged, the synthesis strengthened. **Knowledge is compiled once and kept alive,
not re-derived per question.**

> "Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase." — Karpathy

## Division of labour

| Who | Does | Writes to |
|---|---|---|
| **Human** | Curates sources, explores, asks questions, sets direction | `docs/raw/sources/` (drops external material) |
| **LLM** | Summarizes, cross-references, files, bookkeeps, maintains consistency | `docs/wiki/<type>/` + `overview.md`, `index.md`, `log.md` |

The human **never writes the LLM-curated pages** (`docs/wiki/<type>/`) — that's the
LLM's territory. The human owns `docs/raw/sources/` (drop zone) and the strategic
direction; the LLM owns the knowledge graph.

## The three layers

```
┌──────────────────────────────────────────────────────────────┐
│ SCHEMA — this KARPATHY.md (+ CLAUDE.md / AGENTS.md)          │
│   Defines how the wiki is structured and maintained.         │
└──────────────────────────────────────────────────────────────┘
                       ▲ read at session start
┌──────────────────────────────────────────────────────────────┐
│ WIKI  — docs/wiki/  (LLM-maintained knowledge graph; human reads) │
│   entities · concepts · synthesis · sources · queries ·      │
│   comparisons  +  overview.md · index.md · log.md            │
└──────────────────────────────────────────────────────────────┘
                       ▲ compiled from
┌──────────────────────────────────────────────────────────────┐
│ RAW  — docs/raw/sources/ (human drops, LLM reads, NOBODY edits)   │
│   transcripts · PDFs · web clips    docs/raw/assets/ — images     │
└──────────────────────────────────────────────────────────────┘
```

- **Raw** is immutable ground truth — external material the LLM reads but never edits.
- **Wiki** is the navigable knowledge graph the LLM creates and keeps consistent.
- **Schema** (this file) is what makes the LLM a *maintainer* and not a chatbot.

## The 7 page types

Every file in `docs/wiki/<type>/*.md` (except `docs/wiki/index.md` and `docs/wiki/log.md`) is
exactly one of these — no other types (extra semantic types like "playbook" or
"roadmap" cause classification ambiguity; use `tags` for that instead):

| `type` | Folder | What it holds |
|---|---|---|
| `overview` | `docs/wiki/overview.md` (singleton) | The project's global picture, refreshed on each ingest |
| `entity` | `docs/wiki/entities/` | People, organizations, products, places — concrete things |
| `concept` | `docs/wiki/concepts/` | Frameworks, ideas, methodologies — timeless abstractions |
| `synthesis` | `docs/wiki/synthesis/` | Cross-cuts, processes, roadmaps — things that combine others over time |
| `source` | `docs/wiki/sources/` | An LLM summary of one raw source (created on ingest) |
| `query` | `docs/wiki/queries/` | A valuable chat answer, saved as a page |
| `comparison` | `docs/wiki/comparisons/` | A side-by-side analysis of 2+ entities/concepts |

## Frontmatter (required on every wiki page)

```yaml
---
title: "Human title"
type: overview|entity|concept|synthesis|source|query|comparison
date: YYYY-MM-DD
tags: [tag1, tag2]
sources:
  - docs/raw/sources/...        # what this page was compiled from
---
```

`sources` is the **relevance backbone**: pages that share sources are more
connected in the graph. Always fill it when a page derives from raw material.
`docs/wiki/index.md` and `docs/wiki/log.md` are the two exceptions — **no frontmatter**.

## The two special files

- **`docs/wiki/index.md`** — the catalog. Every page, grouped by type, each with a link
  and a one-line summary. **The LLM reads this FIRST on every query** — it's the
  cognitive index that makes retrieval work without a vector database at moderate
  scale (hundreds of pages).
- **`docs/wiki/log.md`** — append-only, chronological. Every operation (ingest, saved
  query, lint, refactor) adds one entry: `## [YYYY-MM-DD] <op> | <title>`.
  Parseable with `grep "^## \[" docs/wiki/log.md | tail -10`.

## The three operations

**INGEST** — human drops a file in `docs/raw/sources/`; the LLM:
1. Reads it. 2. Discusses takeaways with the human (≥1 turn). 3. Writes
`docs/wiki/sources/<slug>.md` (summary + frontmatter). 4. Updates affected
entity/concept/synthesis pages — *a well-ingested source touches 10–15 pages*.
5. Refreshes `docs/wiki/overview.md` if the global picture moved. 6. Updates
`docs/wiki/index.md`. 7. Appends to `docs/wiki/log.md`. 8. **Flags contradictions explicitly**
when the source challenges an existing claim.

**QUERY** — human asks; the LLM:
1. Reads `docs/wiki/index.md` first to map relevant pages. 2. Drills into the 3–8 most
likely. 3. Synthesizes with **explicit citations** (`(see [[page]])`). 4. **Offers
"Save to Wiki"** when the answer was new/valuable → `docs/wiki/queries/<slug>.md`. That's
how exploration compounds into the knowledge base.

**LINT** — human asks for a health check; the LLM reports 3–5 prioritized items:
contradictions between pages · stale claims (newer sources superseded older data) ·
orphan pages (no inbound links) · concepts mentioned ≥3× with no page of their own ·
missing cross-references · gaps worth deeper research · broken frontmatter.

## Working with the user (natural language in; you handle the mechanics)

Most people using this wiki are **not** technical and should never have to name a
file, a page type, or an operation. They talk in plain language; **you** map it to
the right operation above and do *all* the bookkeeping yourself (summary, affected
pages, `docs/wiki/index.md`, `docs/wiki/log.md`, contradiction flags). Translate intent into
the operation — don't make them specify it.

| The user says something like… | You run (without being told the steps) |
|---|---|
| "add this / save this / take a look at this" (+ a link, a file, or pasted text) | **INGEST** — if it's new material, first save it under `docs/raw/sources/` with a descriptive slug, then summarize and update every affected page |
| any question ("how does X work?", "is this worth it?") | **QUERY** — read `docs/wiki/index.md`, answer with citations, offer to save it if valuable |
| "review / clean up / is everything consistent?" | **LINT** |
| "compare X and Y" | write or update a `docs/wiki/comparisons/` page |

**Onboarding & the "help" affordance.** On first contact, orient the user in one or
two plain sentences (what this wiki is for; that they can just talk naturally). If
they ever say **"help"** / **"what can you do?"**, explain in plain language with a
few example phrases — never dump the schema at them.

**Guide, don't dump.** Move one step at a time; ask where they want to start; keep
answers digestible. When intent is ambiguous, ask **one** short, jargon-free
question — not a menu of technical options.

**Tone & language.** Clear and didactic, like explaining to a smart friend; define
any term you introduce; cite sources and flag uncertainty honestly. Write page
**content** in the user's language, but keep the **structure** (`type`, folder
names, `tags`) in English so the page-type system keeps working.

## Why it works

The tedious part of a knowledge base isn't reading or thinking — it's the
**bookkeeping**: updating cross-references, keeping summaries current, flagging
contradictions, staying consistent across dozens of pages. Humans abandon wikis
because maintenance cost outgrows the value. **LLMs don't forget to update a
cross-reference and can touch 15 files in one pass.** That's the whole unlock.

> "Vannevar Bush couldn't solve who does the maintenance. The LLM solves that." — Karpathy, on the Memex (1945)

## How this fits devmode

This is the devmode thesis applied to *knowledge* instead of code: **supply the
structure (the schema) and the LLM becomes a disciplined maintainer.** It pairs
with — but is independent of — devmode's code process. If this project also runs
devmode, the wiki is a sibling knowledge base, not part of the code phase machine.
Deployed and re-scaffolded by `/devmode wiki start|adopt`.

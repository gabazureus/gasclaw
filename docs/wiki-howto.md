# Your knowledge base — an LLM Wiki

A **living knowledge base** that an AI coding assistant builds and keeps
tidy *for you*. You feed it things you want to remember or understand — articles,
notes, transcripts, questions — and it turns them into an interlinked set of pages
that **gets richer over time** instead of starting from zero every time.

**You don't need to be technical.** You talk in plain language; the assistant does
the filing, cross-referencing, and tidying behind the scenes.

---

## ▶️ Start here

Open **Claude Code or Codex in this folder** and just talk to it. Good first things to say:

- **“What's in here / what is this?”** — it gives you the lay of the land.
- **“Help me get started.”** — it walks you in, one step at a time.
- Paste a link or some text and say **“add this to my wiki.”** — it studies and files it.
- Ask a real question you care about — it answers and shows where the answer came from.

That's it. No commands to memorize, no files to touch.

> Prefer to just read? Open this folder in [Obsidian](https://obsidian.md) (it
> follows the `[[links]]`) and start at [`docs/wiki/overview.md`](wiki/overview.md) and
> the catalog [`docs/wiki/index.md`](wiki/index.md).

---

## 💬 Talk to it in plain language

You speak normally; it figures out what to do:

| You say something like… | It does… |
|---|---|
| *“Add this — [paste a link or text].”* | studies it, summarizes it, and files it into the right pages |
| *“What do we know about ___?”* | answers from the wiki, citing the pages it used |
| *“Explain ___ simply.”* | explains it like you'd want a smart friend to |
| *“Compare ___ and ___.”* | builds a side-by-side page |
| *“Is everything still consistent?”* | reviews the wiki for contradictions and gaps, and tidies up |
| *“Where do I pick back up?”* | looks at where you left off and suggests the next step |

Notice there are **no file paths or technical commands** — that's the point.

---

## 🆘 If you're not sure what to ask

Just say **“help”** or **“what can you do?”** — the assistant will explain, in plain
words, what you can ask for and give you a few examples. You can never get stuck.

---

## 🌱 A gentle rhythm (all optional)

- **Today:** say *“help me get started”* and add one thing you already have.
- **When you find something good:** a link, an article, a note → *“add this.”*
- **Now and then:** *“review my wiki”* to keep everything consistent.

There's no schedule to keep. The base grows a little with every conversation.

---

## ⭐ Golden rules

1. **You talk; the assistant writes.** You don't edit the wiki pages yourself —
   ask for changes and it keeps everything consistent.
2. **What you feed it is kept as-is.** Sources you add are never altered, so the
   wiki always traces back to something real.
3. **It cites its sources.** If an answer matters, ask *“where does that come from?”*

---

## 🔧 If something feels off

| Situation | Just say… |
|---|---|
| It's being too long-winded | *“shorter, please”* / *“just the key points”* |
| It misunderstood you | *“let me rephrase”* — say it a different way |
| The wiki feels messy or out of date | *“run a review and tidy things up”* |
| You're not sure it remembered | *“what do you already know about this?”* |

---

<details>
<summary>🔩 <b>Under the hood</b> — for the curious (you do NOT need this to use it)</summary>

This base follows Andrej Karpathy's **LLM Wiki** pattern: **pure markdown — no app,
no database, no server.** It has three layers, and the assistant moves between them
for you automatically:

```
  You add something   ──►   the assistant files it   ──►   you ask, it answers
  (docs/raw/sources/)            (docs/wiki/ — the curated graph)     with citations
```

- **`docs/raw/sources/`** — where the raw things you add live (kept unchanged).
- **`docs/wiki/`** — the curated knowledge the assistant maintains (you read; it writes):
  a catalog ([`docs/wiki/index.md`](wiki/index.md)), a big-picture page
  ([`docs/wiki/overview.md`](wiki/overview.md)), and pages grouped by type.
- **`KARPATHY.md`** — the *schema* that turns the assistant into a disciplined
  maintainer (the page types and the three operations it runs for you: **ingest** a
  new source, **answer** a question, **review** the wiki). `CLAUDE.md` loads it
  automatically in Claude Code; `AGENTS.md` gives Codex the equivalent instruction.

You never have to name these — the assistant handles them. Full detail (page types,
frontmatter, the operation rules) lives in [`KARPATHY.md`](../KARPATHY.md), and the
drop-zone is the folder [`docs/raw/sources/`](raw/sources/).

> This is a git-friendly project — `git commit` after meaningful changes if you want
> a history.

</details>

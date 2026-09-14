# raw/ — immutable external sources (Karpathy strict)

The **ground truth** layer. You drop external material here; the LLM reads it but
**never edits it**. Nothing in `raw/` is modified after it lands — that's what
makes it trustworthy as the source of truth the wiki is compiled from.

```
raw/
├── sources/   ← drop external material here, then ask the LLM to "ingest" it
│   ├── transcripts/   (YouTube, podcasts, meetings)
│   ├── pdfs/          (papers, ebooks, articles)
│   ├── posts/         (saved threads/articles)
│   └── web-clips/     (clipped pages)
└── assets/    ← local images referenced by wiki pages
```

**Workflow:** drop a file → ask the LLM to ingest it → it writes
`wiki/sources/<slug>.md` and updates every affected page (see `KARPATHY.md`).
The subfolders above are a suggestion; create them as you start populating.

---
name: delegate-to-cli
description: >-
  Delegate a bounded implementation or analysis task to an external model CLI
  (e.g. OpenAI Codex `codex exec`, Google `gemini`) as a gray-box subordinate,
  then verify its output from the outside. Use when the user asks to "run
  codex", "use gemini", "delegate this to another model", or when a self-
  contained task (a refactor, an analysis, a well-specified function) is worth
  offloading to a cheaper/faster or differently-capable model. The interface and
  tests stay yours; the implementation is delegated and verified.
---

# Delegate to a CLI

Sometimes the right subordinate isn't a subagent in this session but an external
model CLI — `codex exec`, `gemini`, etc. This is the same gray-box contract as
[`subagent-driven-development`](../subagent-driven-development/SKILL.md) and
[`design-interface-delegate-implementation`](../design-interface-delegate-implementation/SKILL.md),
just with a different worker: **you own the interface and the tests; the CLI
fills the implementation; you verify from the outside.**

## When it's worth it

- The task is **bounded and well-specified** (a refactor, a focused analysis, a
  function with a clear contract).
- A different model is **cheaper, faster, or differently strong** for it.
- The interface and acceptance checks already exist, so you can verify the result
  without reading every line.

If the task isn't bounded, or the design isn't settled, don't delegate — align
first ([`grill-me`](../grill-me/SKILL.md), [`write-prd`](../write-prd/SKILL.md)).

## The contract

1. **Fix the interface and the tests first.** A gray box is only safe when its
   boundary is pinned. Without tests, you have no right to skip reading the output.
2. **Pick the sandbox deliberately.** Default to **read-only** for analysis;
   grant write access only when edits are the point; never grant broad/network
   access casually.
3. **Hand over constraints, not steps.** Give the CLI the contract, invariants,
   and acceptance criteria — let it choose how.
4. **Verify from the outside.** Apply
   [`verification-before-completion`](../verification-before-completion/SKILL.md):
   run the tests/types/build on the result. The CLI's summary is not evidence.
5. **Critical code is never a gray box.** Money, auth, security, irreversible
   effects → review the delegated output in full.

## Mechanics (examples)

These are illustrative; check each CLI's current flags before relying on them.

```bash
# Codex — read-only analysis (suppress thinking tokens on stderr)
codex exec --skip-git-repo-check --sandbox read-only "Review src/billing for race conditions" 2>/dev/null

# Codex — apply local edits to a bounded task
codex exec --skip-git-repo-check --sandbox workspace-write --full-auto \
  "Refactor parseDate to return Result<Date, ParseError>; keep the public signature" 2>/dev/null

# Gemini — analysis
gemini -p "Explain the data flow through the renewal pipeline in src/billing"
```

Capture stdout, then **run your own verification** on the working tree. Summarize
the outcome and the evidence — not the CLI's self-report.

## Red flags

- Delegating an unbounded or ill-specified task ("make it better").
- Granting write/network sandbox when read-only would do.
- Accepting the CLI's "done" without running the tests yourself.
- Delegating a critical (money/auth/security) module as a gray box.

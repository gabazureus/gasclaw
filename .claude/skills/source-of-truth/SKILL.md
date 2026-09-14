---
name: source-of-truth
description: >-
  Ground work in authoritative sources instead of training-data memory — check
  the actual installed version, read the official docs/source for the API you're
  using, and verify the pattern is current. Use when using an unfamiliar or
  fast-moving library/framework/API, when the user says "use library X", when
  code uses a deprecated/hallucinated method, or when behavior doesn't match what
  you "remember." The AI's memory is stale and confidently wrong; the docs and
  the installed code are not.
---

# Source of truth

The AI's most dangerous failure isn't "I don't know" — it's confidently writing a
plausible API call that doesn't exist, or a pattern that was correct two major
versions ago. Training data is a frozen, blurry snapshot; the **installed version
and the official docs are the truth.** When in doubt, look it up — don't recall.

## Establish the actual ground truth

- **Check the installed version**, not the latest you remember:
  `package.json`/lockfile, `pip show`, `go.mod`, etc. APIs differ across majors;
  code for v5 silently breaks on v4.
- **Read the real source/docs for what you're calling** — the official docs, or
  the actual code in `node_modules`/site-packages. If you're following a pattern,
  read the reference implementation *completely* (this is also a
  [`systematic-debugging`](../systematic-debugging/SKILL.md) rule).
- **Prefer primary sources** (official docs, the source, the changelog) over
  blog posts, Stack Overflow, and your own memory — and over a confident guess.

## Signals you're hallucinating an API

- A method/option that "should" exist but you haven't verified.
- Code that matches a *different* major version's style.
- "I'm pretty sure the signature is…" — uncertainty about a contract is a
  look-it-up trigger, not a guess trigger.
- Behavior that doesn't match what you expected → the docs changed, or you
  misremembered. Check before "fixing."

## How it fits

- It's the input side of [`confidence-check`](../confidence-check/SKILL.md): you
  aren't ready to build against a library until you've confirmed its real, current
  contract — not the one in your memory.
- It feeds [`api-design`](../api-design/SKILL.md) (design against the real
  upstream contract) and [`migration`](../migration/SKILL.md) (a version bump
  means re-checking what changed, via the changelog).
- It's a verification habit: cite the source, don't assert from recall
  ([`verification-before-completion`](../verification-before-completion/SKILL.md)).

## Process

1. Identify the libraries/APIs the task touches and their **installed versions**.
2. Read the official docs / source for the specific surface you'll use.
3. Write against *that*, not memory; note the version you targeted (an ADR if it
   constrains the design).
4. If something doesn't match, re-check the source before changing code.

## Red flags

- Writing a library call without confirming it exists in the installed version.
- Using a pattern from "how it used to work" after a major upgrade.
- Trusting a blog/SO snippet over the official docs.
- "Fixing" surprising behavior by guessing instead of reading the docs/source.
- **Emitting a command, flag, query, or config by copying a nearby example
  instead of its own definition.** The mundane call detail — a flag name, arg
  order, whether auth is a `--flag` or an env var — feels beneath verifying, so it
  ships unchecked and wrong; and topic-grouped docs quietly invite cross-applying
  a *sibling* command's flags onto yours. Check the invocation against the
  authoritative definition (the command's own `--help`/option list, the API
  schema, the real function signature), not prose docs and not the example that
  "looks right".

---
name: git-workflow
description: >-
  Use git as a clean, reviewable history — atomic commits, good messages,
  trunk-based branching, worktrees for parallel work, and safe operations. Use
  when committing, branching, structuring a PR, resolving conflicts, or when the
  user says "commit this", "branching strategy", "clean up history", "worktree",
  "how should I structure this PR". A readable history is a debugging tool and a
  review aid — and dangerous git ops are exactly what the guardrails block.
---

# Git workflow & versioning

Git history is documentation that the tooling can read: a clean, atomic history
makes `bisect` find a bug in minutes, makes review tractable, and makes reverts
surgical. A messy history hides the very information you'll need under pressure.

## Atomic commits

- **One logical change per commit** — it builds, tests pass, and it does *one*
  thing. A commit that mixes a refactor + a feature + a format pass can't be
  reviewed or reverted cleanly.
- **Message format:** `<type>(<scope>): <summary>` (feat/fix/refactor/test/docs/
  chore), then a body explaining the **why** (the *what* is in the diff).
- **Separate commits** for code, plan/doc updates, and formatting.

## Branching: trunk-based, short-lived

- Short-lived branches off trunk, merged fast and often; long-running branches
  accumulate painful conflicts.
- **Worktrees for parallel work** — `git worktree` gives an isolated checkout per
  task without stashing/switching, which pairs perfectly with
  [`subagent-driven-development`](../subagent-driven-development/SKILL.md)
  (each worker on its own files/worktree, no collisions).
- Keep trunk releasable; gate merges on CI ([`ci-cd-automation`](../ci-cd-automation/SKILL.md)).

## Resolving conflicts

When a merge or rebase stops on a conflict, **resolve it — never `--abort` to
escape**. Work it hunk by hunk:

- **Recover each side's intent from its primary source** — the commit message,
  the linked PR, the issue — not just the surrounding diff. You can't merge two
  changes correctly until you know *why* each was made.
- **Preserve both intents where they compose.** Where they genuinely conflict,
  keep the side that serves the *merge's stated goal* and note the trade-off in
  the commit body. Never invent new behavior at a conflict marker — a merge is
  not the place to sneak in a fix.
- **Re-run the project's checks after resolving** (typecheck → test → format); a
  conflict resolved wrong is a bug that still compiles. Then stage, commit, and
  finish the merge/rebase.

## Safe operations (the guardrails back these)

- **Never force-push a shared branch**; never `push --force` to main/master.
- **Don't `reset --hard` / `clean -f` / `checkout .`** without being sure — they
  destroy uncommitted work. The deterministic guardrail hook *asks* on these and
  *denies* force-push and `--no-verify` precisely because they're the costly
  mistakes.
- **Never `--no-verify`** to skip hooks; fix the failing hook instead.
- Prefer a new commit over amending shared history; prefer revert over rewriting.

## Reviewable PRs

- Keep PRs small and single-purpose — easier to review well (see
  [`code-review`](../code-review/SKILL.md)).
- Summarize **what changed AND what you deliberately did NOT touch** — the
  "didn't touch" line tells the reviewer where to *not* spend attention and
  surfaces scope creep.
- Link the spec/ADRs; attach verification evidence.

## Versioning

- Semantic-ish versioning: breaking / feature / fix. Tie a release to a tag +
  CHANGELOG; pair with [`shipping`](../shipping/SKILL.md).
- Breaking changes follow [`api-design`](../api-design/SKILL.md) + a deprecation
  window ([`migration`](../migration/SKILL.md)).

## Red flags

- A giant commit mixing unrelated changes; a message that says "fix stuff".
- Force-pushing a shared branch / pushing `--force` to main.
- `reset --hard` to "clean up" with uncommitted work present.
- `--no-verify` to dodge a failing hook.
- A 2,000-line PR doing five things.

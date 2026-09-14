---
name: doc-contracts
description: >-
  Maintain a hierarchical tree of local doc contracts (AGENTS.md-style) — a root
  index plus per-area files that govern their subtree — walked root-to-leaf
  before editing and updated right after meaningful changes. Use in medium/large
  or multi-team codebases, when agents keep violating local conventions they
  "couldn't have known", when per-area rules differ (this folder tests
  differently, deploys differently), or when the user says "AGENTS.md", "local
  rules", "per-folder docs", "keep the docs next to the code".
---

# Doc contracts (the AGENTS.md tree)

A single project-wide manifest can't carry every local rule of a real codebase —
and an agent that hasn't seen the *local* rules edits by guesswork. The fix is a
**tree of small doc contracts**: a root file holding project-wide rules and an
index, and per-area files holding the rules that only apply *there*. Each file
**governs its folder and everything nested under it** — a binding work contract
for that subtree, not a wiki page.

## The two disciplines that make it work

1. **Pre-edit traversal.** Before touching any file, walk the tree **from the
   root down to the area you'll edit**, reading each contract on the path. The
   applicable rules are the *union* of root + every parent + the nearest local
   file. Editing without the walk is how agents break conventions they were
   never shown.
2. **Post-edit pass.** After a meaningful change — to an area's purpose,
   structure, workflow, inputs/outputs, or quality bar — **update the closest
   owning contract** in the same change. A parent updates when a child's
   *structure* shifts (its index must stay true); a child updates when a parent's
   *rules* change. Docs that don't ride along with the diff rot immediately.

## Writing the contracts

- **Broad rules in parents, concrete detail in children.** The root says "all
  modules are functional-core/imperative-shell"; the child says "in `billing/`,
  the shell is `shell.py` and the store seam is `store.Repo`".
- **Stable contracts, not histories.** A contract states how to work *here, now*
  — decisions and their *why* live in ADRs
  ([`documentation`](../documentation/SKILL.md)); change history lives in git.
  **Delete stale content immediately**; a wrong rule is worse than no rule.
- **Each parent indexes its children** (one line each: path + what it covers),
  so the tree is walkable without `ls -R`.
- **Keep each file small** — a contract an agent reads *every time* it works in
  the area must cost almost nothing to read
  ([`context-engineering`](../context-engineering/SKILL.md): the nearest
  contract + its parents is exactly the curated brief a subagent needs).

## How it fits devmode

- The [`module map`](../ubiquitous-language/SKILL.md) is the *project-wide*
  picture (boundaries, responsibilities); doc contracts are its **local layer** —
  the per-area rules that don't belong in a global file.
- It's [`source-of-truth`](../source-of-truth/SKILL.md) applied to your own
  repo: the nearest contract outranks memory of "how this area works".
- Delegation: a subagent brief = task + nearest contract + parents on the path
  ([`subagent-driven-development`](../subagent-driven-development/SKILL.md)) —
  the tree makes the minimal-brief construction mechanical.

## When it earns its keep (and when not)

Worth it when the codebase is big enough that areas have *different* rules, when
several agents/people work in parallel, or when onboarding cost keeps repeating.
**Overkill for a small single-module project** — there, the root manifest + the
module map already carry everything; don't scaffold empty ceremony.

## Process

1. Root file: project-wide rules + index of child contracts.
2. Add a child contract where an area's rules genuinely diverge — not before.
3. Before any edit: walk root → area; read every contract on the path.
4. After a meaningful change: update the closest owning contract (and the parent
   index if structure moved) **in the same commit**.
5. Prune: delete rules that stopped being true the moment they stop being true.

## Red flags

- Editing a subtree without reading its contract path ("couldn't have known" =
  didn't walk).
- A contract that narrates history or aspirations instead of current rules.
- A parent index that lists children that moved or died (the tree lies).
- Doc updates batched "for later" instead of riding the change that caused them.
- Scaffolding contracts in every folder of a tiny repo (ceremony without divergence).

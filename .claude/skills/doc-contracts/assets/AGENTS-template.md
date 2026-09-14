# AGENTS.md — <area name> (doc contract for this subtree)

> This file governs `<this folder>/` and everything nested under it. Read it —
> plus every parent AGENTS.md up to the root — **before editing here**. Update it
> in the same commit as any change to this area's purpose, structure, workflow,
> inputs/outputs, or quality bar. Stable contract, not history: delete anything
> that stops being true.

## Purpose
<one or two lines: what this area is for, in ubiquitous-language terms>

## Local rules (only what diverges from the parents)
- <e.g. "the pure core is `core.py`; never import I/O into it">
- <e.g. "tests live in `tests/test_<module>.py`; run with `PYTHONPATH=src`">
- <e.g. "this module is money-critical: review in full, never gray-box">

## Interfaces (what the rest of the system may call)
- `<function/endpoint signature>` — <one line>

## Child index (subtrees with their own contracts)
- `<child-folder>/AGENTS.md` — <one line: what it covers>
<!-- keep this index true: update it whenever a child is added/moved/removed -->

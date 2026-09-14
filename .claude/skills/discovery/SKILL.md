---
name: discovery
description: >-
  Reverse-engineer an existing codebase into devmode's starting artifacts —
  walk the tree, detect stack/frameworks, map the modules, extract the domain
  glossary, and synthesize a design concept + architecture overview, every claim
  tagged by confidence (🟢 confirmed / 🟡 inferred / 🔴 gap). Use when adopting
  devmode into an existing/legacy/unfamiliar project (`/devmode adopt`), when the
  user says "understand this codebase", "discovery", "what is this project",
  "onboard me to this repo", "map the architecture". Produces the seed the
  orchestrator's grill phase then sharpens — it targets the 🔴 gaps.
---

# Discovery (codebase reverse-engineering)

A new project starts from a blank page; an *existing* one starts from a fog. This
skill lifts the fog into devmode's starting artifacts so the process can begin
with a real, shared understanding instead of a guess. It's LLM-driven *reading*
(no parser needed) — language-agnostic by construction — and every claim carries
a **confidence tag** so the human knows what's solid vs. assumed.

**Confidence scale (tag every claim):** 🟢 **confirmed** (read it in the code),
🟡 **inferred** (likely, from naming/structure), 🔴 **gap** (unknown — needs the
human). The 🔴s become the targets for the [`grill-me`](../grill-me/SKILL.md) gate.

## Reading a repo is not permission to run it

Discovery is **read-only by default** — and this matters most exactly where it's
used: pointed at somebody else's codebase. "Review this repo" authorises reading
files, listing the tree, and reading existing CI results. It does **not**
authorise installing dependencies or executing the project's tests, builds,
linters, benchmarks, migrations, generators, or scripts. Running an unfamiliar
repo's own commands executes *its* code on your machine — a postinstall hook and
a test fixture are arbitrary code — so **ask before running any of it**, even
when the command looks routine.

Two more boundaries while you read: never print or summarise the contents of
secret files (`.env*`, keys, `credentials.*`, token stores, prod dumps) — report
only that they exist and flag the handling; and prefer discovery commands that
skip dependency folders, build output, and VCS metadata.

## The four passes

### 1. Scout — the surface
Walk the tree (skip `node_modules`, `.git`, `dist`, `build`, `coverage`,
`__pycache__`, `vendor`). Establish:
- **Stack & frameworks** — read the manifests (`package.json`, `requirements.txt`,
  `pyproject.toml`, `go.mod`, `pom.xml`, `Gemfile`, `Cargo.toml`, `composer.json`)
  for languages, deps, scripts, versions.
- **Entry points & runtime** — main/index, server bootstrap, CLI, Dockerfile, CI.
- **Shape** — top-level layout, where the code lives, test setup, config.
- **Module-org signals** — routing → endpoints, domain folders → modules, schema/
  models → entities. These seed the module map.
Output: a structured surface summary.

### 2. Map — the modules (→ UBIQUITOUS_LANGUAGE.md)
From the surface, read the major modules and build the **module map**: each deep
module, its responsibility, its public interface, what it depends on — exactly
the table [`ubiquitous-language`](../ubiquitous-language/SKILL.md) wants. Read
one module per pass to preserve context; don't skim the whole repo at once.

**Read the highest-fan-in module first** — the hub most others name in their
`Depends on` cells — before the leaves; that's where the design concept
concentrates, so later modules are read with it in hand. (Fan-in by eye over the
`Depends on` column — no graph engine.) Tag it 🟡: the biggest hub is often a
god-object or `utils` dump — a smell to break up, not a design to revere.

### 3. Domain — the glossary (→ UBIQUITOUS_LANGUAGE.md)
Extract the **terms** half of the ubiquitous language: the domain nouns/verbs the
code uses (entities, states, key operations), each tied to its `in code as`
representation. Surface implicit business rules and invariants you can see, and
resolve synonyms/conflicts. Tag inferred rules 🟡 and unknowns 🔴.

### 4. Synthesize — the design concept + architecture (→ DISCOVERY.md)
Write a concise discovery doc:
- **Purpose** — what this system is and the problem it solves (the "soul").
- **Design concept (provisional)** — the agreed theory of the system, as best you
  can reconstruct it — the *starting point* for grilling, not the final word.
- **Architecture** — components and how they fit (a simple diagram is fine),
  policy-vs-detail boundaries ([`architecture-boundaries`](../architecture-boundaries/SKILL.md)),
  data model, integrations.
- **Readiness read** — *can this code be safely changed?* Two qualitative signals,
  each tagged 🟢/🟡/🔴: the **test safety-net** (is there coverage you can refactor
  *behind*, or none?) and **operational readiness** (does CI show it building,
  linting and running — read the config and the last run rather than executing
  it — and is there a deploy path?). Close with a **recommended first move** — the
  safest place to start given the risk surface (e.g. 🔴 *no tests around the money
  path* → write characterization tests *before* any change). Keep it qualitative —
  **never a 0–100 score** (devmode rejects gameable metrics; the tags carry the
  honesty a number would launder away).
- **Risks & gaps** — tech debt, the 🔴 unknowns, and anything surprising.
- **Inspection scope note** — how much of the repo this reading actually covered:
  what you **mapped**, what you **read deeply**, what you only **sampled**, and
  what you **deliberately skipped**. On a large repo a discovery is always
  partial; saying which parts are partial is the difference between a map and a
  map that lies. Skipping something on purpose is fine — skipping it silently
  turns "not observed" into "absent" for whoever reads this next.

## How it feeds devmode

Discovery produces the inputs the rest of the process assumes existed:
- `UBIQUITOUS_LANGUAGE.md` — seeded with the **terms + module map** (passes 2–3).
- `DISCOVERY.md` — the architecture + provisional design concept + **readiness
  read** (pass 4).
- A **🔴-gap list** → the orchestrator's [`grill-me`](../grill-me/SKILL.md) gate
  resolves these *with the human* before any change. Discovery proposes; the
  human confirms — never treat 🟡/🔴 as fact.
- The **readiness read + recommended first move** → the **ALIGN** gate plans the
  approach around the real risk surface: a 🔴 test safety-net means *write the net
  before you change the code* (characterization tests first), not "refactor and
  hope" — exactly what [`tdd`](../tdd/SKILL.md) and
  [`testing-principles`](../testing-principles/SKILL.md) need decided up front.

Then the normal flow continues: a change starts from a *real* design concept and
a current module map, and [`impact-analysis`](../impact-analysis/SKILL.md) has a
map to work from.

## Rules

- **Read, don't guess** — a 🟢 claim means you read it; otherwise tag 🟡/🔴.
  ("not observed" ≠ "absent" — see [`testing-principles`](../testing-principles/SKILL.md).)
- **One module at a time** — preserve context ([`context-engineering`](../context-engineering/SKILL.md));
  don't try to hold the whole repo at once.
- **Provisional, not authoritative** — discovery is the *starting* understanding;
  the human validates the inferences. Don't let the orchestrator skip the grill.

## Red flags

- Stating an inferred behavior as fact (untagged) → drift from the first step.
- Trying to read the entire codebase in one pass (context overflow, shallow map).
- Producing a glossary/architecture doc with no 🔴 gaps (you under-looked — every
  real legacy system has unknowns).
- Declaring a codebase ready to change without a **test-safety-net read** — the
  first refactor then runs with no net, and you find out the hard way.

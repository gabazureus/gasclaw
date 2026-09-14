---
name: improve-codebase-architecture
description: >-
  Fight software entropy by consolidating shallow modules into deep ones —
  lots of functionality behind a simple interface — so the codebase stays easy
  to change and easy for AI to navigate. Use this when a codebase feels
  scattered or hard to follow, when the AI keeps failing to locate the right
  code or misunderstands dependencies, when there are many tiny files/functions
  with complex interfaces, when changes cause unexpected bugs elsewhere, or
  when the user mentions "refactor the architecture", "too many small modules",
  "deep modules", "this is hard to change", "reduce complexity", or
  "clean up the structure". Run it before complexity compounds.
---

# Improve codebase architecture

A good codebase is one that is **easy to change** (Ousterhout: complexity is
anything that makes a system hard to understand and modify). Codebases drift
toward the opposite — software entropy — because every change optimizes the
change in front of it rather than the design of the whole. AI accelerates this:
it's very good at producing lots of small, shallow modules, and a codebase made
of them is hard for *both* humans and AI to navigate, so changes get slower and
buggier over time.

This skill reverses that drift by reshaping shallow modules into **deep
modules**.

## Shallow vs. deep modules

- **Shallow module:** little functionality behind a relatively complex
  interface. Lots of tiny blobs that expose many functions and leak their
  internals. A caller (or an AI) has to walk through many of them and understand
  all their dependencies to do anything — so it often fails to find the right
  one or misreads how they connect.
- **Deep module:** a lot of functionality hidden behind a *simple* interface.
  The complexity lives inside, where it's encapsulated. Callers use the
  interface and ignore the inside. You *can* open it, but you rarely need to.

The goal is **few large deep modules with simple interfaces**, not many small
shallow ones. The same code, reorganized behind clean boundaries, becomes
navigable and testable instead of scattered.

## The procedure

This is a repeatable, reversible refactor. Take small steps and keep tests green
throughout — never reshape architecture without a safety net.

1. **Map what exists, and the blast radius.** Scope before you scan (YAGNI):
   deepening a module only pays off where future changes land, so weight the parts
   of the codebase that keep changing. Unless the user named a target, walk a good
   stretch of `git log` for hot spots — the files that keep coming up — and let
   those pull your attention first; if churn is scattered with no clear hot spot,
   widen the net. Then explore the codebase and list the
   current modules, their public surfaces, and their dependencies. Note where
   logic for one concept is smeared across many files, and where modules expose
   internals they shouldn't. Before moving anything, run
   [`impact-analysis`](../impact-analysis/SKILL.md) on the cluster you'll touch —
   who depends on it, what breaks, any cycles or orphans — so the refactor is
   bounded rather than a leap.
2. **Find clusters of related code.** Look for code that changes together,
   shares data, or serves one
   [`ubiquitous-language`](../ubiquitous-language/SKILL.md) concept but lives in
   separate shallow pieces. Those clusters are candidate deep modules. Apply the
   **deletion test** to anything that looks shallow: imagine deleting it. If the
   complexity simply vanishes, it was a pass-through — delete it, don't deepen it.
   If the complexity reappears, scattered across N callers, it was earning its keep
   and belongs behind one deep interface.
3. **Design the simple interface first.** For each candidate, decide the small
   public surface that should remain — the contract callers need. Everything
   else becomes internal. Design this deliberately; it's the lid of the box (see
   [`design-interface-delegate-implementation`](../design-interface-delegate-implementation/SKILL.md)).
4. **Pin behavior with tests at that interface.** Before moving code, add or
   confirm tests that exercise the intended public interface, so the refactor is
   verifiable from the outside. Use
   [`testing-principles`](../testing-principles/SKILL.md) to choose the boundary.
5. **Consolidate behind the boundary.** Move the related code inside the new
   module, hide what was leaking, and reduce the public surface to the designed
   interface. Where logic and I/O are tangled inside the cluster, apply
   [`functional-core/imperative-shell`](../functional-core-imperative-shell/SKILL.md)
   so the deep module has a pure, testable heart.
6. **Re-point callers and delete the cruft.** Update call sites to the new
   interface and remove the now-dead shallow scaffolding. Don't leave
   compatibility shims or commented-out husks — that's entropy by another name.
7. **Run the loop again.** Tests green, types clean. Repeat on the next cluster.

## What "better" looks like

- Fewer modules, each doing more, each with a smaller public surface.
- A new reader (or AI) can find the code for a concept in one place.
- Changing one concept touches one module, and the change doesn't ripple
  unexpectedly into others.
- Tests sit at stable interfaces and survive internal refactors.

## When to reach for this

- The AI repeatedly explores but lands in the wrong place or misjudges
  dependencies — a strong signal the structure is too shallow to navigate.
- A small change keeps breaking distant code (high coupling, leaked internals).
- Tests are brittle because they bind to scattered internals rather than a
  boundary.
- You're about to build on top of an area — improve its architecture *first*, so
  you build on solid ground rather than compounding the entropy.

Do this *before* complexity compounds. The earlier you consolidate, the cheaper
it is — and the more of AI's bounty you can actually collect, because AI does
genuinely well in a clean, deep-module codebase.

**Related:** when the rot is system-level (logic welded to the framework/DB,
changes rippling everywhere), reach for
[`architecture-boundaries`](../architecture-boundaries/SKILL.md). When a cluster
of conditionals-on-type or a subclass explosion is the smell, a
[`design pattern`](../design-patterns/SKILL.md) may deepen the module — but only
if it reduces complexity, never as decoration.

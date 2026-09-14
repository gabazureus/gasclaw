---
name: frontend-ui-engineering
description: >-
  Build production-quality UI — component architecture, the state-management
  decision ladder, responsive layout, and escaping the generic "AI aesthetic."
  Use when building or reviewing front-end components, choosing where state
  lives, when a UI "looks AI-generated" (purple gradients, everything rounded),
  when the user mentions "build the UI", "this component", "React/Vue/Svelte",
  "make it look good", "responsive", "design system". Pair with ux-design (visual
  decisions) and accessibility (a11y is not optional).
---

# Front-end UI engineering

Front-end is where "works" and "is good" diverge most: a component can pass its
tests and still be unusable, inaccessible, or instantly recognizable as
AI-slop. This skill is the production bar. It's framework-shaped (React/Vue/
Svelte/etc.) but the decisions below are framework-agnostic.

## Escape the "AI aesthetic"

Before any pixel, **declare the read** in one line — *"Reading this as: \<page
kind> for \<audience>, with a \<vibe>"* (e.g. "B2B SaaS landing for technical
buyers, Linear-style minimalist"). Naming it is what stops you defaulting to the
generic. AI UIs have a *tell*; recognize and kill the defaults:

| AI default | Why it's a problem | Production quality |
|------------|--------------------|--------------------|
| AI-purple/indigo, neon glows, gradient overload | Generic, off-brand, dated | One restrained accent (<80% sat); gradients on purpose |
| Drop-shadow on every element | Visual noise, no hierarchy | Elevation only where it signals layering |
| Everything `rounded-2xl` | No intent, toy-like | ONE radius system, tied to role |
| Centered single column; 3 equal feature cards | No rhythm — the formula | Real layout: grid, asymmetry, zig-zag, varied families |
| Default `Inter`+slate; default serifs (Fraunces, Instrument Serif) | The recognizable LLM type stack | A typeface chosen to fit the brand |
| Emoji or hand-rolled SVG as icons | Inconsistent, unprofessional | A real icon set |
| "John Doe" / "Acme" / filler verbs ("Elevate") / fake-precise numbers / `<div>` fake screenshots | Screams generated | Believable demo names/brands; never fabricate a stat/proof — real value, honest placeholder, or drop the slot |

The fix isn't "more polish" — it's *intent*: every choice maps to a design
decision (see [`ux-design`](../ux-design/SKILL.md)), not a library default.

### Tune deliberate dials, fight repetition

"Escaping the aesthetic" needs a *positive* mechanism, not just a list of don'ts.
With the read declared, **tune three dials to it** instead of the safe middle:

- **Layout variance** — how far from the conventional grid/hero/card you push.
  Low for a dashboard/tool; high for a landing/brand page. The generic default is
  *always* the same low-variance layout — vary it on purpose.
- **Motion intensity** — none for dense tools; purposeful, restrained motion for
  marketing surfaces. Motion communicates state and hierarchy, never decoration.
- **Visual density** — information per viewport: high for a power-user table, low
  for an onboarding screen. Match the user's job, not a template.

And **fight repetition**: if every section is the same hero-then-three-cards, you
shipped the formula. Vary rhythm, alignment, and component shape down the page. For
a non-trivial surface, **prototype the look first** — a mockup or two real variants
([`prototyping`](../prototyping/SKILL.md), [`visual-explainers`](../visual-explainers/SKILL.md)) —
then build the chosen one. Choosing between real options beats defending the first.

### Lock consistency, motivate motion, pre-flight the tells

- **Consistency locks** — ONE accent, ONE radius system, ONE page theme
  (light/dark/auto), each applied across the *whole* page. A teal badge on a
  rose-accented site or a round button in a square layout reads as broken.
- **Motion is motivated** — only add an animation you can justify in one sentence
  (hierarchy, feedback, a sequence matching a story). Animate `transform`/`opacity`
  only, honor `prefers-reduced-motion`, never drive it off a scroll-event listener.
  "Motion claimed = motion shown": dial it up only if you ship it, else go static.
- **Pre-flight the tells** — before "done", *mechanically* scan the output for the
  tells above (grep for em-dashes — a top LLM copy tell — for `John Doe`, for
  `text-purple`). A tell you can grep is a tell you must fix
  ([`verification-before-completion`](../verification-before-completion/SKILL.md)).

### Redesigning existing UI

A redesign is not a greenfield. First decide the mode — *preserve* (modernize the
brand) vs *overhaul* (new visuals, same content) — and **audit before touching**:
extract the brand tokens, the information architecture, and what works vs. what's
filler. Modernize by the cheapest lever first (typography → spacing → color →
motion → recompose). **Never silently change** URL/route slugs, nav labels, form
field names, or accessibility wins — SEO and analytics downstream depend on them.
It's a [`migration`](../migration/SKILL.md) with an
[`impact-analysis`](../impact-analysis/SKILL.md), not a repaint.

## The state-management decision ladder

Most front-end complexity is misplaced state. Put state at the *lowest* level
that works; climb only when forced:

1. **Local component state** — used by one component. Start here.
2. **Lifted state** — shared by a few siblings → lift to the nearest common parent.
3. **Context / provider** — cross-cutting, low-frequency (theme, current user).
   Not for high-frequency updates (re-render storms).
4. **URL state** — anything that should survive refresh/sharing (filters, tab,
   page). The URL is underused state.
5. **Server state** — data that lives on the server → a query/cache layer
   (dedupe, caching, invalidation), *not* hand-rolled in a global store.
6. **Global client store** — last resort, for genuinely global client-only state.

Pushing server data into a global store is the most common mistake — it
re-implements caching badly. Treat the server as the source of truth and cache it.

## Component architecture

- **Deep components, simple props** — the [`deep module`](../improve-codebase-architecture/SKILL.md)
  idea applied to UI: a small, clear prop interface hiding internal complexity.
  Avoid prop-drilling and 15-prop "god components."
- **Separate the functional core** — keep formatting/derivation/decision logic
  pure and testable, away from rendering and effects
  ([`functional-core-imperative-shell`](../functional-core-imperative-shell/SKILL.md)).
- **Composition over configuration** — prefer composable pieces to one component
  with a boolean for every variant.
- **Name in the [`ubiquitous language`](../ubiquitous-language/SKILL.md).**

## Non-negotiables

- **Accessibility is part of "done", not a later pass** — semantic elements,
  labels, keyboard operability, focus management. See
  [`accessibility`](../accessibility/SKILL.md).
- **Responsive by default** — design mobile-up; test the real breakpoints.
- **Loading / empty / error states exist** — the happy path is a third of the UI;
  design the other two-thirds.
- **Look at it run** — verify in a real browser ([`feedback-loops`](../feedback-loops/SKILL.md),
  [`browser-testing`](../browser-testing/SKILL.md)); screenshots and the DOM are
  the feedback loop for UI.

## Red flags

- A `<div onClick>` where a `<button>` belongs (kills keyboard + a11y).
- State lifted to global "to be safe."
- A component that renders, fetches, transforms, and decides — split it.
- "It looks fine to me" with no browser check across breakpoints.

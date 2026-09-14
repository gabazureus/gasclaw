---
name: ux-design
description: >-
  Make deliberate visual and interaction design decisions — design tokens,
  visual hierarchy, layout, spacing rhythm, typography, and interaction states —
  so a UI looks intentional, not defaulted. Use when designing a screen or
  component's look-and-feel, building or extending a design system / token set,
  when the user says "design this", "make it look intentional", "what colors/
  spacing/typography", "design tokens", "visual hierarchy". The design layer
  above frontend-ui-engineering (how it's built) and accessibility (who can use it).
---

# UX & visual design

Front-end engineering answers *how it's built*; this answers *what it should
look and feel like, and why*. The goal is **intent**: every color, size, and
spacing value should trace to a decision, not a library default. Design is the
difference between "works" and "feels right."

## Design tokens — decisions, not magic numbers

Express the design as a small set of named tokens, then build only from them.
Hardcoded hex/px values scattered through components are the design equivalent of
shallow modules — impossible to change coherently.

- **Color:** a restrained palette — a brand/primary, a neutral ramp (not pure
  black/white), semantic colors (success/warn/error/info), and *enough* contrast
  (see [`accessibility`](../accessibility/SKILL.md)). Avoid the AI-default
  purple-gradient look.
- **Spacing:** one scale (e.g. 4-based: 4/8/12/16/24/32…). Consistent rhythm
  reads as "designed"; arbitrary margins read as "generated."
- **Typography:** a type scale (sizes + weights + line-heights), one or two
  families, deliberate measure (line length). Hierarchy comes from the scale,
  not random font sizes.
- **Radius / elevation / motion:** small scales tied to *role* (a card vs. a
  button vs. a modal), not applied uniformly.

## Visual hierarchy — guide the eye

A screen should answer "where do I look first?" instantly.

- **One primary action per view.** Make it visually dominant; demote the rest to
  secondary/tertiary. Two equal-weight CTAs = no hierarchy.
- **Size, weight, color, and space** create rank — use them intentionally, and
  use *fewer* of them per view (restraint reads as confidence).
- **Group by proximity and alignment.** Related things sit close and aligned;
  whitespace is structure, not waste. Make it checkable: keep within-group
  spacing at most half the between-group spacing (a ~2:1 gap), so grouping is
  visible, not implied. Uniform spacing everywhere destroys grouping — the #1
  spacing tell.
- **Density to match the task** — a dashboard and a landing page want opposite
  densities; choose deliberately.
- **Cap what the eye must hold.** Working memory tops out around four items — keep
  any single group or decision point to ~4 visible options and push the rest behind
  progressive disclosure (categories, a "more", a second step). Co-locate
  everything one decision needs so the user never has to carry state across
  screens. Cut anything that adds effort without adding meaning.

## Interaction & states

A control isn't designed until all its states are:

- **Every interactive element:** default, hover, focus (visible!), active,
  disabled, loading. Missing focus states is both a UX and an
  [`accessibility`](../accessibility/SKILL.md) failure.
- **Every data view:** loading, empty (with a helpful next step), error
  (recoverable), and populated. The empty state is a design opportunity, not an
  afterthought.
- **Feedback & motion:** confirm actions; use motion to explain change (enter/
  exit, state transitions), briefly and purposefully — not decoration.
- **Forgiving by default:** confirm destructive actions, allow undo, preserve
  input on error.

## Interface copy — words are part of the design

A great layout with defaulted copy still reads as generic. Visible text is a
design surface; write it, don't leave it.

- **Buttons and links name the action** — "Save changes", "Delete account",
  "Email me the report" — never "OK", "Submit", or "Click here". Link text must
  make sense read on its own (out of context, in a screen-reader link list).
- **Error messages have three parts:** what broke, why (briefly), and what to do
  next. No "Oops!", no jokes on a frustration path.
- **Empty states have three beats:** what's empty, why it matters, and the one
  next action (a real control, not just prose).
- **Loading copy scales with the wait:** nothing for an instant, a spinner for a
  second, a "still working…"/progress message for anything long.
- **Placeholders show the format, not the instruction** ("MM/YYYY", not "Enter
  your card date") — and are never the only label (see
  [`accessibility`](../accessibility/SKILL.md)).
- **Validate on blur, then re-validate on change** — not on every keystroke.
- **Ban empty marketing openers** — "Unleash", "Supercharge", "Seamless", "Where
  X meets Y". Say what the thing does, concretely.

## Content integrity — don't fabricate to fill a slot

Layout follows *real* content. Never invent a fact to fill a design slot — a stat,
a testimonial, a logo, a review count. If the user didn't supply it, do exactly one
of three things:

- **Use a real value.**
- **Drop in an honest placeholder that reads as one** — a labelled `—` block with
  a TODO, alt text naming the intended subject, or a single swap-in-one-place
  constant. The number-shaped *hole* is honest; a fabricated number is slop.
- **Remove the slot** — a proof/stats layout with no real proof is the *wrong
  layout*, not a layout to fake. Fake social proof is worse than none.

(Illustrative demo copy in a mockup can be believable filler; a claim a user would
act on cannot.)

## Process

1. **Start from the user's goal and content**, not a blank canvas — what must
   they accomplish, what's the most important thing on this screen?
2. **Set/extend the tokens** before styling components, so choices stay coherent.
3. **Establish hierarchy** (primary action, reading order) before polish.
4. **Design all the states**, not just the happy path.
5. **Critique it** — run [`design-critique`](../design-critique/SKILL.md) (and a
   real-browser look) before calling it done.

## Red flags

- Hardcoded colors/spacing instead of tokens → can't restyle coherently.
- Two or more competing primary actions → flat hierarchy.
- Only the happy/populated state designed.
- "Polish" added (shadows, gradients, rounding) without a hierarchy reason.
- Contrast or focus states ignored — that's an accessibility defect, not a taste call.
- A stat / testimonial / logo slot filled with an invented value → fabrication, not design.
- Buttons/links reading "OK", "Submit", or "Click here" → the label names the widget, not the action.
- Error copy that says what broke but not what to do next; jokes or "Oops!" on a failure path.

> Authored for devmode to fill the design/UX gap that imported skill packs leave
> (they fold design into front-end). Pairs with frontend-ui-engineering,
> accessibility, and design-critique.

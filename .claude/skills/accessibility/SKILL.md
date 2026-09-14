---
name: accessibility
description: >-
  Build interfaces usable by everyone — WCAG 2.1 AA: semantics, keyboard
  operability, focus management, contrast, labels, and screen-reader support.
  Use when building or reviewing any UI, when the user mentions "accessibility",
  "a11y", "screen reader", "keyboard navigation", "WCAG", "contrast", "ARIA", or
  before shipping front-end work. Accessibility is part of "done", not a later
  pass — and many a11y wins are also plain usability and SEO wins.
---

# Accessibility (WCAG 2.1 AA)

Accessibility isn't a feature for a minority — it's the baseline that makes a UI
usable by people with disabilities, on assistive tech, on a keyboard, in bright
sun, with a broken mouse. It's also a legal requirement in many contexts. Treat
it as part of "done", verified, not a checkbox someone files later.

The guiding frame is **POUR**: Perceivable, Operable, Understandable, Robust.

## The non-negotiable checklist (WCAG 2.1 AA)

**Semantics & structure**
- Use **native semantic elements** (`button`, `a`, `nav`, `main`, `h1–h6`, `ul`,
  `label`) before reaching for ARIA. A `<div onClick>` is not a button.
- **One `h1`** per page; headings nest in order (no skipping levels).
- **Landmarks** (`header`/`nav`/`main`/`footer`) so screen-reader users can jump.
- **ARIA only to fill gaps** — "no ARIA is better than bad ARIA." Don't override
  native semantics.

**Keyboard (Operable)**
- **Everything works with the keyboard alone** — tab to it, activate with
  Enter/Space, no mouse-only interactions.
- **Visible focus indicator** on every interactive element (never `outline:none`
  without a replacement).
- **Logical tab order**; manage focus on route change, modal open/close (trap +
  restore), and dynamic content.
- **Skip-to-content** link for keyboard users.

**Perceivable**
- **Contrast:** text ≥ **4.5:1** (≥ 3:1 for large text); UI/icon contrast ≥ 3:1.
- **Text alternatives:** meaningful `alt` for informative images; `alt=""` for
  decorative. Icons-as-buttons need an accessible name.
- **Don't rely on color alone** to convey meaning (add text/icon/pattern).
- **Respect `prefers-reduced-motion`**; don't auto-play/flash.

**Forms & names**
- **Every input has a programmatic `<label>`** (not just a placeholder).
- **Errors** are announced, tied to the field, and describe how to fix.
- **Accessible names** for all controls (buttons, links, icon buttons).

**Understandable & Robust**
- Page has a `lang`; titles are descriptive.
- Dynamic updates use `aria-live` where appropriate (and nothing more).
- Don't break browser/AT behavior — test with the actual tools.

## How to verify (not assume)

- **Keyboard-only pass:** unplug the mouse; can you reach and operate everything,
  with visible focus?
- **Screen-reader pass:** VoiceOver/NVGA — is each control announced with a name
  and role?
- **Automated scan** (axe / Lighthouse) catches the mechanical ~30–40% — run it,
  but it is a floor, not proof. ("not observed" ≠ "accessible", see
  [`testing-principles`](../testing-principles/SKILL.md).)
- **Contrast check** the actual token values.

Pair with [`frontend-ui-engineering`](../frontend-ui-engineering/SKILL.md) (build
it accessibly) and [`ux-design`](../ux-design/SKILL.md) (focus states + contrast
are design decisions, not retrofits).

## Red flags

- `<div>`/`<span>` with click handlers instead of `button`/`a`.
- `outline: none` with no visible focus replacement.
- Placeholder used as the only label.
- Color the sole carrier of meaning (red/green status with no text).
- A modal that doesn't trap focus or restore it on close.
- "Lighthouse says 100" treated as fully accessible (it isn't).

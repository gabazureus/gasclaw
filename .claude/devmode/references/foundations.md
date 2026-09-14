# Foundations

The ideas underneath the devmode process. Read this to understand *why* the
skills and agents are shaped the way they are. Everything here traces back to a
small set of long-standing software engineering principles — the claim of this
process is that AI makes those principles matter *more*, not less.

## The thesis: code is not cheap

There is a popular belief that, in the AI age, **code is cheap** — so you can
write a spec, generate code, and never look at the code itself. This process
rejects that belief. **Bad code is the most expensive it has ever been**,
because a codebase that's hard to change is a codebase where AI can't deliver
its bounty. In a clean codebase AI compounds your output; in a complex one it
compounds the mess. So good codebases — and the software fundamentals that
produce them — matter *more* now, not less.

There's a cycle underneath this, and it runs both ways. A good codebase is easy
to test, so it has strong feedback loops; strong feedback loops let the AI
self-correct and produce better code; better code keeps the codebase good. A bad
codebase is the same loop in reverse — hard to test, weak feedback, worse AI
output, more entropy. The whole process is an effort to keep you on the virtuous
side of that cycle.

## Complexity (A Philosophy of Software Design — John Ousterhout)

> Complexity is anything related to the structure of a software system that
> makes it hard to understand and modify.

A **good codebase is one that is easy to change.** If you can't change it
without causing bugs, it's bad — regardless of how it was produced. This is the
yardstick the whole process optimizes for, and it's why
[`improve-codebase-architecture`](../skills/improve-codebase-architecture/SKILL.md)
and the `complexity-reviewer` agent exist.

Ousterhout's design recommendation: **deep modules over shallow ones** — a lot
of functionality hidden behind a simple interface, with complexity encapsulated
inside. Shallow modules (little logic, complex/leaky interfaces) are what AI
tends to produce and what makes a codebase hard for humans *and* AI to navigate.

## Software entropy (The Pragmatic Programmer — Hunt & Thomas)

Systems tend toward disorder. Every change that optimizes only for the change in
front of it — ignoring the design of the whole — makes the codebase a little
worse. Run that loop enough times and you get collapse. This is exactly the
"specs-to-code" failure: recompile, get worse code, repeat. The antidote is to
**invest in the design of the system on every change**, not just add features.

The Pragmatic Programmer also gives the rule behind the feedback skills: **don't
outrun your headlights.** The rate of feedback is your speed limit — take small,
deliberate, verified steps.

## The design concept (The Design of Design — Frederick Brooks)

When more than one party designs something together, there's an invisible,
shared theory of what's being built: the **design concept**. It is not an
asset — you can't save it to a file — it lives in shared understanding. Most
wasted work comes from you and the AI *not* sharing it. Brooks also describes the
**design tree**: decisions branch and depend on one another, so design means
walking each branch and resolving dependencies one at a time. This is the basis
of [`grill-me`](../skills/grill-me/SKILL.md).

## Ubiquitous language (Domain-Driven Design — Eric Evans)

A **ubiquitous language** is one set of domain terms used identically in
conversation, in reasoning, and in the code. Without it, every exchange is a
lossy translation — which is why AI output drifts and turns verbose. Defining the
language tightens both. See
[`ubiquitous-language`](../skills/ubiquitous-language/SKILL.md).

## Functional core, imperative shell (Gary Bernhardt)

Separate pure decision logic (the **functional core** — deterministic, no I/O)
from the thin **imperative shell** that gathers inputs and performs effects. The
core is trivially testable with no mocks; the shell stays dumb. This is the
structural foundation that makes testing easy rather than a mocking slog. See
[`functional-core-imperative-shell`](../skills/functional-core-imperative-shell/SKILL.md).

## Invest in design every day (Kent Beck)

> Invest in the design of the system every day.

The single sentence that separates this process from specs-to-code. Specs-to-code
*divests* from design — it describes behavior and lets the compiler invent the
structure, decaying a little each run. This process does the opposite: it treats
every change as a chance to improve the design.

## The strategic / tactical split

AI is an outstanding **tactical** programmer — a sergeant on the ground who makes
changes faster than any human. It has no **strategy**. The human's job (with the
`design-architect`) is the strategic layer above: the shared design concept,
module boundaries, interfaces, and the investment in design. Never let the
tactics set the direction.

## The anti-pattern this process exists to prevent

**Specs-to-code / "vibe coding at one remove":** write a spec, generate code,
don't look at the code, hit a problem, change the spec, recompile, get *worse*
code, repeat until garbage. It fails because it ignores complexity, divests from
design, and lets entropy run unchecked. The whole devmode process is the
deliberate alternative.

## Reading list

- *A Philosophy of Software Design* — John Ousterhout (complexity, deep modules)
- *The Pragmatic Programmer* — Andrew Hunt & David Thomas (entropy, feedback,
  not outrunning your headlights)
- *The Design of Design* — Frederick P. Brooks (design concept, design tree)
- *Domain-Driven Design* — Eric Evans (ubiquitous language)
- Kent Beck (TDD; "invest in the design of the system every day")
- Gary Bernhardt — "Boundaries" talk (functional core, imperative shell)

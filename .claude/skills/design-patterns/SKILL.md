---
name: design-patterns
description: >-
  Pick and apply the right Gang of Four design pattern from a code smell or a
  goal — but only when the pattern makes a module deeper and simpler, never as
  decoration. Use when you see an if/else or switch on type/state, telescoping
  constructors, subclass explosion, `new ConcreteClass()` scattered everywhere,
  a subsystem leaking complexity into callers, or manual state propagation; or
  when the user mentions "strategy", "factory", "observer", "decorator",
  "adapter", "state pattern", "refactor to a pattern". Pairs with deep modules
  and architecture-boundaries.
---

# Design patterns (Gang of Four)

A catalog of 23 proven solutions to recurring design problems. Used well, a
pattern hides complexity behind a simpler interface — it makes a module
*deeper*. Used badly, it adds indirection and ceremony that make the system
*harder* to change, which is the opposite of the devmode goal.

**The devmode rule for patterns:** a pattern is justified only when it reduces
complexity (Ousterhout) — fewer special cases, a simpler caller-facing
interface, a deeper module. If a pattern adds a layer without removing
complexity, don't use it. Prefer the simplest thing that works; reach for a
pattern when a *real* smell appears, not preemptively.

## Pick by symptom

| Code smell | Pattern(s) |
|---|---|
| if/else or switch on object **type** | Strategy, Visitor |
| if/else or switch on object **state** | State |
| Telescoping constructors / many optional args | Builder |
| Subclass explosion for feature combinations | Decorator, Strategy, Bridge |
| `new ConcreteClass()` scattered through the code | Factory Method, Abstract Factory |
| Subsystem complexity leaking into callers | Facade |
| Complex many-to-many communication | Mediator |
| Manual state propagation to many dependents | Observer |
| Duplicated algorithm structure across subclasses | Template Method |
| Big conditional routing requests to handlers | Chain of Responsibility |
| Many fine-grained objects, high memory cost | Flyweight |

## Pick by goal

| What you want | Pattern |
|---|---|
| Hide how objects are created | Factory Method, Abstract Factory, Builder, Prototype |
| One instance globally (use sparingly — it's global state) | Singleton |
| Make incompatible interfaces work together | Adapter |
| Decouple an abstraction from its implementation | Bridge |
| Treat single objects and groups uniformly | Composite |
| Add behavior without subclassing | Decorator |
| Simplify a complex subsystem's API | Facade |
| Lazy-load, cache, or guard access to an object | Proxy |
| Make requests undoable / queueable / loggable | Command (+ Memento for undo) |
| Traverse a collection without exposing internals | Iterator |
| Encapsulate an interchangeable algorithm | Strategy |
| Change behavior when internal state changes | State |
| Notify dependents on state change | Observer |
| Add operations to a stable object structure | Visitor |

## How to apply one

1. **Name the smell, not the pattern.** Start from the concrete problem (the
   if/else-on-type, the subclass explosion). If there's no smell, stop.
2. **Confirm the pattern removes complexity.** Will callers see a *simpler*
   interface afterward? Will the module be deeper? If not, don't apply it.
3. **Apply test-first.** Patterns change structure; pin behavior with tests at
   the interface before refactoring ([`tdd`](../tdd/SKILL.md),
   [`testing-principles`](../testing-principles/SKILL.md)).
4. **Keep the seam pure where you can.** A Strategy/State often *is* a functional
   core decision — combine with
   [`functional-core-imperative-shell`](../functional-core-imperative-shell/SKILL.md).
5. **Name it in the ubiquitous language** so the pattern's role is shared
   vocabulary, not hidden cleverness.

## Patterns easily confused

- **Strategy vs. State** — Strategy swaps an *algorithm* chosen by the caller;
  State changes behavior as the object's *own* state transitions.
- **Decorator vs. Proxy** — Decorator *adds* behavior; Proxy *controls access*
  to the same behavior.
- **Factory Method vs. Abstract Factory** — one product via subclass vs. a
  family of related products.
- **Adapter vs. Facade** — Adapter makes one interface fit another; Facade
  simplifies a whole subsystem.

## Anti-patterns

- Pattern-for-pattern's-sake (Singletons everywhere, a factory for one class).
- Indirection that hides *no* complexity — that's entropy with a fancy name; the
  `complexity-reviewer` should flag it.
- Reaching for a pattern before the smell exists ("we might need it").

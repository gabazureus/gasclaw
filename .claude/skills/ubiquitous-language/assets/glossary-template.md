# Ubiquitous language

> A living glossary of the domain terms used identically in conversation, in
> reasoning, and in the code. Keep it open while planning. Update it in the same
> change whenever a concept appears or a definition sharpens — a stale glossary
> is worse than none.
>
> The **In code as** column is what makes the language *ubiquitous*: it ties each
> domain word to the concrete type, function, module, table, or event that
> represents it, so the term means the same thing in a meeting and in a file.

## <Sub-domain name>

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| <Term> | <Precise definition: the concept, its boundaries> | `<Type / module / fn>` | <Invariant that's always true of it> |
| <Term> | <...> | `<...>` | <...> |

## <Another sub-domain>

| Term | Definition | In code as | Notes / invariants |
|------|------------|-----------|--------------------|
| <Term> | <...> | `<...>` | <...> |

---

## Module map
> The module boundaries are part of the language — you and the AI both need to
> know this map well. List each deep module, its responsibility, and its public
> interface. Keep it current as modules are consolidated. This is what lets the
> PRD be specific about which modules and interfaces change.

| Module | Responsibility | Public interface | Depends on |
|--------|----------------|------------------|-----------|
| `<Module>` | <what it owns / decides> | `<key signatures / endpoints / events>` | `<other modules / external>` |
| `<Module>` | <...> | `<...>` | `<...>` |

---

### Conflicts & synonyms to resolve
> Where the code uses different words for the same concept (e.g. `User` vs
> `Account`), record it here and pick one. Divergent terms for one concept are a
> smell worth surfacing.

- <concept>: used as `<X>` in <place>, `<Y>` in <place> → standardize on `<...>`

### Relationships
> Where one term is defined in relation to another — that's the domain model
> leaking through, which is what you want.

- <A> belongs to <B>; <B> has many <A>.

# Wiki log

> Append-only, chronological record of every operation (ingest, saved query, lint,
> refactor). One entry each: `## [YYYY-MM-DD] <op> | <title>`. Parse with
> `grep "^## \[" wiki/log.md | tail -10`. (No frontmatter on this file.)

## [SCAFFOLD] bootstrap | LLM Wiki initialized
Canonical Karpathy LLM-Wiki scaffolded (pure markdown): raw/{sources,assets} +
wiki/{entities,concepts,synthesis,sources,queries,comparisons} + index/log/overview.
Schema in KARPATHY.md. Drop external material in raw/sources/ and ask the LLM to
ingest it.

## [2026-09-14] refactor | wiki movido para docs/wiki (ADR-007)
`wiki/` → `docs/wiki/`, `raw/` → `docs/raw/`; caminhos atualizados em KARPATHY.md.

## [2026-09-14] ingest | Pesquisa de referências para o gasclaw
Fonte: docs/raw/sources/2026-09-14-pesquisa-referencias.md → wiki/sources/pesquisa-referencias-2026-09-14.md.

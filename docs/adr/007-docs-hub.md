# ADR-007 — `docs/` como hub da documentação

- **Status:** Aceito · 2026-09-14

## Contexto
devmode adopt cria `conductor/` na raiz (caminhos usados por hooks e skills) e o wiki adopt
cria `wiki/`, `raw/` e `README.md` na raiz. O usuário quer documentação organizada em `docs/`.

## Decisão
- `conductor/`, `CLAUDE.md`, `AGENTS.md`, `KARPATHY.md`, `UBIQUITOUS_LANGUAGE.md` ficam na raiz.
- `wiki/` → `docs/wiki/`, `raw/` → `docs/raw/`, how-to do wiki → `docs/wiki-howto.md`;
  caminhos reescritos em `KARPATHY.md` e `.llm-wiki/managed-files`.
- `docs/README.md` indexa tudo: specs, ADRs, runbooks, wiki, tracks.

## Consequências
- `/devmode update wiki` reescreve `KARPATHY.md` com caminhos da raiz: após update, rodar
  novamente a troca de caminhos (registrado em `docs/runbooks/devmode-update.md`).

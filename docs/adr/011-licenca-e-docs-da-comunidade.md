# ADR-011 — Licença Apache-2.0 e docs da comunidade em inglês

- **Status:** Aceito · 2026-09-14

## Contexto
O repositório vai ser aberto como open source (por enquanto continua privado). Precisa de
licença, arquivos de comunidade e regras claras de contribuição. A regra do `CLAUDE.md` diz
"conteúdo em pt-BR", mas quem chega pelo GitHub espera README e guias em inglês.

## Decisão
- **Licença Apache-2.0**, Copyright 2026 Gabriel Sorrentino: `LICENSE` (texto oficial),
  `NOTICE` e `LICENSING.md`. Concessão explícita de patentes e compatível com o clasp e a
  maioria das inspirações.
- **Contribuições inbound = outbound**, com DCO (`git commit -s`), sem CLA.
- **Exceção à regra de idioma:** `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` e
  `LICENSING.md` em inglês, com `README.pt-BR.md` completo. `CHANGELOG.md`, `docs/` e
  `conductor/` seguem em pt-BR.
- Código de conduta: Contributor Covenant 2.1.
- Cabeçalho `SPDX-License-Identifier: Apache-2.0` recomendado para arquivos novos.

## Consequências
- Dois READMEs para manter em sincronia: mudou um, muda o outro no mesmo commit.
- Antes de abrir o repo: trocar o placeholder `OWNER/gasclaw` e revisar o histórico git em
  busca de dados internos (conta, domínio, IDs de script e de implantação).

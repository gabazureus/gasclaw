---
title: "Overview"
type: overview
date: 2026-09-15
tags: [overview, gasclaw]
sources:
  - docs/raw/sources/
---

# Overview

**gasclaw** roda agentes de IA 100% dentro do Google Apps Script: cada agente é uma pasta do Google Drive
(ou arquivos do editor do Apps Script) com markdown, e a conversa acontece no Google Chat ou na tela de
conversa do gasclaw. O modelo vem do OpenRouter; o PC só compila e publica.

## Estado (2026-09-15)
- **F0** concluída. **F1** em andamento: tools `now`, `memory.*` e `ask` com aprovação de uso único
  (ADR-017), trace do agente em lote de 1 min (ADR-014, ADR-020), painel de limites (ADR-016), modelos e custo
  (ADR-018), tela de conversa de texto (ADR-019) e acesso e ferramentas aprovados só no painel (ADR-021).
- A pesquisa que embasou o desenho está em [[pesquisa-referencias-2026-09-14]].

## Onde ler mais
- Andamento item a item: `PROGRESS.md`. Decisões: `docs/adr/`. Vocabulário e módulos: `UBIQUITOUS_LANGUAGE.md`.
- Histórico de operações neste wiki: `docs/wiki/log.md`.

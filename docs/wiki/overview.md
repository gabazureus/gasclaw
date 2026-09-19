---
title: "Overview"
type: overview
date: 2026-09-19
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

## Estado (2026-09-19)
- **F5 — sonho e linhagem** em desenho avançado: o agente reescreve o próprio prompt, gera sucessores e
  monta squad, tudo sob capacidades aprovadas uma a uma no painel ([ADR-038](../adr/038-capacidades-e-linhagem.md),
  [ADR-039](../adr/039-subagente-e-declaracao.md), [ADR-040](../adr/040-isolamento-e-privilegio.md)).
- **A POC P23 foi medida no dev v89** e trouxe o achado que reorienta a track: o conjunto-juiz atual
  **não serve** para medir qualidade, porque ele mede mecanismo e mecanismo não varia. A tese e as
  consequências estão em [[evolucao-do-agente-gasclaw]]; o fundamento, em
  [[arxiv-avaliacao-auto-aprimoramento-2026-09-19]] e [[sinal-fraco-em-avaliacao]].
- O limite honesto do isolamento está declarado: todos os agentes vivem no mesmo projeto Apps Script, sob
  os mesmos escopos do dono — isola-se **dado** e **ferramenta aprovada**, nada além.

## Onde ler mais
- Andamento item a item: `PROGRESS.md`. Decisões: `docs/adr/`. Vocabulário e módulos: `UBIQUITOUS_LANGUAGE.md`.
- Histórico de operações neste wiki: `docs/wiki/log.md`.

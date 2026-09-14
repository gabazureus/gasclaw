---
title: "Pesquisa de referências para o gasclaw"
type: source
date: 2026-09-14
tags: [research, apps-script, eve, openclaw, gasadk, clasp, devmode]
sources:
  - docs/raw/sources/2026-09-14-pesquisa-referencias.md
---

# Pesquisa de referências para o gasclaw

Análise de 12 repositórios e das docs oficiais do Apps Script antes do design.

## Principais aprendizados
- **GASADK** resolve planner/hooks em GAS, mas só Gemini, estado HITL em Property (9 KB) e
  timeout que aborta em vez de retomar → uso condicional (ADR-004).
- **Eve** dá o modelo mental: pasta como autoria, aprovação por tool, durabilidade por step.
- **OpenClaw** dá a experiência: arquivos do workspace, ritual de estreia, heartbeat,
  memória diária, cards de aprovação no Chat, onboarding em um comando.
- **clasp** não é biblioteca; `update-deployment` mantém URL; `push` sobrescreve tudo → detecção de divergência.
- **Maior bloqueio do GAS:** 6 h/dia de runtime de trigger; depois, Chat assíncrono com card
  exigindo auth de app → POCs P2 e P3.
- **Licenças:** sem licença (só ideias) — apps-script-engine-template, eveclaw, awesome lists.

## Contradições sinalizadas
- Crença antiga "UrlFetch ~60 s fixo" vs. doc atual `timeoutSeconds` (padrão 360 s) → POC P1.
- OpenClaw aposentou `HEARTBEAT.md`; para uma pasta do Drive ele continua sendo o mais simples → mantido.

Ver o design em `docs/specs/2026-09-14-gasclaw-design.md`.

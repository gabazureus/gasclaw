# ADR-001 — Runtime 100% Apps Script, sem servidor

- **Status:** Aceito · 2026-09-14

## Contexto
Objetivo: parar de pagar hospedagem de agentes. Eve exige Node persistente, Workflow SDK e
sandbox; Apps Script oferece HTTP (web app), cron (triggers), estado (Drive/Properties),
OAuth e APIs do Workspace sem custo de hosting.

## Decisão
Toda execução em produção acontece dentro de projetos Apps Script (dev e prod). O PC e o
GitHub Actions apenas compilam TypeScript e publicam via clasp. Não portamos o pacote `eve`;
reimplementamos suas ideias.

## Consequências
- Limites duros (6 min, 30 s no Chat, cotas) moldam o design (spec §7).
- Sem sandbox nem código arbitrário.
- Custo: só tokens do LLM.

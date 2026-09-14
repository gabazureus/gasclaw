# ADR-004 — GASADK vendorizado só se a POC P5 passar

- **Status:** Proposto · 2026-09-14

## Contexto
`tanaikech/adk-gas` (MIT, v2.0.0) traz planner→DAG→synthesizer, hooks, HITL e proteção de
timeout em GAS. Porém: só Gemini (chamada única em `LlmAgent._generateContent`), estado HITL
em uma Property (limite 9 KB), timeout gera síntese parcial em vez de retomada, e o `dist/`
é concatenado sem pin a partir de outros repos.

## Decisão
Vendorizar `src/LlmAgent.js` + `src/lib/GasHookManager.js` pinados em commit, com licenças
MIT (incluindo A2AApp/MCPApp se usados), **apenas se** a POC P5 provar que (a) o seam
`_generateContent` funciona com OpenRouter e (b) o DAG convive com checkpoint por step no
Drive. Caso contrário, `agent.ts` usa um loop simples de tool-calling (1 LLM call por step).

## Consequências
- Até P5, o núcleo é o loop simples (menor código); GASADK é otimização comprovada, não premissa.
- Resultado da P5 vira ADR que substitui este.

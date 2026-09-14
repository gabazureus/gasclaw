# POC P14 — Trace do agente

- **Status:** 🟡 8 de 10 · 2026-09-14 · Beads `gasclaw-5rn` (título "POC P14") · decisão no [ADR-014](../../docs/adr/014-trace-do-agente.md)
- **Fase:** F1

## Pergunta
Dá para registrar cada run do agente passo a passo e vê-lo ao vivo **dentro do gasclaw** (tela,
planilha e `./gasclaw trace`) sem passar dos 30 s do Chat e sem duplicar a página Execuções do Google?

## Critérios
C1 checkpoint + flush com p95 < 1,5 s em 50 runs · C2 5 runs simultâneos sem misturar · C3 falha de
gravação não derruba a resposta · C4 criação automática da planilha e da pasta · C5 `./gasclaw poc p14` ·
C6 ao vivo ≤ 5 s · C7 polling de 5 s por 30 min dentro da cota · C8 `resolve_agent` + `llm_call` + `reply`
com a soma dos passos a ±10% da duração · C9 zero chave ou `Bearer` (canário) · C10 `./gasclaw trace <id>`
mostra a árvore.

## Como rodar (100% automático)
```bash
./gasclaw poc p14           # deploy no dev → bench (C1 C3 C4 C9) → 5 simultâneos (C2) → run lento (C6) → polling (C7) → 2 runs reais + trace (C8 C10)
./gasclaw poc p14 profile   # custo de cada primitiva (cache, trava, planilha, upload)
```
O `pc.sh` orquestra, `harness.ts` roda no Apps Script e `summary.ts` decide (testado em `test/p14.test.ts`).
As observações brutas ficam em `.tmp/p14/`. As sondas usam `trace=0`, para não virarem runs.

## Resultado
Ver o ADR-014. Execução 2: C2–C5 e C7–C10 ✅. C1 ❌ (p95 3.893 ms; só o upload do JSON leva 1,3–1,6 s).
C6 🟡 (tela 2,5 s; planilha 5,2 s).

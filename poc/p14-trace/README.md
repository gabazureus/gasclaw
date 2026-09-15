# POC P14 — Trace do agente

- **Status:** 🟡 em andamento · 2026-09-15 · Beads `gasclaw-exl` (a `gasclaw-5rn` foi fechada como duplicata) · decisões no [ADR-014](../../docs/adr/014-trace-do-agente.md) e no [ADR-020](../../docs/adr/020-trace-em-lote.md) (lote de 1 min)
- **Fase:** F1

## Pergunta
Dá para registrar cada run do agente passo a passo e vê-lo ao vivo **dentro do gasclaw** (tela,
planilha e `./gasclaw trace`) sem passar dos 30 s do Chat e sem duplicar a página Execuções do Google?

## Critérios (C1–C12, trace em lote; definição em `summary.ts`)
C1 enfileirar no turno com p95 < 1,5 s em 50 runs · C2 5 runs simultâneos sem misturar · C3 planilha
indisponível no lote não perde a fila nem a resposta · C4 criação automática da planilha e da pasta ·
C5 `./gasclaw poc p14` · C6 tela ao vivo ≤ 5 s e planilha ≤ 70 s · C7 polling sem UrlFetch e parado com a aba
oculta · C8 `resolve_agent` + `llm_call` + `reply` com a soma dos passos a ±10% da duração · C9 zero chave ou
token (canário) depois do lote · C10 `./gasclaw trace <id>` mostra a árvore · C11 rajada de 20 runs toda
gravada · C12 projeção de gatilhos dentro da cota diária.

## Como rodar (100% automático)
```bash
./gasclaw poc p14           # deploy no dev → bench (C1 C4 C9) → failsafe (C3) → 5 simultâneos (C2) → ao vivo e planilha (C6) → polling (C7) → runs reais + trace (C8 C10) → rajada (C11) → lote vazio (C12)
./gasclaw poc p14 profile   # custo de cada primitiva (cache, trava, planilha, upload)
```
O `pc.sh` orquestra, `harness.ts` roda no Apps Script e `summary.ts` decide (testado em `test/p14.test.ts`).
As observações brutas ficam em `.tmp/p14/`. As sondas usam `trace=0`, para não virarem runs.

## Resultado
- **Gravação síncrona (ADR-014, 2026-09-14), critérios antigos C1–C10:** C2–C5 e C7–C10 ✅; C1 ❌ (p95 3.893 ms,
  só o upload do JSON leva 1,3–1,6 s); C6 🟡. Motivou o lote do ADR-020.
- **Lote de 1 min (ADR-020):** medição no dev registrada no Beads `gasclaw-exl`.

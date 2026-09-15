# POC P16 — Modelos por agente e custo por modelo

- **Status:** 🟡 código pronto, medição no dev pendente · 2026-09-15 · Beads `gasclaw-cmx` · decisão no [ADR-018](../../docs/adr/018-modelos-e-custo.md)
- **Fase:** F1

## Pergunta
Dá para escolher o modelo de cada agente na tela e ver o custo por modelo (7 dias e 24 h) com números que
batem com os do OpenRouter, sem chamar a API a cada leitura?

## Critérios (definição em `summary.ts`)
C1 custo medido pelo gasclaw a ±2% do `usage_daily` do OpenRouter · C2 leitura do painel < 1 s · C3 o dia é a
soma das 24 horas, em UTC e em São Paulo · C4 o modelo escolhido na tela é usado no run seguinte em ≤ 30 s ·
C5 recusa modelo sem suporte a tools para agente com tools e aceita modelo com tools (as tools do agente são as
aprovadas no painel, ADR-021) · C6 poda: horas com mais de 7 dias viram dia, dias com mais de 90 somem ·
C7 no máximo 3 chamadas reais a `/api/v1/key` em 30 min (cache).

## Como rodar (100% automático)
```bash
./gasclaw poc p16   # deploy no dev → conferência com o OpenRouter (C1) → leitura (C2) → somas (C3) → troca de modelo (C4, C5) → poda (C6) → chamadas à chave (C7)
```
O `pc.sh` orquestra, `harness.ts` roda no Apps Script e `summary.ts` decide (testado em `test/p16.test.ts`).
As observações brutas ficam em `.tmp/p16/`.

## Resultado
Medição no dev pendente (ADR-018).

## Mudança de método do C1 (2026-09-15)
A primeira versão comparava o custo medido do dia inteiro (dia UTC) com o `usage_daily` do OpenRouter e deu −84% e −75%.
A causa foi medida: o `usage_daily` inclui chamadas feitas antes de o trace existir no dia e outros usos da mesma chave
(os evals e o juiz chamavam o modelo fora do trace até o `c7efd2e`). Essa comparação não mede o trace, mede o resto.

Agora o C1 é um **conjunto controlado**: `c1read` lê o `usage_daily` sem cache, `c1turns` faz 10 turnos reais pelo
gasclaw e soma o custo que o trace registrou de cada um, e o `pc.sh` relê o `usage_daily` a cada 20 s até ele subir e
repetir o valor (teto de 5 min, porque o `/key` atualiza com atraso). Passa se a soma do trace ficar a ±2% do delta.
O C7 roda antes dessas leituras, porque elas também contam como chamadas reais ao `/key`. A comparação do dia inteiro
continua no resultado, só como informação. Outro uso da chave durante a janela estraga a medição: os evals e as POCs
passam pelo mesmo lock do dev e não se sobrepõem.

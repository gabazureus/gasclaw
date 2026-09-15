# POC P15 — Painel de limites

- **Status:** 🟡 código pronto, medição no dev pendente · 2026-09-15 · Beads `gasclaw-cmx` · decisão no [ADR-016](../../docs/adr/016-painel-de-limites.md)
- **Fase:** F1

## Pergunta
Dá para mostrar, na tela, no terminal e na planilha, o usado e o total de cada limite do Apps Script, do
Google e do OpenRouter, com a fonte de cada número, sem estourar cota nem deixar a tela lenta?

## Critérios (definição em `summary.ts`)
C1 pelo menos 11 fontes lidas, sem erro e sem pendência fora das que dependem da reautorização (ADR-015) ·
C2 leitura com cache < 1 s · C3 cada item com selo de fonte (`google`, `openrouter` ou `gasclaw`) · C4 uma
linha por item na aba "limites" da planilha de runs (≥ 11 no dia) · C5 `./gasclaw limits` sai com 0 e mostra
≥ 11 linhas · C6 o painel executa como o dono.

As cotas de UrlFetch, e-mail e gatilhos dependem do tipo da conta dona do script (Workspace × gmail.com).

## Como rodar (100% automático)
```bash
./gasclaw poc p15   # deploy no dev → leitura com e sem cache (C1–C3) → linha diária (C4) → CLI (C5) → quem executa (C6)
```
O `pc.sh` orquestra, `harness.ts` roda no Apps Script e `summary.ts` decide (testado em `test/p15.test.ts`).
As observações brutas ficam em `.tmp/p15/`.

## Resultado
Medição no dev pendente (ADR-016).

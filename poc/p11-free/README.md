# POC P11 — rodízio de modelos gratuitos (`model: free`)

Mede se o gasclaw consegue rodar em modelos gratuitos do OpenRouter sem parar de responder quando um deles cai.
Decisão e critérios: [ADR-025](../../docs/adr/025-rodizio-de-modelos-gratuitos.md).

```sh
./gasclaw poc p11        # publica no dev, mede tudo e sai ≠ 0 se algum critério falhar
```

## Critérios

| Critério | Meta | Como é medido |
|---|---|---|
| C1 | 20 mensagens com sucesso ≥ 95% | 4 lotes de 5 turnos reais com `model: free`, um lote por minuto |
| C2 | p95 < 25 s | tempo de cada um dos 20 turnos |
| C3 | troca em 429 < 2 s | o primeiro candidato devolve 429 simulado; mede o tempo até outro modelo responder de verdade |
| C4 | agente com ferramentas nunca recebe modelo sem ferramentas | lista de candidatos e escolhido, com o agente que tem ferramentas aprovadas |
| C5 | roda sozinha, com código de saída | `./gasclaw poc p11`, mais a conferência de que a cota não atrapalhou a medição |

## Desenho da medição

- **Lotes de 5, um por minuto.** O limite gratuito é de 20 requisições por minuto; 20 mensagens de uma vez
  estourariam o limite e mediriam o limite, não o rodízio. Os 4 lotes também mantêm cada execução longe
  do teto de 6 minutos do Apps Script.
- **429 simulado, resposta real.** O provedor não devolve 429 sob encomenda. A POC faz o primeiro candidato
  falhar com 429 e deixa o segundo chamar o modelo de verdade, então o tempo medido é o da troca mais uma
  chamada real — não um teste de mentira.
- **Cota antes e depois.** Se a cota gratuita já estiver no limite, a POC para antes de medir e diz o motivo:
  um resultado ruim ali seria da cota, não do rodízio.
- **O override volta ao que era.** O `burst` liga `model: free` no agente e restaura o valor anterior no fim,
  mesmo se der erro no meio.

## Arquivos

- `harness.ts` — etapas medidas dentro do Apps Script (`tools`, `switch`, `burst`, `quota`).
- `pc.sh` — orquestra no PC: publica, confere a cota, roda os lotes e chama o veredito.
- `summary.ts` — veredito puro dos critérios (testado em `test/p11.test.ts`).
- `summary-cli.mjs` — imprime o veredito e define o código de saída.

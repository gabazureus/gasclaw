# ADR-010 — POC P1: UrlFetch longo no Apps Script

- **Status:** Aceito · 2026-09-14

## Contexto
O Google Chat espera no máximo 30 s por uma resposta síncrona, por isso a F0 limita a
resposta a 1.000 tokens. A F2 (tarefas longas) precisa saber se **uma única chamada
`UrlFetchApp.fetch` ao OpenRouter** sobrevive a mais de 60 s, já que o limite de tempo do
UrlFetch não é bem documentado. Critério de aceite: mais de 60 s sem erro.

## Medição
No ambiente dev (`gasclaw-dev`, versão 1), a POC foi disparada pela tela gasclaw, com
`max_tokens` 12.000 e o modelo `openrouter/auto`. Resultados do Cloud Logging:

| Execução (UTC) | Duração | Caracteres | Erro |
|---|---|---|---|
| 20:41:12 | 109,5 s | 47.814 | nenhum |
| 20:41:28 | 110,1 s | 49.515 | nenhum |
| 20:41:45 | 126,1 s | 55.007 | nenhum |

## Decisão
- **P1 passou.** Uma chamada síncrona ao OpenRouter de mais de 2 minutos funciona dentro do
  limite de execução do Apps Script (6 min).
- A F2 pode fazer uma chamada longa por passo, **sem streaming nem continuação**. O
  checkpoint entre passos (ADR-005) continua necessário por causa do limite de 6 min por
  execução, e não do UrlFetch.
- A resposta síncrona do Chat segue limitada (1.000 tokens), porque o gargalo é o prazo de
  30 s do Chat, e não o UrlFetch.

## Consequências
- Não há um limite de UrlFetch para modelar; o orçamento por passo na F2 é de cerca de 5 min.
- A medição usou um único modelo. Modelos de raciocínio mais lentos podem chegar perto dos
  6 min: medir de novo se a F2 adotar um desses modelos.

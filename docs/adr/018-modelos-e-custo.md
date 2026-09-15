# ADR-018 — Modelos por agente e custo por modelo (POC P16)

- **Status:** Aceito no código (commits `e280f66`, `3458c30`, `ae22cd0`) · 2026-09-15 · **medição no dev pendente** (gcloud expirado) · prod não recebeu

## Contexto
O usuário quer ver quanto cada modelo custa por dia e por hora e trocar o modelo de um agente
pela tela. Defaults do ALIGN (Beads `gasclaw-cmx`): override nas Properties com "Voltar ao do
AGENTS"; gráfico em SVG puro; comparação com promptfoo fica para depois.

## Fonte da verdade
- OpenRouter `/api/v1/models`: `id`, `context_length`, `pricing.prompt` e `pricing.completion`
  (US$ por token) e `supported_parameters` (contém `tools`).
- OpenRouter `/api/v1/key`: `usage_daily` é o **dia UTC**, que vira às 21:00 em São Paulo.
- `usage.cost` vem em toda resposta do chat (ADR-014).

## Decisão
1. **Lista de modelos** (`models.ts`): `/api/v1/models` reduzido a id, contexto, preço por 1M de
   entrada e saída, tools e free, em cache de 6 h.
2. **Escolha por agente:** Script Property `MODEL:<folderId>`. Precedência **tela > planilha
   `config` > AGENTS > padrão**.
   - A tela mostra "Da pasta: x · Escolhido na tela: y" e tem o botão "Voltar ao do AGENTS".
   - Recusa modelo que não está na lista e modelo sem tools quando o agente tem tools (C5).
   - Cada troca vira um run `config` no trace.
   - O override vale a partir da próxima mensagem, lido a cada turno fora do cache de 30 s do agente.
3. **Uso** (`usage.ts`, puro): o lote soma os spans `llm_call` por hora UTC × modelo
   (requisições, tokens, custo). Guarda 7 dias por hora, 90 dias por dia UTC e 1 h de minutos
   `:free`, em Properties de até 9 KB (uma por dia de horas e uma por mês de dias).
4. **Gráfico** (tela): SVG puro com 7 dias em barras empilhadas por modelo; clicar num dia abre as
   24 horas; "← 7 dias" volta. Os 5 modelos mais caros têm cor própria e o resto vira "outros".
   Tem tabela alternativa, `aria-label` e navegação por teclado. Fuso de São Paulo.
5. **Conferência:** custo medido do dia UTC × `usage_daily` do OpenRouter (cache de 10 min), com a
   diferença em %. Também em `./gasclaw usage [dia]`.
6. **Performance:** a tela lê 1 `getProperties` com cache de 60 s, nunca a planilha, e atualiza a
   cada 60 s só com a aba visível.

## Critérios da POC P16 (`./gasclaw poc p16`)
C1 medido ±2% do `usage_daily` · C2 leitura da tela < 1 s · C3 soma do dia = soma das horas
(dia UTC e dia de São Paulo) · C4 troca de modelo usada em ≤ 30 s · C5 recusa modelo sem tools
· C6 `prune` · C7 ≤ 3 chamadas reais ao `/key` em 30 min.

## Consequências
- O C1 só fecha se tudo que usa a chave passar pelo trace. Evals e chamadas fora do trace entram
  no `usage_daily` e não no medido: a diferença mostra exatamente isso.
- O número de modelos com cor é fixo em 5 para a legenda caber em telas pequenas.

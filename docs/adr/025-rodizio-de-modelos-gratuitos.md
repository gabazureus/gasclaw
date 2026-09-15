# ADR-025 — Rodízio de modelos gratuitos (`model: free`)

- **Status:** Proposto (núcleo pronto e testado; medição pela POC P11 pendente)
- **Data:** 2026-09-15
- **Contexto:** o usuário quer o gasclaw barato. O OpenRouter tem modelos `:free`, mas cada um cai, fica ocupado
  (429) ou some da lista sem aviso, e nem todos aceitam ferramentas. Escolher um modelo gratuito fixo no `AGENTS`
  significa o agente parar de responder quando aquele modelo estiver fora.

## Decisão

`model: free` no `AGENTS`, na planilha `config` ou na tela deixa de ser um id de modelo e passa a significar
**"use o melhor gratuito que servir agora"**. O gasclaw escolhe da lista que já busca do OpenRouter (cache de 6 h)
e, se o modelo escolhido falhar por motivo passageiro, tenta o próximo.

### Ordem, explícita e sem sorteio

1. Só modelos **gratuitos** (`:free`).
2. Se o agente tem ferramentas aprovadas no painel, só modelos que **aceitam ferramentas** (nunca o contrário — é o C4).
3. Só modelos com **contexto suficiente** para o pedido.
4. Do **maior contexto para o menor**; empate resolvido pelo **id em ordem alfabética**.
5. Quem **falhou nos últimos 15 minutos** vai para o fim da fila, mantendo a ordem entre si.

A mesma entrada dá sempre a mesma ordem: nada de sorteio, para que o comportamento seja explicável e reproduzível
numa POC. O critério é contexto (não preço, que é zero para todos) mais a memória curta de falhas.

### Quando troca de modelo

Troca em **429**, **5xx** e **modelo indisponível** ("no endpoints found", "not available", "model not found"):
são falhas do provedor, e o próximo modelo tem chance real de responder.

**Não troca** em erro de autorização (401, 402) nem de conteúdo (resposta vazia, prompt inválido): trocar de modelo
não resolveria e só gastaria cota.

**Teto de 3 tentativas** por turno. Acima disso a pessoa espera demais, e a falha provavelmente não é do modelo.
Cada tentativa vira uma linha em `fallback[]` no span `llm_call`, com o modelo e o erro, visível no trace.

### Cota

Os gratuitos têm **20 requisições por minuto** e **1.000 por dia** (**50 por dia** sem a compra única de US$ 10).
O painel já mede as duas coisas (ADR-016: `freeMin` e `freeDay`), então o rodízio usa **esses contadores**, sem criar
outro. No teto, o rodízio não chama e explica o motivo; a partir de 80% a tela avisa que a folga está acabando.

## Consequências

- O agente continua respondendo quando um modelo gratuito cai, e o trace mostra por quais modelos passou.
- A resposta pode ficar mais lenta quando há troca (até 3 chamadas), por isso o teto e o critério de "não troca".
- Modelos gratuitos costumam registrar as conversas do lado do provedor. **Isso ainda não foi verificado** e está
  aberto no PROGRESS ("Privacidade dos provedores gratuitos"): não use `model: free` com memória pessoal antes disso.
- O `complete()` do `llm.ts` **não muda**: o rodízio embrulha o `llm` no ponto de injeção, preservando a assinatura
  e o span. Sem `model: free`, o comportamento é igual ao de hoje.

## Alternativas descartadas

- **Retry dentro do `complete()`:** misturaria a política de escolha com o transporte, e `llm.ts` é da Pista Motor.
- **Sorteio entre os gratuitos:** impossível de medir numa POC e de explicar quando dá errado.
- **Lista fixa de modelos no código:** envelhece sozinha; a lista do OpenRouter muda toda semana.

## Como será medido (POC P11)

| Critério | Meta |
|---|---|
| C1 | 20 mensagens seguidas com sucesso ≥ 95% |
| C2 | p95 abaixo de 25 s |
| C3 | troca em 429 simulado abaixo de 2 s |
| C4 | agente com ferramentas nunca recebe modelo sem ferramentas |
| C5 | `./gasclaw poc p11` roda sozinha e sai com código de erro quando falha |

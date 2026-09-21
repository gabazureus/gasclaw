# POC P32 — o Opus devolve um patch válido do motor inteiro, dentro de 6 min?

> **Status: APROVADA na rodada 2 (dev v147), os cinco critérios.** E o patch que o Opus devolveu
> achou um **defeito real** no agente, já portado para o `src/` com teste. GPT-6-Astra fica para depois
> da virada do dia (decisão de orçamento do dono). Ver [ADR-043](../../docs/adr/043-sucessor-e-um-agente.md).

## A pergunta

A F7 faz o sucessor ser **o próprio agente melhorado**: o motor lê o próprio código, manda ao Opus, e
recebe um patch com a explicação do que melhorou. Antes de construir isso, uma pergunta decide se o
desenho é viável: **o motor inteiro cabe numa chamada, e a resposta cabe em 6 minutos?**

## Critérios

| # | Critério | Passa quando |
|---|---|---|
| C1 | o modelo aceita o motor como contexto | a chamada volta sem erro com ~140 mil tokens de entrada |
| C2 | cabe numa execução | tudo em **< 5 min** (margem de 1 min contra o corte de 6) |
| C3 | o patch aplica | cada trecho casa **exatamente uma vez** no arquivo |
| C4 | o custo é conhecido | custo medido e gravado |
| C5 | a explicação existe | o que melhorou, em texto |

## Antes de gastar: o que o OpenRouter publica (2026-09-21)

| Modelo | Contexto | Saída máx. | US$ / milhão (entrada · saída) |
|---|---|---|---|
| `anthropic/claude-opus-5` | 1.000.000 | 128.000 | 5 · 25 |
| `openai/gpt-6-astra` | 1.050.000 | 128.000 | **10 · 50** |

O motor cabe nos dois com folga. O GPT custa o dobro.

## Rodada 1 — dev v146, Opus 5, teto de 5.000 tokens

```
read:  568.015 caracteres, ~142 mil tokens, lidos em 620 ms
       _motor 471.989 · settings 81.729 · chat 10.338 · hub 2.290 · appsscript 1.147 · 2 .md da P10
patch: 78.842 ms no total — a chamada em 77.798 ms
       finish_reason: "length"   content: null   custo: US$ 1,3845
```

| # | Resultado |
|---|---|
| C1 | ✅ **aceitou** os 568 mil caracteres — nenhum erro de contexto |
| C2 | ✅ **78,8 s** — o tempo não é o problema |
| C3 | ❌ **nenhum patch**: a resposta voltou vazia |
| C4 | ✅ **US$ 1,38**, contados no dia mesmo com a resposta vazia (o D9 funcionou) |
| C5 | ❌ sem explicação |

### A leitura

`finish_reason: "length"` com conteúdo nulo: o Opus gastou os 5.000 tokens de saída **inteiros antes
de escrever a primeira palavra visível**. Hipótese: raciocínio sobre 142 mil tokens de código.

**Isso derruba uma premissa do D8.** O teto de tokens foi derivado do tamanho máximo do CÓDIGO (20 mil
caracteres, ~5.000 tokens), supondo que a saída é só o código visível. Num modelo que raciocina, o
pensamento sai do mesmo orçamento.

**E a hipótese não está provada**: o caminho da resposta vazia descartava a contagem de tokens. A
rodada 2 grava `tokensReasoning` nos dois caminhos — o motivo passa a ser medido, não suposto.

O custo real (US$ 1,38) ficou acima da estimativa (US$ 0,83): código tokeniza a ~3 caracteres por
token, não 4. A rodada 2 estima com 3.

**O portão da spec ("se não couber, o patch passa a ser por módulo") NÃO dispara:** coube — no
contexto e no tempo. O que falhou foi o orçamento de saída.

## Rodada 2 — o que muda

- `reasoning.max_tokens` limita o pensamento (padrão 8.000) e `max_tokens` sobe para 16.000, deixando
  espaço para a resposta;
- a contagem de tokens de raciocínio é gravada também na resposta vazia;
- o pré-teste de custo usa a estimativa real, e não o US$ 1 por geração que subestima a P32;
- `--model opus|gpt` compara os dois geradores, por lista fechada.

```bash
./gasclaw poc p32 read                       # grátis
./gasclaw poc p32 patch --model opus         # até ~US$ 1,35
./gasclaw poc p32 patch --model gpt          # até ~US$ 2,69
./gasclaw poc p32 show                       # o patch guardado, inteiro
```

## Rodada 2 — dev v147, Opus 5, 16.000 de teto e 8.000 para pensar — APROVADA

```
patch: 43.061 ms no total — a chamada em 42.371 ms
       finish_reason: "stop"
       tokens: 252.504 entrada · 2.734 saída, dos quais 2.324 de raciocínio · 0 em cache
       custo: US$ 1,3309  (estimativa do pré-teste: US$ 1,3489)
```

| # | Resultado |
|---|---|
| C1 | ✅ aceitou **252.504** tokens de entrada |
| C2 | ✅ **43 s** |
| C3 | ✅ **1 troca**, e o trecho casa exatamente uma vez |
| C4 | ✅ **US$ 1,33** — o pré-teste estimou US$ 1,35 |
| C5 | ✅ explicação do que melhorou (abaixo) |

**O orçamento de raciocínio resolveu:** ele pensou 2.324 tokens e sobrou espaço para responder. A
rodada 1, sem esse limite, não gravou quanto pensou — então a hipótese de que ela se esgotou
raciocinando segue **coerente, não medida**.

**O código tokeniza a 2,25 caracteres por token**, não 3 (569.326 caracteres → 252.504 tokens). O
pré-teste acertou o total por acaso — errou para menos na entrada e para mais na saída — e foi
corrigido para 2,25.

### O patch achou um defeito de verdade

A explicação do Opus, verbatim:

> "Fixed a real scheduling defect in `dueJobs`: at the midnight rollover the local minute restarts at
> 0 while `lastSeen` is still late in the previous day, and the function returned an empty list for
> that tick. Since the tick then stores the new (smaller) minute as `lastSeen`, any job whose time had
> already passed on the new day — notably one at 00:00 — was silently skipped forever, so a proactive
> agent scheduled for midnight never woke up."

A troca: `if (now < lastSeen) return [];` → `if (now < lastSeen) lastSeen = -1;`

**A explicação não foi aceita como prova.** Conferida contra o chamador: `tickProactive` grava
`lastSeen = minutos` ANTES de chamar `dueJobs`, e sempre. Então 23:59 grava 1439; 00:00 grava 0 e
recebe vazio; 00:01 tem `lastSeen = 0`, e `j.at > 0` exclui o job das 00:00 para sempre. **O defeito é
real: um agente proativo agendado para meia-noite nunca acordava**, e nenhum teste cobria a virada do dia.

**Portado para `src/schedule.ts`** (decisão 3 da ADR-043), pelo fluxo do projeto: 5 testes novos, 4
vermelhos no código antigo — a sequência real de tiques dava **0 disparos em vez de 1** —, depois verdes.
Mutação: 3 reais mortas (desfazer o conserto, disparar o dia inteiro, disparar duas vezes) e 1
equivalente declarada antes de rodar (`-Infinity` e `-1` não se distinguem com `at ≥ 0`).

**O portão da spec não dispara:** coube no contexto e no tempo. O patch do motor inteiro é viável.

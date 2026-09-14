# ADR-014 — Trace do agente dentro do gasclaw (POC P14)

- **Status:** Aceito para o dev (8 de 10 critérios medidos passaram) · 2026-09-14 · C1 e C6 aguardam decisão do usuário

## Contexto
O usuário quer ver o que o agente fez em cada conversa, passo a passo e ao vivo, **dentro do
gasclaw**, sem usar nem duplicar a página Execuções do Google. Decisões já tomadas: planilha
com 1 linha por run; JSON completo por 90 dias e depois para a lixeira; ao vivo com checkpoint
leve; custo vindo de `usage.cost` do OpenRouter. Critérios C1–C10 na
[POC P14](../../poc/p14-trace/README.md).

## Fonte da verdade
- OpenRouter: *"Full usage details are now always included automatically in every response"*; `usage.cost` vem sem parâmetro (`usage.include` está depreciado).
- Sheets API `spreadsheets.values.append` aceita o escopo `https://www.googleapis.com/auth/drive`, que já está no manifesto. Não houve escopo novo; só foi preciso habilitar `sheets.googleapis.com` no projeto GCP, o que o `up` faz sozinho.
- Trigger diário exigiria `script.scriptapp`, que é escopo novo. Por isso a limpeza de 90 dias roda no fim de um run, no máximo uma vez por dia.

## Desenho
- **Núcleo puro** `src/trace.ts`: `startRun`, `setStep`, `span`, `finish` (soma tokens e custo), `redact` (`sk-or-…`, `ya29.…`, `Bearer …` em qualquer profundidade), `summaryRow`, `renderTree`, `coverage`, `expired`. Testado, com canário.
- **Borda** `src/runlog.ts`, que **nunca lança**:
  - `begin(kind, meta)` devolve `step(name, fn, info, slow)`, `mark(name)` e `end(out)`.
  - Checkpoint: 1 `put` no cache antes de cada passo. Antes de passo lento, também a linha `running` na planilha.
  - Flush: linha final e `gasclaw/runs/<id>.json` em paralelo (`fetchAll`).
  - Cria sozinho `Meu Drive/gasclaw/gasclaw — execuções` e `gasclaw/runs/`, com os ids em Script Properties.
- **Instrumentação só no `main.ts`**, embrulhando as dependências injetadas: Chat (`resolve_agent`, `llm_call` com prompt, modelo real, tokens e custo, `reply`), Testar, e POCs (sondas com `trace=0`).
- **Tela**: seção "Ao vivo" com polling de 5 s via `google.script.run`, que para com a aba oculta. Mostra os runs em andamento e os últimos 10; o clique abre o detalhe com a árvore, a pergunta e a resposta completas. Tem link "abrir planilha".
- **CLI**: `./gasclaw trace [id]` (árvore) e `./gasclaw runs` (abre a planilha).

## Medição (dev, `./gasclaw poc p14`, 2 execuções completas)
| Critério | Execução 1 | Execução 2 (após profile e correção) | Resultado |
|---|---|---|---|
| C1 checkpoint + flush, p95 em 50 runs, meta < 1,5 s | 3.937 ms | 3.893 ms (mín. 3.140) | ❌ |
| C2 5 runs simultâneos sem misturar | 5 linhas, cada uma com a sua resposta | idem | ✅ |
| C3 planilha inexistente não derruba a resposta | respondeu, status ok | idem | ✅ |
| C4 planilha e pasta criadas sozinhas, idempotente | `gasclaw — execuções`, `runs` | idem | ✅ |
| C5 `./gasclaw poc p14` automático | sim | sim | ✅ |
| C6 ao vivo ≤ 5 s (tela · planilha) | 12 s · 7,5 s (sonda contaminada pelo `gcloud`) | **2,5 s · 5,2 s** (latência pelo `startedAt` do servidor) | 🟡 tela ✅, planilha 0,2 s acima |
| C7 polling de 5 s por 30 min | 158 ms por chamada | 38 ms média, 58 ms máx., 0 UrlFetch; para com a aba oculta | ✅ (rajada; 30 min reais não rodados) |
| C8 `resolve_agent` + `llm_call` + `reply`, cobertura ±10% | 0,894 e 0,919 | 0,925 e 0,920 | ✅ na execução 2 |
| C9 canário (chave, `ya29.`, `Bearer`) em cache, planilha e JSON | 0 vazamentos | 0 vazamentos | ✅ |
| C10 `./gasclaw trace <id>` mostra a árvore | sim | sim | ✅ |

**Profile das primitivas** (5×, máximo, execução 2): cache `put` 157 ms · `get` 76 ms · trava 335 ms
· `ensureRunStore` 172 ms · append na planilha 725–1.430 ms · update 268–903 ms · **upload do JSON
1.302–1.624 ms** · `DriveApp.createFile` 1.483–1.707 ms. No primeiro profile, as mesmas
primitivas foram 2 a 3 vezes mais rápidas: a variação é do lado do Google. Correção já aplicada: trava só no `begin`, 1 `put`
por checkpoint, lista de pastas e planilha memoizada, flush em paralelo. O p95 não caiu, porque
o JSON síncrono sozinho já passa de 1,3 s.

## Decisão
1. O trace fica **ligado no dev** para Chat, Testar e POCs, com o desenho acima.
2. **Nunca derruba a resposta** (C3) e **nunca grava segredo** (C9: `redact` antes de cache, planilha e JSON).
3. Limpeza de 90 dias sem trigger: no fim de um run, no máximo uma vez por dia, manda para a lixeira os JSON com mais de 90 dias.
4. **C1 fica em aberto (decisão do usuário):** o custo medido do trace é de 3 a 4 s por run, com
   JSON síncrono, dentro dos 30 s do Chat. Opções: (a) aceitar e trocar a meta para < 5 s;
   (b) gravar o JSON só quando a tela Ao vivo pedir ou no próximo run (fora do caminho da
   resposta atual); (c) só a linha da planilha no caminho da resposta e o JSON em lote.

## Consequências
- Cada mensagem no Chat fica de 3 a 4 s mais lenta até o C1 ser resolvido.
- A pasta `gasclaw/runs/` recebe um JSON por run, incluindo os runs sintéticos das POCs (cerca de 60 por `./gasclaw poc p14`). A limpeza só age depois de 90 dias.
- A planilha é a visão resumida (cortes de 200 caracteres). O detalhe completo, com o prompt, fica só no JSON.

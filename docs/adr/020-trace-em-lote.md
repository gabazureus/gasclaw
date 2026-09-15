# ADR-020 — Trace em lote de 1 min (fila no turno, gatilho e fallback)

- **Status:** Aceito · 2026-09-15 · decisão do usuário registrada pela auditoria · substitui a parte de gravação síncrona do [ADR-014](014-trace-do-agente.md)
- **Relaciona:** [ADR-014](014-trace-do-agente.md) (trace), [ADR-015](015-escopos-oauth.md) (escopo `script.scriptapp` do gatilho), [ADR-016](016-painel-de-limites.md) (cota de gatilhos), [ADR-018](018-modelos-e-custo.md) (uso por modelo) · POC [P14](../../poc/p14-trace/README.md) · Beads `gasclaw-exl`

## Contexto
O ADR-014 gravava a linha da planilha e o `gasclaw/runs/<id>.json` **dentro do turno**. Na medição, o C1
(p95 < 1,5 s) reprovou com p95 de 3,9 s: só o upload do JSON leva 1,3–1,6 s, e o turno do Chat tem 30 s.
O ADR-014 deixou três opções para o usuário. Em 2026-09-15 ele escolheu gravar em lote, fora do caminho
da resposta, com o gatilho de 1 min que o escopo `script.scriptapp` (ADR-015) permite.

## Decisão
- **No turno** (`runlog.end` → `observe.enqueue`): 1 `setProperty` com a entrada `Q:<id>` (linha da planilha
  e registros de uso já redigidos, ≤ 9 KB) e 1 `put` do run completo redigido no CacheService (`qjson:<id>`,
  6 h). Nada de planilha nem de upload no turno.
- **Gatilho de 1 min** (`drainRuns` → `observe.drain`, sob `LockService`): lê a fila, grava **todas as
  linhas numa chamada**, soma o uso por modelo (`USAGE:*`, em partes de até 8 KB) e sobe os JSON em paralelo
  (`fetchAll`). Se o JSON completo expirou no cache, grava a própria entrada da fila. Uma vez por dia, a aba
  "limites" e a limpeza de 90 dias.
- **Fallback sem gatilho** (`maybeDrain`, no turno e ao abrir a tela): só drena se a entrada mais antiga
  tiver mais de 1 min, com **teto de 20 entradas** e sem a limpeza de 90 dias, para caber nos 30 s do Chat.
- **Idempotência:** as entradas são marcadas `rowDone` na mesma escrita do uso, antes dos uploads; uma
  falha depois disso não duplica linha nem uso. JSON que falha fica na fila por até 3 tentativas. Entrada ou
  Property corrompida é ignorada com aviso, sem travar a fila.
- **Ao vivo** continua no CacheService (checkpoint por passo), sem esperar o lote.

## Critérios (POC P14, `poc/p14-trace/summary.ts`)
| # | Critério |
|---|---|
| C1 | enfileirar no turno: p95 < 1,5 s em 50 runs |
| C2 | 5 runs simultâneos sem misturar linhas |
| C3 | planilha indisponível no lote: a resposta sai e a fila fica para depois |
| C4 | criação automática e idempotente da planilha e da pasta `runs` |
| C5 | tudo por `./gasclaw poc p14` |
| C6 | tela ao vivo ≤ 5 s e planilha ≤ 70 s |
| C7 | polling da tela sem UrlFetch, < 1 s, e para com a aba oculta |
| C8 | `resolve_agent` + `llm_call` + `reply`, soma dos passos a ±10% da duração |
| C9 | zero chave ou token (canário) no cache, na planilha e no JSON depois do lote |
| C10 | `./gasclaw trace <id>` mostra a árvore |
| C11 | rajada de 20 runs: todas enfileiradas, todas as linhas gravadas, fila vazia no fim |
| C12 | projeção de 1.440 lotes/dia + 200 runs/dia dentro da cota de gatilhos (6 h/dia no Workspace) |

O resultado de cada execução fica no retorno de `./gasclaw poc p14` e no Beads `gasclaw-exl`.

## Consequências
- A planilha e o JSON aparecem em até ~70 s, não na hora; a tela ao vivo cobre esse intervalo.
- O gatilho consome a cota diária de gatilhos (C12) e divide a `ScriptLock` com a aprovação e a lista ao vivo.
- Sem gatilho (antes da reautorização do ADR-015), o fallback drena aos poucos no turno e na tela.
- Numa conta pessoal (gmail.com), a cota de gatilhos é 90 min/dia: o painel de limites passa a usar a cota
  do tipo da conta dona do script.

## Nota de referência (sem editar ADR aceito)
O [ADR-015](015-escopos-oauth.md) cita "aprovação no fluxo do agente (ADR-005, F2)". A aprovação foi
decidida e entregue pelo [ADR-017](017-motor-de-tools-evals-e-aprovacao.md) (E5); o ADR-005 continua sendo o
da execução durável.

## Resposta do web app que se perde no Google: job recuperável (2026-09-15)
- **Medido no dev (v29–v32):** a resposta de um pedido ao web app vem por um 302 para `script.googleusercontent.com/…/echo`,
  que exige o token e vale uma vez. Mesmo com o salto manual e o token (`bc56fc9`), o echo às vezes devolve 404 e a
  resposta some. **Não depende da duração nem da concorrência:** duas chamadas de 3,8 s e 3,6 s, uma perdeu e a outra não;
  5 em sequência perderam 2; GET de leitura perdeu 1 de 20, POST perdeu 0 de 10 numa rodada e 3 de 5 em outra.
  O servidor executa normalmente (o run aparece no trace); só a resposta não chega à CLI.
- **Decisão:** em vez de execução assíncrona com gatilho (que resolveria um limite de tempo, e não é esse o caso):
  - GET de leitura é idempotente: a CLI tenta até 3 vezes;
  - POST com efeito leva um `job` aleatório: o servidor marca "em execução", executa **uma vez por job**, guarda o
    resultado em cache por 6 h e devolve o guardado se o mesmo job chegar de novo;
  - se a resposta se perder, a CLI lê `GET action=job&id=` a cada 5 s (teto de 6 min; desiste se o job ficar desconhecido por 60 s).
- Vale para `./gasclaw` (`gfetch`) e `scripts/eval.mjs`.

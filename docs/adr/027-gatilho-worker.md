# ADR-027 — O gatilho de 1 min é o worker do run durável

Status: **Aceito e medido no dev v60**
Data: 2026-09-16
Substitui: item 5 da [ADR-026](026-run-duravel.md)

## Contexto

A ADR-026 propôs que o gatilho apenas acordasse o web app por `UrlFetchApp.fetch`, para o passo não consumir a cota
de runtime de gatilhos. A primeira P3 reprovou esse desenho: o fetch é síncrono e manteve o gatilho esperando o POST
terminar. A sonda isolada mediu 1.748 ms no fetch mínimo, 825 ms no lote de observabilidade e 8.517 ms no `kickPump`
com um run sintético.

O produto exige Google Workspace, cuja cota oficial de runtime de gatilhos é 6 h/dia. Conta Gmail pessoal, com cota
de 90 min/dia, não faz parte deste contrato.

## Decisão

1. O gatilho `drainRuns`, a cada minuto, drena o trace e executa o `pump` diretamente quando a fila `R:` não está
   vazia. Não há POST do Apps Script para o próprio web app.
2. Fila vazia não abre Drive nem chama modelo. O tempo real de Drive, tools e LLM de um run ativo consome a cota de
   gatilhos; isso é uma limitação explícita, não um custo escondido em outra execução.
3. A P3 mede com cronômetros dentro do próprio gatilho. A API de processos não serve para deltas curtos porque suas
   contagens chegaram atrasadas durante o diagnóstico.
4. O custo fixo projetado usa 1.440 ciclos ociosos e 200 passos sintéticos por dia. Ele precisa ficar em no máximo
   20% das 6 h, reservando o restante para o trabalho real. O worker sintético deve avançar o run em até 10 s; o
   ciclo ocioso, com zero itens de trace, deve terminar em menos de 1 s.
5. O passo sintético existe apenas no build dev, exige que o primeiro ponteiro tenha o `runId` pedido e pertença à
   sessão `:poc/p3`, e executa no máximo um run. O endpoint genérico `step` nunca aceita modo sintético.

## Medição P3 — dev v60

Sequência executada: `reset` → `worker` → `idle` → `cota` → `fim`.

- C1: o gatilho concluiu em `done/ok` o `runId` sintético pedido, sem tocar no run real seguinte.
- C2: worker sintético em **3.992 ms**, contra teto de 10.000 ms.
- C3: handler ocioso completo em **716 ms**, com `drained: 0` e `queued: 0`, contra teto de 1.000 ms. A sonda
  interna separou **338 ms** de reconciliação, **341 ms** de drenagem e **37 ms** de leitura da fila. Tentativas
  contaminadas por traces pendentes foram descartadas; `./gasclaw poc p3` passou a usar `trace=0` para a própria
  POC não criar o item que a sonda seguinte encontraria.
- C4: **1.829.440 ms/dia**, ou **8,47%** da cota de 21.600.000 ms; teto de 20%.
- Veredito final: `pass: true`, quatro de quatro checks. A amostra v51 foi invalidada porque o sintético podia
  alcançar runs seguintes e o idle não incluía a leitura da fila `R:`. A v52 também foi invalidada: entre observar
  o primeiro ponteiro e reivindicá-lo, outro worker podia tomar o run P3 e o pump cair no run real seguinte. Na v53,
  `claimById` reivindica sob lock somente o `runId` pedido e devolve vazio se ele já estiver ocupado; a regressão foi
  coberta por testes e por quatro revisores independentes. A medição foi repetida na v60 depois que o handler passou
  a reconciliar traces abandonados por uma execução encerrada à força. Os primeiros ciclos das versões intermediárias
  v58 e v59 excederam 1 s enquanto removiam marcadores órfãos criados durante a migração; a sequência limpa da v60,
  iniciada com `reset`, passou os quatro critérios na primeira tentativa.

## Consequências

- O caminho normal fica menor: uma execução e nenhum fetch para si mesmo.
- Runs ativos consomem a cota de gatilhos proporcionalmente ao trabalho real. A P3 prova o custo fixo e a margem,
  não promete trabalho ilimitado.
- A P3 está resolvida para Google Workspace. A P4 também passou no dev v66, com o mesmo run retomando do Drive em três
  execuções e um único efeito. F2 ainda não está resolvida: P19 precisa provar o comportamento na morte entre efeito
  e checkpoint.

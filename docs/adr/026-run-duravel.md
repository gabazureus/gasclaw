# ADR-026 — Run durável: o passo é a unidade e o estado mora no Drive

Status: **Aceito e medido no dev v66** (mecanismo de despertar substituído pela [ADR-027](027-gatilho-worker.md); P19 pendente)
Data: 2026-09-15
Substitui em parte: [ADR-005](005-execucao-duravel.md) (que propunha pump + doPost + checkpoint, sem dizer como)

## Contexto

O Apps Script mata uma execução em **6 min** e um evento do Google Chat em **30 s**. Um turno de agente de verdade não
cabe nisso: várias chamadas ao modelo, uma aprovação que espera o usuário voltar do almoço, uma ferramenta lenta.

Até aqui o gasclaw resolvia o caso curto: o turno rodava inteiro numa execução e, se não desse, pedia desculpa
("Parei por tempo antes de terminar"). O estado de onde ele parou **era descartado** — o `runTurn` sabia o passo, as
mensagens e o que faltava do lote, e jogava fora. A única forma de continuação era o ticket de aprovação, guardado no
`CacheService` por 10 min, com o limite de 95 KB por valor e o risco de a conversa longa não caber.

Também havia um furo de idempotência que o próprio [ADR-017](017-motor-de-tools-evals-e-aprovacao.md) registrava: uma
ferramenta executada antes do card podia rodar **de novo** depois do Aprovar.

## Decisão

**A unidade durável é o passo, não o turno** — o mesmo modelo do Eve. Uma volta do laço termina, o estado vira
checkpoint, e a execução pode morrer em seguida sem prejuízo: a próxima retoma exatamente dali. Um passo concluído
nunca roda de novo.

1. **Estado no Drive**, em `.gasclaw/runs/<runId>.json` dentro da pasta do agente (`src/runStore.ts`). É o
   `Snapshot` que o `agent.ts` já produz, mais `done`, `granted`, `pending`, `budget` e `status`. **Nenhum tipo novo de
   estado**: as duas pistas costuram no mesmo contrato (`Snapshot`, `Pending`, `Decision`, `TurnResult`).
   O `CacheService` continua, mas só como atalho — quem manda é o Drive, que não expira.
2. **Ponteiro na fila das Script Properties**, com prefixo **`R:`** — *separado* do `Q:` do trace. Perder uma entrada de
   trace custa um log; perder um run custa a resposta ao usuário. O ponteiro tem ~300 bytes (cabe folgado nos 9 KB por
   valor) e carrega `lease` e `attempts`.
3. **Lease de 6 min, teto de 4 tentativas.** O lease é o tempo máximo de uma execução do Apps Script: vencido, quem
   pegou o run morreu, e outro pump pode assumir. As tentativas contam **falhas, não passos** — um run de 20 passos
   bem-sucedidos não pode morrer de velhice na 4ª volta do pump.
4. **A trava cobre só a reivindicação.** `LockService` no `claimNext` e em mais nada: segurar a ScriptLock durante uma
   chamada ao modelo travaria o lote do trace e o resto do gasclaw junto.
5. **Substituído pela [ADR-027](027-gatilho-worker.md).** A P3 mostrou que `UrlFetchApp.fetch` espera o web app
   responder e não cria o despertar barato proposto aqui. O gatilho passou a executar o worker diretamente.
6. **Teto de US$ 0,10 por run** (decisão do usuário, 2026-09-15). Ao cruzar, o run **pausa com o estado guardado** e
   pergunta se continua; continuar estende o teto e devolve o run à fila, sem recomeçar do zero.
7. **Efeito em voo não se repete.** Para tools cujo nome indica efeito (`create|update|draft|send|append|complete|
   save|remove`), o run marca `inflight` antes de executar. Se a execução morre no meio, o pump **não tenta de novo**:
   conta ao usuário que começou, não sabe se terminou, e devolve a decisão. Honestidade acima de conveniência — a
   mesma regra do `failureNotice`.
8. **Desistir é um desfecho, não um sumiço.** Esgotadas as tentativas, o pump pega o run uma última vez só para
   gravar a falha honesta e soltar a fila. Sem isso o ponteiro ficaria para sempre nas Properties (que têm 500 KB no
   total) e a tela mostraria "Trabalhando…" eternamente.

## Consequências

- Um turno longo passa a atravessar execuções. Na tela, a decisão pertence ao run guardado no Drive e não usa o
  ticket do Chat. Os cards do Google Chat continuam cache-backed por 10 min. Definir e medir um prazo de 24 h para
  a tela pertence à P20; ainda não está implementado.
- Cada passo paga uma ida ao Drive. A **P18** mediu 683 ms de média para a sessão no Drive, mas com a linha de base
  variando de 1.765 a 4.670 ms — o número precisa de mais amostras antes de virar orçamento de desempenho.
- A entrega é **na tela primeiro** (a tela já faz polling). O Chat assíncrono depende da POC P2 e fica para depois.
- O `runTurn` segue **puro**: quem persiste é o pump. Foi o que permitiu a mudança sem tocar no motor do agente.

## O que decidimos **não** fazer agora

Subagentes, MCP, sandbox, replay determinístico, streaming e fila FIFO durável. Nenhum deles é necessário para um
turno sobreviver a uma execução, e cada um custaria mais do que entrega dentro dos limites do Apps Script.

## Como saberemos que está certo (medições pendentes)

| POC | Pergunta | Critério |
|---|---|---|
| **P3** | O pump consome cota de gatilho proporcional ao trabalho, ou só ao despertar? | O critério original reprovou; o redesenho e o novo critério estão na [ADR-027](027-gatilho-worker.md) |
| **P4** | Um run atravessa a morte da execução? | ≥ 3 execuções, resposta correta no fim, **zero efeito duplicado** |
| **P19** | E se a execução morrer exatamente entre a chamada e a gravação? | O run não repete efeito; o usuário recebe o recado de incerteza |

## Medição P3 — 2026-09-16

Resultado: **reprovada em C2** no dev v46.

O `step` foi publicado com modo sintético (`action=step&synthetic=1`, só em `__DEV__`) para medir sem gastar chamadas
reais ao modelo. O gatilho usa esse modo apenas quando o primeiro ponteiro da fila é da sessão `:poc/p3`.

Evidência:

- `./gasclaw poc p3 reset` → `pass: true`.
- `./gasclaw poc p3 zero` → `workType: "TIME_DRIVEN"`, `progrediu: true`, `triggerMsToday` 375.838 → 380.201 ms,
  `count` 174 → 175.
- `./gasclaw poc p3 fim` → `pass: false`, `aborted: true`, C2: "o trabalho rodou como execução de gatilho".
- Sonda direta do endpoint sintético vazio: POST `action=step&synthetic=1` → HTTP 200 em 2,706 s,
  `{"ok":true,"steps":0,"runs":[]}`.
- Diagnóstico no dev v47–v49:
  - `./gasclaw poc p3 fetch`: o gatilho chamou só `GET ?action=ping`; cronômetro interno `ms: 1.748`, HTTP 200.
    A leitura de processos da API veio atrasada (`count` não avançou), então o dado confiável aqui é o cronômetro
    interno do gatilho.
  - `./gasclaw poc p3 drain`: o gatilho chamou só `observe.drain()`; cronômetro interno `ms: 825`
    (`drained.ms: 378`).
  - `./gasclaw poc p3 kick`: o gatilho chamou só `kickPump()` com run sintético P3; cronômetro interno `ms: 8.517`,
    `progrediu: true`.

Conclusão: o desenho "gatilho só acorda chamando o web app" **não ficou barato o suficiente** pela régua da P3, porque
`UrlFetchApp.fetch` é síncrono: o gatilho paga o tempo do `step` até o web app responder. O GET mínimo e o lote de
observabilidade isolados ficaram abaixo de 2 s; o `kickPump` com run sintético ficou em 8,5 s porque esperou a
reivindicação do run, leitura/gravação no Drive e `dequeue` do web app. A [ADR-027](027-gatilho-worker.md) registra o
redesenho e a nova medição.

## Medição P4 — 2026-09-16

Resultado: **aprovada 3/3** no dev v66 por `./gasclaw poc p4`.

- C1: o mesmo `runId` atravessou **três execuções GAS distintas** (UUIDs próprios), com checkpoints `1 → 2 → done`.
- C2: a terceira execução retomou o estado do Drive e terminou em `done` com a resposta `p4-ok`.
- C3: o efeito sintético ocorreu **uma vez** e o `DurableRun.done` terminou com **uma chave**
  `runId:0:p4-effect`; as duas retomadas não repetiram o efeito.

A P4 remove o cache do run antes de cada avanço, portanto cada retomada lê o arquivo no Drive. Ela prova a travessia
normal entre checkpoints, não substitui a P19: ainda falta encerrar uma execução à força
depois do efeito e antes da gravação para comprovar o desfecho honesto de `inflight` no runtime real.

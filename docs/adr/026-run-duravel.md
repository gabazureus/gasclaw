# ADR-026 — Run durável: o passo é a unidade, o estado mora no Drive, o gatilho só acorda

Status: **Aceito no código** (medição pendente: POCs P3, P4 e P19)
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
5. **O gatilho de 1 min não trabalha, só acorda.** Ele lê a fila e dispara o passo em execução comum, para o trabalho
   não consumir a cota de gatilho (6 h/dia no Workspace, **90 min/dia** em conta pessoal — é a conta pessoal que
   aperta). É exatamente isto que a **POC P3** precisa medir antes de valer como verdade.
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

- Um turno longo passa a atravessar execuções, e a aprovação deixa de depender do cache: o TTL pode ir de 10 min a
  24 h sem risco de estourar os 95 KB, porque só o ticket fino fica no cache e o estado fica no Drive.
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
| **P3** | O pump consome cota de gatilho proporcional ao trabalho, ou só ao despertar? | O tempo TIME_DRIVEN cresce com os despertares (< 2 s cada), não com os 50 passos; os passos aparecem como execução de web app |
| **P4** | Um run atravessa a morte da execução? | ≥ 3 execuções, resposta correta no fim, **zero efeito duplicado** |
| **P19** | E se a execução morrer exatamente entre a chamada e a gravação? | O run não repete efeito; o usuário recebe o recado de incerteza |

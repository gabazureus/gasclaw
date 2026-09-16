# POC P4 — run durável em três execuções

## Pergunta

O mesmo run retoma do estado no Drive em três execuções GAS distintas, preserva o `runId`, termina corretamente e
não repete um efeito já registrado?

## Critérios

- C1: três UUIDs de execução distintos, mesmo `runId` e checkpoints `1 → 2 → done`.
- C2: resposta final `p4-ok`.
- C3: um efeito observado e uma chave durável `runId:0:p4-effect`.

Cada `advance` remove antes o cache de seis horas do run, obrigando `runIO.load()` a ler o arquivo
`.gasclaw/runs/<runId>.json` no Drive. A POC usa controle próprio em Script Properties e nunca entra na fila `R:`
do worker real.

## Medição

Comando: `./gasclaw poc p4`  
Data: 2026-09-16  
Ambiente: dev v66

- `runId` nas três respostas: `p4-mu4d32l3`.
- Execução 1: UUID `c4c409b8-55b0-4269-aea7-cb1af141446a`, `snapshotStep: 1`, efeito 1, chave 1.
- Execução 2: UUID `f940f06e-31d5-400d-8af2-f6c5356314db`, `snapshotStep: 2`, efeito 1, chave 1.
- Execução 3: UUID `03567c72-5802-4a83-859c-375867900d4d`, `status: done`, resposta `p4-ok`, efeito 1, chave 1.
- Veredito: C1, C2 e C3 passaram.

A P4 mede retomadas ordenadas. A morte entre executar o efeito e gravar o checkpoint pertence à P19 e continua
pendente.

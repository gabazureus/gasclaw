# ADR-005 — Execução durável: pump + doPost + checkpoint no Drive

- **Status:** Parcialmente substituído pelas ADRs [026](026-run-duravel.md) e [027](027-gatilho-worker.md); P3 e P4 medidas · 2026-09-16

## Contexto
6 min por execução, 6 h/dia de runtime de trigger, 20 triggers, 9 KB por Property, 30
execuções simultâneas. Eve checkpointa por step; GASADK só aborta no timeout.

## Decisão
- Um step = 1 chamada LLM + tools + checkpoint JSON em `.gasclaw/runs/<id>.json`.
- Trigger `pump` a cada 1 min: sai em < 1 s se a fila está vazia; senão dispara
  `doPost(action=step)` no próprio web app para o trabalho pesado.
- Claim com lease no checkpoint; LockService apenas durante o claim.
- Chaves de idempotência para tools com efeito colateral.

## Consequências
- Latência de retomada ≤ ~1–2 min (jitter do trigger).
- Se P3 falhar (doPost consumir cota de trigger ou exigir auth inviável), o trabalho roda no
  próprio pump com orçamento diário monitorado pelo `status`.

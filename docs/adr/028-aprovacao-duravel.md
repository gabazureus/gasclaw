# ADR-028 — Aprovação durável pertence ao run no Drive

Status: **Aceito e medido no dev v74**  
Data: 2026-09-16  
Complementa: [ADR-017](017-motor-de-tools-evals-e-aprovacao.md), [ADR-026](026-run-duravel.md)

## Contexto

O turno já atravessava execuções pelo `DurableRun`, mas o card do Google Chat ainda guardava snapshot, idempotência e consentimento no `CacheService` por dez minutos. Perder ou expirar o cache apagava a aprovação de uma tarefa longa. A tela usava o run no Drive, criando dois contratos para a mesma decisão.

## Decisão

1. Aprovações de tools no Chat e na tela pertencem ao `DurableRun` em `.gasclaw/runs/`; o Drive é a fonte da verdade.
2. A credencial vale **24 h**, é vinculada a `DurableRun.user`, à chave exata do `Pending` e é consumida uma vez.
3. Só o SHA-256 do token fica no Drive. O token bruto aparece no card e, na tela, pode usar o cache apenas como atalho descartável.
4. `RunIO.decide` lê o arquivo autoritativo sob `ScriptLock`, aplica a transição pura, publica o ponteiro `R:` e confirma a decisão no Drive antes de soltar a trava. O pump usa a mesma trava, portanto não enxerga o ponteiro antes da confirmação; se o Drive falhar, o ponteiro é removido. O pump roda depois, fora da trava.
5. Credencial expirada não aprova nem refaz o turno: o run continua `waiting`, preserva snapshot/pending e recebe outra credencial na próxima interação.
6. O ator vem exclusivamente de `e.user.email` no Chat ou `assertOwner()` na tela. Parâmetros do cliente nunca informam identidade.
7. Perguntas `ask` continuam no ticket legado de dez minutos; migrá-las exigiria um índice durável por sessão e não reduz o risco de efeito que motivou P20.

## Consequências

- A perda total do CacheService não invalida uma aprovação já entregue.
- Terceiro, token errado e clique repetido não alteram o run nem reenfileiram trabalho.
- Uma curta escrita de Drive ocorre sob a trava global para garantir consumo único. Nenhuma chamada LLM/tool ocorre sob essa trava.
- Runs `waiting` antigos sem credencial recebem uma sob demanda, sem replay.
- Entrega assíncrona de um novo card pelo gatilho continua fora do escopo (P2).

## POC P20

A [POC real](../../poc/p20-approval/README.md) remove o cache do run e usa Drive, `RunIO.decide`, fila e runner reais com relógio controlado.

Resultado no dev v74: **5/5**.

- retomada após 660.001 ms, status `done`, LLM 2, passos 1, efeitos 1;
- terceiro recusado sem consumo; solicitante aceito depois;
- clique duplo recusado sem novo passo/efeito;
- em 24 h, rotação preservou `waiting`, pending/snapshot e contador de LLM; nova credencial concluiu uma vez;
- Chat e tela exercitaram o mesmo store durável.

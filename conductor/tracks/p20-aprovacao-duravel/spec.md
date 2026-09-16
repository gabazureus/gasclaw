# Spec: P20 — aprovação durável

## Problem & purpose

Os cards do Google Chat guardam todo o estado do turno no `CacheService` por dez minutos. Um run longo já sobrevive no Drive, mas sua aprovação ainda pode desaparecer antes de o solicitante responder. P20 torna a aprovação parte do `DurableRun`, com a mesma semântica na tela e no Chat.

## Design concept

A pendência e sua aprovação pertencem ao run durável no Drive. Uma credencial opaca apenas autoriza a transição daquele run, daquela pendência e daquele solicitante; cache pode acelerar, nunca decidir. O consumo ocorre uma vez, sob trava, antes de reenfileirar. Após 24 horas a credencial expira, mas o run continua `waiting` e pode receber outra credencial para a mesma pendência sem chamar novamente o LLM nem repetir efeitos.

## Scope

- **In scope:** aprovações de tools na tela e no Google Chat; validade de 24 h; vínculo ao solicitante; uso único; rotação após expiração; Drive como fonte da verdade; POC real no dev sem cache.
- **Out of scope:** perguntas `ask` (continuam no ticket legado de 10 min), envio assíncrono de novos cards pelo gatilho (P2), push/prod, serviço externo, nova dependência, assinatura criptográfica, replay determinístico e mudança da política `never|once|always`.

## Behavior

- **Happy path:** um run `waiting` emite uma credencial; o solicitante responde até 24 h depois; a transição durável para `queued` ocorre uma vez e o run retoma do snapshot existente.
- **Cache perdido:** apagar o `CacheService` não altera o resultado; o run e a aprovação são lidos do Drive.
- **Terceiro:** ator diferente do `DurableRun.user` recebe recusa; o run continua `waiting` com a mesma credencial válida.
- **Clique duplo:** depois do primeiro consumo, qualquer repetição é recusada; não há segundo enqueue, passo, chamada ao LLM ou efeito.
- **Expiração:** a credencial vencida não aprova. O run permanece `waiting`; uma nova credencial é emitida para o mesmo `Pending` e pode ser usada pelo solicitante.
- **Falha de persistência:** nenhuma decisão é considerada consumida nem reenfileirada sem o novo estado confirmado no Drive.

## Module & interface changes

### `approval` — modificado — crítico

- **Purpose:** decidir emissão, validação, consumo e rotação sem I/O.
- **Interface:**
  - `ApprovalGrant = { tokenHash: string; pendingKey: string; user: string; expiresAt: number }`
  - `issueGrant(pending, user, tokenHash, now): ApprovalGrant`
  - `redeemGrant(run, tokenHash, actor, decision, now, replacementHash): ApprovalResult`
  - `approvalCard(ref, text)` inclui `runId`, `folderId` e token opaco.
- **Core vs. shell:** regras e transições puras aqui; Drive, cache, lock e eventos ficam fora.
- **Boundary:** recebe valores já normalizados; nunca chama serviços GAS.
- **Delegation:** revisão completa por tocar autorização e efeitos irreversíveis.

### `run` — modificado — crítico

- **Purpose:** guardar a aprovação junto ao `Pending` e aplicar a decisão sem apagar o snapshot.
- **Interface:** `DurableRun.approval?: ApprovalGrant`; parsing compatível com runs antigos sem o campo.
- **Invariant:** `approval.pendingKey === pending.key`; uma aprovação só existe em `waiting`.
- **Delegation:** revisão completa.

### `runStore` — modificado — crítico

- **Purpose:** fornecer consumo atômico Drive-backed.
- **Interface:** `decide(folderId, runId, request, now): DecideResult` lê a fonte durável sob trava, aplica o core, publica o ponteiro `R:` e confirma `queued + decision` no Drive antes de retornar; o ponteiro é removido se a gravação falhar.
- **Boundary:** o cache é atualizado/removido depois da escrita, mas nunca substitui a leitura autoritativa usada na decisão.
- **Delegation:** revisão completa por concorrência e autorização.

### `chat` / `main` — modificados — críticos

- **Purpose:** Chat e tela criam/retomam o mesmo `DurableRun`; o card deixa de carregar um snapshot cache-backed.
- **Interface:** cards de aprovação enviam localizador (`folderId`, `runId`) e token; `runDecide` e clique do Chat passam ator e decisão ao store durável. `ask` continua no caminho legado.
- **Boundary:** identidade vem do evento autenticado (`e.user.email`) ou `assertOwner`; parâmetros do cliente nunca definem o ator.
- **Delegation:** revisão completa.

### `approvalStore` — reduzido/modificado — crítico

- **Purpose:** gerar/hash token e adaptar aprovações de tool ao `RunIO`; tickets completos permanecem somente para `ask`.
- **Interface:** `newToken()`, `hashToken(token)`, `durableApprovals(io, legacyTickets)`.
- **Delegation:** revisão completa.

## Data

`DurableRun` no Drive é a fonte da verdade:

```ts
approval?: {
  tokenHash: string;
  pendingKey: string;
  user: string;
  expiresAt: number;
}
```

Transições:

- `waiting + credencial válida + solicitante` → grava `queued + decision`, remove `approval` e cria o ponteiro antes de soltar a trava;
- `waiting + terceiro` → sem mudança;
- `waiting + vencida` → grava nova credencial, mantém snapshot/pending/status;
- `queued|running|done|failed + clique` → sem mudança.

Runs antigos `waiting` sem `approval` recebem uma credencial sob demanda, sem refazer o turno.

## Testing strategy

- Testes puros em `approval`/`run`: 24 h exatas, terceiro, token/pending incorretos, rotação e segundo consumo.
- Testes de `runStore` com porta de arquivos: Drive autoritativo apesar de cache vazio ou velho; duas decisões concorrentes resultam em uma transição.
- Testes de integração em Chat e tela: identidade vem da borda e o card contém referência mínima.
- Teste do runner: a decisão reivindica o `runId` escolhido e não um run mais antigo da fila.
- POC real GAS em `poc/p20-approval/`: remove/ignora cache, usa Drive real e relógio controlado; mede enqueue, passos, LLM e efeitos.

## Acceptance criteria

- [x] C1: após remover o cache e avançar o relógio além de 10 min, o solicitante aprova pelo estado no Drive e o run retoma sem replay.
- [x] C2: terceiro é recusado sem consumir; o solicitante ainda usa a mesma credencial.
- [x] C3: clique duplo produz exatamente um enqueue, uma retomada e no máximo um efeito.
- [x] C4: após 24 h, a credencial antiga é recusada, o run permanece `waiting`, recebe nova credencial para o mesmo `Pending` e retoma sem nova chamada prévia ao LLM.
- [x] C5: aprovações de tools no Chat e na tela usam o mesmo contrato durável; nenhum snapshot de aprovação depende do CacheService (`ask` permanece explicitamente legado).

## Open questions / risks

- A escrita no Drive sob `ScriptLock` aumenta brevemente a contenção, mas é necessária para consumo único. A POC deve medir o tempo e confirmar margem segura.
- Só o SHA-256 da credencial fica no Drive; o token bruto vive no card/resposta. O vínculo à identidade autenticada continua sendo a autorização principal.

---
<!-- beads_epic: gasclaw-7yt -->

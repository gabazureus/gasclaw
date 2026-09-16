# Decisions — P20 aprovação durável

## ADR-001: aprovação pertence ao run no Drive
- **Date:** 2026-09-16
- **Status:** accepted
- **Context:** o ticket atual funde consentimento com um valor do CacheService que expira em dez minutos.
- **Decision:** guardar hash da credencial, pendência, solicitante e validade no `DurableRun`; cache é apenas atalho descartável.
- **Why:** reutiliza a durabilidade já medida pela P4/P19 e elimina dois estados concorrentes.
- **Alternatives considered:** copiar o ticket para outro arquivo (duplicação); manter cache com TTL maior (continua não durável); token stateless assinado (mais chave, revogação e código).
- **Consequences:** decisões precisam ler e gravar Drive atomicamente; runs antigos requerem emissão sob demanda.

## ADR-002: validade de 24 h com rotação, sem replay
- **Date:** 2026-09-16
- **Status:** accepted
- **Context:** uma aprovação pode esperar além da execução e do cache, mas não deve ficar aberta para sempre.
- **Decision:** ao vencer, manter `waiting` e o mesmo `Pending`/snapshot; emitir nova credencial somente quando houver interação.
- **Why:** preserva trabalho e evita ampliar P20 para cards assíncronos do gatilho.
- **Alternatives considered:** falhar o run; validade infinita; reenvio automático (P2).
- **Consequences:** clicar credencial vencida não aprova; a resposta deve fornecer a credencial renovada.

## ADR-003: ator vem da borda autenticada
- **Date:** 2026-09-16
- **Status:** accepted
- **Context:** parâmetros do card/browser são controláveis pelo cliente.
- **Decision:** comparar `DurableRun.user` apenas com `e.user.email` no Chat ou `assertOwner()` na tela; nunca aceitar usuário dos parâmetros.
- **Why:** vínculo ao solicitante é autorização, não metadado de UI.
- **Alternatives considered:** confiar na sessão ou no token isoladamente.
- **Consequences:** terceiro não consome nem rotaciona a credencial.

## ADR-004: consumo e enqueue formam uma transição durável
- **Date:** 2026-09-16
- **Status:** accepted
- **Context:** gravar a decisão e só depois reenfileirar fora da trava cria uma janela em que uma queda deixa o run `queued` sem ponteiro.
- **Decision:** sob a mesma `ScriptLock`, ler o arquivo autoritativo, validar, publicar o ponteiro `R:` e gravar `queued + decision` no Drive; como o pump usa a mesma trava, o ponteiro não é observável antes da confirmação. Se o Drive falhar, remover o ponteiro; soltar a trava antes de executar qualquer passo.
- **Why:** garante uso único e retomada sem segurar a trava durante LLM/tools.
- **Alternatives considered:** duas chamadas independentes; confiar no cache; manter a trava durante o pump.
- **Consequences:** uma escrita curta no Drive ocorre sob a trava global e deve ser medida na POC.

## ADR-005: token bruto não é persistido
- **Date:** 2026-09-16
- **Status:** accepted
- **Context:** a pasta do agente pode ser compartilhada; o arquivo do run não deve revelar a credencial do card.
- **Decision:** persistir SHA-256 via `Utilities.computeDigest`; token bruto só atravessa o card/callback.
- **Why:** usa primitiva nativa GAS, sem dependência nem segredo adicional.
- **Alternatives considered:** token em claro mais vínculo por e-mail; token assinado com chave gerenciada.
- **Consequences:** a borda calcula o hash antes de chamar o núcleo puro.

## ADR-006: P20 não migra perguntas `ask`
- **Date:** 2026-09-16
- **Status:** accepted
- **Context:** `ask` usa o mesmo tipo legado de ticket, mas não autoriza efeito e sua resposta livre depende de localizar a sessão quando chega uma nova mensagem.
- **Decision:** o adaptador manda apenas `Pending.kind === approval` ao run durável; `ask` segue no CacheService por dez minutos.
- **Why:** cumpre a ameaça e os critérios de P20 sem criar índice durável de sessão nem ampliar a entrega assíncrona.
- **Alternatives considered:** migrar todo `Ticket`; varrer arquivos de runs por sessão; índice adicional em Properties.
- **Consequences:** o contrato único desta entrega vale para aprovação de tools; `ask` durável poderá ser uma POC própria se necessário.

## ADR-007: a retomada é direcionada ao run decidido
- **Date:** 2026-09-16
- **Status:** accepted
- **Context:** o `runDecide` atual reenfileira um run e chama o pump global, que pode reivindicar outro ponteiro mais antigo.
- **Decision:** expor no runner uma volta direcionada que usa `RunIO.claimById` e compartilha a mesma rotina de settle/falha.
- **Why:** o callback precisa responder sobre a decisão que acabou de consumir e o teste de clique duplo precisa medir o run exato.
- **Alternatives considered:** aceitar processamento assíncrono; reordenar a fila; duplicar a lógica do pump em `main`.
- **Consequences:** pequena extensão do runner, coberta por regressão e revisão completa.

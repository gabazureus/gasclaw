# ADR-029 — Autoridade do run mora nas Script Properties, não no arquivo

- **Status:** Implementado (fatias 1, 2 e 3) · 2026-09-18 · decisão do usuário: "Opção 2 — a autoridade migra para o ponteiro"
- **Complementa:** [ADR-021](021-acesso-aprovado-no-painel.md) (acesso aprovado no painel), [ADR-026](026-run-duravel.md) (run durável), [ADR-028](028-aprovacao-duravel.md) (aprovação durável)

## Contexto

A auditoria de 2026-09-18 mostrou que o JSON do run (`.gasclaw/runs/<runId>.json`) é **portador de
autoridade** e mora na pasta do agente — a mesma pasta que o produto manda compartilhar. `parseRun`
valida **forma**, nunca **autenticidade**: quem tem edição na pasta reescreve os campos que o motor usa
como decisão de segurança.

Campos afetados, por gravidade:

| Campo | O que um editor da pasta consegue |
|---|---|
| `delivery.space` | a resposta do dono é publicada **no espaço do atacante** — exfiltração direta, **sem depender de clique** |
| `ownerDm` | vira `true` e o run passa a enxergar a **memória privada** do dono |
| `snapshot.queue[0].arguments` | o card mostra `to: chefe@`, o dono aprova, executa `to: atacante@` |
| `user` | `isOwner` vira true e libera as ferramentas do Google |
| `granted` | pula o card de aprovação de uma tool `once` |

### Por que `argsHash` dentro do arquivo não resolve

A primeira proposta foi gravar um `argsHash` no `ApprovalGrant`. Não funciona: `parseRun` repassa
`o.approval` inteiro sem validar (`src/run.ts:254`), então o hash mora **no mesmo arquivo** que os
argumentos que ele deveria proteger. O atacante troca `pending.args`, `snapshot.queue[0]` **e**
`approval.argsHash` na mesma edição; o `tokenHash` continua batendo porque ele não precisou tocá-lo.
Um cadeado dentro da caixa que ele tranca.

Só existem duas âncoras fora do alcance de quem edita a pasta: o **token bruto** (o usuário tem; no
arquivo só o SHA-256) e o **ponteiro da fila** nas Script Properties (`R:<runId>`).

## Decisão

A autoridade do run migra para o **ponteiro**, nas Script Properties.

Isto **não é arquitetura nova**: é o princípio que o [ADR-021](021-acesso-aprovado-no-painel.md) já
adota para `ACCESS:<folderId>` — a pasta *sugere*, o dono *aprova*, e o efetivo mora nas Script
Properties, fora da pasta compartilhável. Aqui a fonte é o evento autenticado do Chat em vez do painel,
mas a regra é a mesma: **o que decide segurança não pode morar onde terceiros escrevem.**

### O container: `A:<runId>`, não o ponteiro `R:`

A fatia 1 nasceu guardando o destino no ponteiro `R:`. **Estava errado, e o furo foi confirmado por teste:**
o ponteiro é apagado quando o run sai da fila para esperar o usuário, e é justamente aí — com uma aprovação
pendente — que o atacante tem a janela mais longa para editar o arquivo. Na aprovação, `decide` recriava o
ponteiro relendo o destino **do arquivo**, e a guarda evaporava exatamente no fluxo que ela deveria proteger.

A autoridade vive num registro próprio, `A:<runId>`, com a vida do **run** e não a da fila:

```
RunAuthority = { space?, thread?, auth }
```

- `space`/`thread` — imutáveis: fixados na primeira gravação e **nunca rederivados do arquivo**. Sem essa
  "stickiness" a guarda se autodestruiria (bastaria editar o JSON e esperar a próxima gravação adotá-lo).
- `auth` — **muda a cada passo legítimo**: é a assinatura do estado que *nós* acabamos de persistir.

A distinção entre campo imutável e campo que muda a cada passo é o que impede o conserto de quebrar o
funcionamento normal: aplicar "primeira gravação vence" em `granted` ou `snapshot` travaria todo run.

### O que é assinado

`runAuthority(run)` (`src/run.ts`) produz a string canônica de **todos** os campos do run, exceto uma lista
curta de exceções justificadas — o padrão é *assinar*, para um campo novo nascer protegido em vez de nascer
esquecido:

| Fora da assinatura | Por quê |
|---|---|
| `delivery` | muda por `save` fora do `enqueue` (recibo, desistência); o destino é protegido por `space`/`thread` |
| `inflight` | gravado por `beforeEffect` no meio do passo |
| `updatedAt` | carimbo desses mesmos saves fora de banda |

`Required<DurableRun>` no teste força o TypeScript a **quebrar o build** quando alguém acrescenta um campo
sem classificá-lo. Verificado na prática: adicionar um campo novo falha a compilação do teste.

A assinatura normaliza pelo mesmo `parseRun` dos dois lados antes de serializar — a guarda não pode recusar
um run legítimo por ordem de chave ou coerção de número.

**SHA-256, e não a string canônica inteira**, porque ela inclui o `snapshot` com a conversa toda e
estouraria os 9 KB por valor. A colisão não é explorável aqui: seria preciso um **segundo preimage** — um
estado adulterado cuja string bata com um digest que *nós* fixamos e o atacante não escolheu. É o oposto do
`jobId` da P22, que usa djb2 de 32 bits e por isso é documentado como "NÃO é credencial".

### Onde se verifica

- **No claim** (`claimNext`/`claimById`): divergência marca `tampered`, e o `runner` recusa o run inteiro —
  não executa e **não entrega**, porque o conteúdo também é suspeito.
- **No `decide`**: antes de `redeemGrant`. É o que fecha a fatia 2 — o card mostrou `to: chefe@`, o arquivo
  foi trocado para `to: atacante@`, e a aprovação é **recusada**.
- **Na entrega**: `authorizedDelivery` compara o arquivo com `A:` e publica no destino **registrado**.

### A janela que ISTO NÃO cobre

Escrito explicitamente para ninguém supor cobertura que não existe:

- **Coberto:** qualquer edição do arquivo entre o nosso último `save` e o próximo claim/aprovação/entrega.
  É a janela real do ataque, e é onde ela é mais longa (run `waiting`).
- **Não coberto:** adulteração de algo que **nunca chegou a ser gravado por nós**. O modelo assume que o
  primeiro estado veio do gasclaw — o que é verdade, porque o run nasce do evento autenticado do Chat.
- **Não coberto:** apagar o arquivo do run (o Drive é a fonte do estado). O ponteiro órfão é limpo sozinho;
  o efeito é perder a tarefa, não executar algo indevido — falha fechada.
- **Não coberto:** o conteúdo que o agente *lê* da pasta (`AGENTS.md`, skills, memória). Isso é injeção de
  prompt, problema distinto, e continua valendo o ADR-002 (nada da pasta vira código).

### Runs legados

Um run gravado antes desta versão não tem `A:`. **Falha fechado:** o claim marca `tampered` e a aprovação é
recusada. A resposta **não se perde** — fica no Drive com `answer` preenchido e aparece no painel.

Consequência aceita: um run do Chat em voo no dev (v84) no momento da atualização é lido pelo painel em vez
de entregue no Chat. Prod está na v1 e não usa este caminho.

## Script Properties: medição, fallback e limpeza

**Por que não uma planilha na pasta do agente.** Foi cogitado e **recusado**: a pasta é compartilhável por
desenho, então uma planilha dentro dela tem o mesmo dono, as mesmas permissões e o mesmo atacante. Trocaria
um arquivo editável por outro — é regressão de segurança, não trade-off de latência. Planilha para dado
**sem autoridade** (trace, métricas) continua sendo a escolha certa, e já é usada.

**Medição** (ids do tamanho real do Google Chat, não estimativa):

| | bytes |
|---|---|
| ponteiro `R:` | 334 |
| autoridade `A:` | 157 |
| **por run em voo** | **491** (antes: 334) |

Se *todo* o espaço fosse dos runs, caberiam ~1.000 simultâneos (antes ~1.500). Mas os 500 KB são
**compartilhados** com `Q:` (trace), `USAGE:`, `ACCESS:`, `MODEL:`, `JOB:`, `STALE:` e `RUNNING:` — o teto
que morde é o agregado. O total ao vivo sai do painel de limites (`propsBytes`, medido em `observe.ts`
contra 500_000); **não estimar**. Há teste travando o custo por run abaixo de 600 bytes.

**Fallback falha FECHADO.** Se `setProperty` falhar por espaço, a operação para com recado compreensível
("não consegui registrar a tarefa nas Script Properties… Abra o painel de limites"). **Nunca** cai no
arquivo do Drive como plano B: isso trocaria a garantia de segurança por conveniência sem ninguém notar.
Testado: Properties indisponíveis → exceção honesta e **nenhuma** autoridade meia-boca gravada.

**Limpeza.** `isFinished(run)` (respondeu e não há entrega pendente) dispara `io.forget(runId)`, no `settle`
e depois da entrega. Um run que só saiu da fila para *esperar* o usuário mantém a autoridade. Testado: run
terminal não deixa `R:` nem `A:` para trás.

## Consequências

- Custo por run em voo: 334 → 491 bytes nas Properties (medido).
- `RunIO` ganhou `authority(runId)` e `forget(runId)`; `claimNext`/`claimById` ganharam `tampered`.
  O compilador encontra quem esquecer de passar a autoridade.
- `persist` assina **todo** estado que gravamos, não só o enfileirado: um run que para para pedir aprovação
  é persistido por `save`, nunca por `enqueue`, e é ele que fica mais exposto.

## Alternativa descartada

**Vincular ao token bruto** (`argsHash = H(token ‖ args)`). Fecha a aprovação, mas deixa aberto o que não
exige clique nenhum — `delivery.space` e `ownerDm` — que é justamente o pior caso.

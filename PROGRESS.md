# PROGRESS — gasclaw

> Onde o gasclaw está, item por item, e se já foi resolvido.
>
> ⚠️ **ESCOPO DESTA BRANCH (`consertos-e-reach-out`):** ela leva os consertos e o **Reach out**, e
> **não** leva o auto-aprimoramento. As seções **F5** (sonho, linhagem, filhos), **F6** (enxame),
> **F7** (sucessor por patch) e **F8** (herança e roteamento) descrevem áreas que **não existem
> aqui** — ficam como registro do que foi construído e medido na `evolucao-f5-f8`, não como estado
> deste código. O que vale nesta branch está em **F11**, no fim.
>
> **Atualizado em:** 2026-09-23 · **1632 testes** · `tsc` limpo · build limpo · dívida de idioma **149**
> · **Auditoria:** seis ✅ eram falsos. Critério: *algum módulo importa isto, e o símbolo aparece em `dist/_motor.js`?*
> · **P22 aprovada 4/4** · P24 **aprovada por inteiro** · P25 **reprovada** (sem combustível)
> · **P27 medida e REPROVADA** (o filho executa, o motor recusa o token dele: 401 da plataforma)
> · **P28 medida:** 0 linhas, 0 aglomerados — o instrumento existe e não houve falha, coisas diferentes
> · **3 ciclos de revisão CONCLUÍDOS:** 12 revisores, **30+ achados**, 1 **crítico**
> · · O crítico: o laço de sonho rodava os evals com **efeito real** na conta do dono e **apagava a
> memória curada dele** — destruição de dado por gatilho automático, na única capacidade ligada.
> · · A auditoria por **mutação** provou cada guarda: desfazer o conserto mata teste. Onde não matava,
> o teste era trocado — cinco formas de prova falsa foram encontradas e substituídas.
> **Fontes:** [spec](docs/specs/), [ADRs](docs/adr/README.md), [CHANGELOG](CHANGELOG.md),
> [log da wiki](docs/wiki/log.md), [pesquisa do sinal fraco](docs/pesquisa/2026-09-19-o-sinal-fraco-do-sonho.md)

## F5 — Agente que evolui (sonho, linhagem, filhos) · **não vale nesta branch**

**Legenda:** ✅ pronto e verificado · 🔨 em andamento · 📐 desenhado, não construído
· ⚠️ núcleo pronto, **sem fiação** · 🔒 fechado por decisão · ❌ reprovado na medição

| # | Funcionalidade | Status | O que falta / onde está |
|---|---|:--:|---|
| 1 | Capacidades por etiqueta (`dream`/`succeed`/`create`/`initiative`) | ✅ | No painel, aprovadas uma a uma, recusando o que não existe e dizendo o que falta |
| 2 | `create` singleton | ✅ | Por forma do dado: uma Property, um `folderId`. Dois criadores não são representáveis |
| 3 | Ciclo de vida (ativo → arquivado) | ✅ | Arquivado não roda, não é alvo de gatilho, derruba o que está em voo; chats legíveis |
| 4 | Congelamento de emergência | ✅ | **Fiado nesta rodada** — estava órfão: `CAPS_ENABLED` só aparecia num comentário e `effectiveCapabilities` tinha 0 no bundle. Agora vence toda aprovação individual, barra a sucessão e **aparece no painel** |
| 5 | Projetos filhos: criar, escrever, publicar | ✅ | **P24**: 10.754 + 1.122 + 868 ms, sem clasp |
| 6 | Isolamento de escopo entre projetos | ✅ | Filho com **1 escopo** contra 17 do pai, conferido por leitura de volta |
| 7 | Portão humano por especialista | ✅ | **Medido**: `Authorization needed`. Um clique cada, exigido pela plataforma |
| 8 | Tela para autorizar o filho | ✅ | Estado **conferido**, não guardado; escopos mostrados antes do botão |
| 9 | Automação × sub-agente | ✅ | Tipos distintos, fail-closed; **só o sub-agente precisa da chave** |
| 10 | Recusa de escrever no próprio projeto | ✅ | Quatro bordas em teste, exercitada no dev real |
| 11 | Conjuntos `gate`/`quality`/`holdout` | ✅ | Réguas separadas, rubrica 0–4, reservado fora da seleção |
| 12 | Núcleo do ciclo de sonho | ✅ | Plano de passos, retomada provada, veredito declarando o próprio alcance |
| 13 | Candidatos por temperatura | ✅ | Três temperaturas, frontmatter descartado |
| 14 | Fiação do ciclo de sonho | ✅ | `dreamTick.ts` no gatilho (5 passos/tique), juiz no bundle, contagem de falhas. Falta só MEDIR um ciclo real |
| 15 | **Proatividade** | ✅ | **P22 4/4** + F3a entregue: agenda no **painel** (não na pasta), auto-aprovação por lista fechada, falha honesta em vez de `paused`, `NO_REPLY` com span, **nenhum gatilho novo** |
| 16 | Mensagem entre agentes | ✅ | **Os 4 controles fiados e no bundle**, e agora existe a mensagem: `agent.message` no registro fechado, com card `always`. Um run repassado recebe `tools(A) ∩ tools(B)`, teto de 1 salto e recusa de volta |
| 17 | Sucessão com bastão e mandato | ✅ | Bastão, mandato com prazo e linhagem verificável. Coroar segue sendo ato humano: **não depende** do sonho, porque o sucessor é código |
| 18 | Organismo: contagem instrumentada | ✅ | **Ligado**: `failuresFrom` no passo do run durável, provado no bundle. Repetição no mesmo turno conta 1×, `deadline` não conta, eval não alimenta |
| 19 | Entrega da chave ao filho | ❌ | O núcleo está certo, mas **`KEYSEC:<filho>` nunca é ESCRITO** — só lido. `cliAuthorized(null, …)` é sempre falso, logo a entrega **sempre recusa**. E o filho, sendo outro projeto, **não tem rota HTTP** para pedir |
| 20 | Campos declarados do agente | ✅ | `.gasclaw/fields.json` declara, painel decide, servidor valida. Órfão preservado e mostrado |
| 21 | Teto familiar de gasto | ✅ | **Age**: `writeSuccessor` lê `capAction` e recusa em `stop-creating` e em `freeze`. Nunca corta a chave — isso pararia o pai também (ADR-040) |
| 22 | Personas e repasse | ✅ | Tool `persona` no registro + `runPersona` no motor, **chamados no bundle**. Interseção dupla; só ferramentas sem aprovação, porque de dentro de uma tool não há caminho até o card |
| 23 | **Sucessor como CÓDIGO NOVO (Opus 5)** | ✅ | `codegen.ts` + `successor.ts`: crivo fechado (sem `eval`, sem token OAuth, sem a API do Apps Script, sem chave no fonte), escopos **estritamente menores** que os do motor, teto diário agregado, e o filho nasce precisando do consentimento do dono |

### Revisão em ciclos — o que ela custou (2026-09-20)

Quatro revisores independentes, dois ciclos. **O achado mais valioso não foi um defeito de produto:
foi descobrir que eu estava PROVANDO COISAS ERRADAS**, em cinco formas:

| Forma | Parecia | Era |
|---|---|---|
| `toContain("'dream'")` | prova da guarda | **tautologia** — a âncora da fatia já continha a string |
| `toMatch(/approval === 'never'/)` | prova do filtro | defendia **metade**; apagar `ownerOnly` passava |
| `toContain('subagentTools')` | prova da interseção | **a linha de import** satisfazia |
| oráculo `DREAMLOCK:` | prova por comportamento | **falso em todo estado possível** do stub |
| `toContain('capsAfterSuccession(caps,')` | prova da regra | **defendia o uso errado** — teste hostil |

Todos foram substituídos por testes de comportamento com **mutação conferida**: desfazer o conserto
mata teste. E três defeitos do ciclo 2 eu declarei consertados **sem estarem no código** — `git
checkout` levou junto o não commitado. A regra agora: **commitar antes de mutar**.

| Severidade | Achado |
|---|---|
| **ALTA** | `screenApproval` **re-assinava run adulterado** — o motor era um oráculo de assinatura |
| **ALTA** | arquivar não desligava nada na **conversa** (o antecessor seguia sendo o agente padrão) |
| **ALTA** | `passBaton` **requebrava** o singleton do `create` |
| **ALTA** | `agent.create`/`agent.message` eram **auto-aprováveis** em run proativo |
| **ALTA** | `claimable` órfão: arquivar não encerrava lease, run nem card |
| **ALTA** | chave do OpenRouter ia para o trace pela sonda P27 |
| MÉDIA | `ask` pendurava run proativo · `KEYDEL:` sem saída · `passBaton` sem lock e em ordem invertida · token de 16 escopos para URL de Property |

### Fechados nesta rodada (2026-09-20)

| # | Item | Prova no bundle |
|---|---|---|
| 24 | Alimentar o contador de falhas | `failuresFrom` chamado no passo do run durável |
| 25 / 28 | Proatividade (F3a) | `tickProactive`, `mayAutoApprove`, `onProactiveBlock`, `noReplySpan`, `dueJobs` |
| 31 | Personas | `subagentTools`, `runPersona` |
| 32 / 16 | `agent.message` + os 4 controles | `foreignMessage`, `relayToAgent`, `toolsOfAgent` |
| 4 | Congelamento de emergência | `effectiveCapabilities`, `capsEnabled` |
| 34 / 21 | Teto familiar com efeito | `capAction`, `familySpendQuiet` |
| 35 / 36 | Telas: linhagem e DreamBoard | `diffLines` no motor; `showDreamBoard`/`showLineage`/`showSchedule` em `dist/settings.html` |
| 37 / 38 | Vocabulário + ADR-042 | — (documentação) |
| 39 | Dívida de idioma | 208 → **203**, catraca desceu |

### Lacuna declarada: as duas guardas do run proativo (2026-09-20)

Duas guardas do motor existem, estão no bundle, e **matam zero testes quando mutadas**:

| Guarda | Onde | Estado |
|---|---|---|
| run proativo pedindo `ask` **falha** em vez de ficar `waiting` | `main.ts`, após o `chatTurn` | sem prova de comportamento |
| tool de `NEVER_AUTO` **não** é auto-aprovada nem estando na lista | idem | sem prova de comportamento |

Tentei provar por comportamento e não consegui. O que **já foi descartado** como causa, para a
próxima tentativa não recomeçar do zero:

- as ferramentas chegam ao agente (`allowedTools` devolve `now, ask, gmail.send`);
- os argumentos estavam certos depois do primeiro erro meu (`ask` exige `question`, não `text`);
- o run gravado tem `proactive: true` e `ownerDm: false`;
- o stub serve `tool_calls` de verdade (conferido chamando `complete()` diretamente).

Mesmo assim o turno termina `done` com `answer: "ok"` e `done: {}` — a ferramenta é **recusada antes
de virar pendência**, e eu não descobri por quê. O controle positivo do arquivo passa, então o laço
funciona; o que falta é entender a recusa.

**Por que fica declarado em vez de "coberto":** deixar um teste que passa sem exercitar a guarda seria
a sexta forma de prova falsa desta sessão. As outras cinco estão listadas acima.

### O que falta — auditoria de 2026-09-20

> Numeração **contínua** a partir do item 23. Cada linha diz o **motivo verificado**, não a impressão.
> Quatro itens acima foram **rebaixados nesta auditoria** (16, 18, 19, 21, 22): o critério foi
> *"algum módulo importa isto, e o símbolo aparece no bundle?"* — e não *"tem teste verde?"*.
> Código testado que ninguém chama parece pronto e não está.

| # | O que falta | Por que ainda não está pronto | Depende de |
|---|---|---|---|
| ~~24~~ | ✅ **Alimentar o contador de falhas** | `recordFailure` tem **0 call sites**: nenhum run que termina mal o chama. É a causa raiz de o trace ter zero aglomerados — e, portanto, de 26, 27, 29 e 30 estarem travados | nada — pode começar, e destrava 4 itens |
| ~~25~~ | ✅ **Fiar `autoApprove.ts`** | Órfão, 0 ocorrências no bundle. A F3a inteira depende dele | nada |
| 26 | Medir um ciclo de sonho real | **P28 medida (2026-09-20, v119): 0 linhas, 0 aglomerados.** O instrumento existe e foi verificado à parte (passo `wired`), então zero significa *nenhum run falhou* — não *não há como contar*, que foi a leitura errada da P25 | uso real |
| 27 | C2–C5 da P23 | Medem custo de ciclo, e não há ciclo para medir | 26 |
| ~~28~~ | ✅ **Proatividade (F3a)** | Agenda sai da pasta e vai para o painel, falha honesta em vez de `paused`, lista fechada de auto-aprovação, `NO_REPLY` com span, **sem gatilho novo** | 25 |
| 29 | Poda do organismo | O gatilho inverso: especialista ocioso propõe a própria aposentadoria; o que não reduziu o aglomerado é arquivado | 26 |
| 30 | Limiar do aglomerado | Segue em 3 ocorrências, **marcado no código como palpite**. Com 0 linhas medidas não há como calibrá-lo, e calibrar no olho seria trocar um palpite por outro com cara de medida | 26 |
| ~~31~~ | ✅ **Fiar `subagent.ts` (personas)** | Órfão, 0 no bundle. É também o **quarto controle** do item 16: a interseção de ferramentas no repasse | nada |
| ~~32~~ | ✅ **Ferramenta `agent.*` no registro fechado** | Não existe nenhuma. Os controles do item 16 protegem um mecanismo que **ainda não foi construído** | 31 (a interseção precisa existir antes do repasse) |
| ~~45~~ | ✅ **F6 · P29: o teto da plataforma** | Custo US$ 0, não chama o Opus. **C1** 5/5 criados, nenhum 429, 8–11 s cada · **C2** 40 `projects.create` no mesmo dia **sem uma recusa** do Google · **C3** 20/20 autorizados, e foi ela que CONFIRMOU a previsão do 302 · **C4** 20/20 na lixeira. dev v132–v135 | [POC P29](poc/p29-enxame/README.md) |
| ~~46~~ | ✅ **D1: a linhagem passa a encadear** | `incumbentSource` era o PROMPT em toda geração — a geração N+1 nunca recebia o código da N. `heirOf` + `sourceOfChild`, fonte pela API, nunca do Drive. 5 mutações, 5 mortas | P30 |
| ~~47~~ | ✅ **D2: existe aptidão** | `delta: null` sempre. Contrato CORRIGIDO: o pedido deixava o filho dar a própria nota. Agora entrada → saída, e o motor compara. 8 mutações no núcleo, 6 na fiação | P31 |
| ~~48~~ | ✅ **D3: o registro cabia 11, não 40** | `MAX_CHILDREN = 40` era inalcançável: uma Property de 8 KB estourava em 11 filhos com `reason` cheio. A corrida de 15 quebraria no 12º, com o Opus já pago. Registro partido em até 8 pedaços | achado pela P29 |
| ~~49~~ | ✅ **D4: o intervalo nunca foi ligado** | `intervalOf(undefined)` — sempre 24 h, e ninguém podia declarar outro. 3 gerações numa sessão eram impossíveis | `GENINT:` |
| ~~50~~ | ✅ **D5: o objetivo era cortado em silêncio** | `.slice(0, 500)` num enunciado de 1047 chars: o Opus seria julgado por regras que nunca recebeu, a US$ 1 por vez. Agora RECUSA, como `narrowScopes` | `GOAL_MAX` |
| ~~51~~ | ✅ **D6: `down` não parava o que gasta** | **Achado RODANDO, não lendo.** Com o motor pausado, `swarm run` foi até o OpenRouter — quem recusou foi a fatura. `mayAct` não lia `isEnabled`: a chave parava o que FALA e deixava correr o que PAGA | 2 mutações, 2 mortas |
| ~~52~~ | ✅ **Seleção por aptidão** | `bestHeirOf`: a próxima geração parte do MELHOR medido, por TAXA e não por contagem. Sem isso, encadear é deriva — variação sem seleção | — |
| ~~53~~ | ✅ **Orçamento que volta sozinho** | O teto da corrida expira: "devolva os tetos ao fim" deixou de ser passo e virou relógio. Fail-closed na direção certa — corrompido vira o teto BAIXO | `budget.ts` |
| 54 | Corrida de 3 gerações | 🔄 **EM ANDAMENTO** (dev v145). Crédito e credencial resolvidos pelo dono. **Geração 1 nasceu** (`1XQ3qlqu…`, US$ 0,109) — escrita pelo Opus, passou pelo crivo, implantada; a primeira tentativa (US$ 0,108) foi recusada por um **falso positivo MEU** (D7 e a regex) e **não conta**. **H4 provado com a corrida viva**: `too soon` → `down` → `everything is paused`. Falta: medir o filho 1 (clique do dono), gerações 2 e 3, uma recusa pelo crivo corrigido, devolver os tetos | clique do dono + relógio |
| ~~55~~ | ✅ **F7 · P32: o Opus devolve um patch do motor inteiro** | dev v147: 252.504 tokens de entrada, 43 s, 1 troca, US$ 1,33 — e a troca achou um **defeito real** (o job de 00:00 nunca disparava), portado para `src/schedule.ts` com teste | ADR-043 |
| ~~56~~ | ✅ **F7 · P33: um agente inteiro sobe como outro projeto** | C1 e C3 medidos; C2 (nasce parado) e C4 (conversa) com evidência **indireta** — o dono ativou antes da leitura. Achado: cada sucessor custa **três** atos ao dono (vincular o GCP, autorizar, colar a chave), não dois. Auditoria: código idêntico ao do pai, nenhuma guarda enfraquecida, semente sem segredo | [poc/p33](poc/p33-agente-sucessor/README.md) |
| ~~57~~ | ✅ **F7 · P34: o pai avalia o sucessor de fora** | dev v151, 6 cenários: o pai conduz, o juiz é o DELE, nenhum veredito vazou. **Empate 5×5** — e o empate é o resultado certo (motores idênticos). Consequência: a bateria não toca o que um patch de código conserta | [poc/p34](poc/p34-avaliacao-de-fora/README.md) |
| ~~58~~ | ✅ **F7 · Fase 1: núcleo puro** | `parsePatch` (fail-closed), `applyPatch` (casa UMA vez, tudo ou nada), `guardsWeakened` (o crivo de GUARDAS) — com mutação em cada guarda | — |
| ~~59~~ | ✅ **F7 · Fase 2: a casca** | dev v152. `writeSuccessor` pede o PATCH do próprio código e implanta o sucessor parado; o que fazia antes virou `writeAutomation`. **Slot**: a próxima geração reusa o sucessor parado — o dono não refaz os três atos; um sucessor ligado nunca recebe código. `evaluateSuccessor` (o caminho da P34), `crownSuccessor` (o titular para ANTES e volta se falhar), porta `crown` só do pai da semente. Painel com escopos todos marcados, diff, explicação, nota. **47 testes novos, 34 mutações** (1 equivalente removida). Suíte 2066/2066 | 55–58 |
| ~~60~~ | ✅ **F7 · a primeira geração real** | dev v152, depois de o dono subir o teto (US$ 6 por 6 h, expira sozinho): **1 min 47 s, US$ 1,52**, gravada no MESMO projeto parado da P33 (slot — o dono não refez nenhum ato). O Opus achou um **defeito real** no ciclo de sonho: `planCycle` nunca planeja os passos de qualidade do TITULAR, então `summarize` sempre diz "not enough runs yet" e **nenhum candidato pode vencer** — conferido no `src/dreamTick.ts`. O sucessor implantado difere do pai em **uma linha**. Avaliação de fora: a 1ª voltou incompleta (HTTP 404 no `smoke`, propagação da versão nova) e a coroa foi **recusada**; a 2ª, **completa, empate 5×5**, coroa liberada como empate | 55–59 |
| ~~62~~ | ✅ **F7 · a coroa destravada pelo health do sucessor** | Pedido do dono (2026-09-21): a coroa na tela de **Projects**, e só com o health inteiro. **9 checagens**, lidas na hora: autorizado · semente do pai · parado · chave · escopos · **Drive legível** (o 403 do GCP) · **worker criável** (antes não se checava: o agente coroado nunca responderia) · **código = pai ATUAL + patch** (antes não se checava: coroar desfaria o que o pai ganhou depois) · avaliação **posterior** à última escrita e não pior. **Rebase** reaplica o mesmo patch sem Opus. No real (dev v153): o health reprovou 7/9 no sucessor antigo (sem a porta, pai mudado) → rebase → 8/9 (avaliação velha) → reavaliação 5×5 → **9/9, pronto para a coroa** | 60 |
| ~~61~~ | ✅ **F7 · Fase 3: o patch coroado de volta ao `src`** | `succession pull` gravou `succession/2026-09-21-1w3Pju8vyj9y.json`. A correção foi para o **núcleo puro** (`planCycle` recebe o titular: ele roda a qualidade, não o portão, e não duplica se um candidato for idêntico) e a casca passa o titular. 6 testes, 4/4 mutações. Commit 708928d | 60 + coroa |
| ~~63~~ | ✅ **A COROA — o primeiro sucessor coroado** | Dev, 2026-09-21: o dono clicou em Crown it com o health 9/9. Registro `CROWNED`, pai `enabled:false`, sucessor rodando | 62 |
| ~~64~~ | ✅ **Achado ao vivo: a coroa pela metade → dois motores** | Na primeira tentativa o sucessor RECEBEU a coroa (criou o worker e ligou), a resposta não chegou legível, e o pai — lendo fracasso — voltou a rodar. Causa: decidir pela RESPOSTA, e não pelo ESTADO. Agora o pai relê o estado do sucessor (`crownLanded`) e a coroa pela metade se conclui pelo clique (`halfCrowned`). 10 testes, 5/5 mutações. Commit 8de0544 | — |
| ~~65~~ | ✅ **Achado: o `up` religaria o pai coroado** | `./gasclaw up` chama `enable` a cada publicação — dois motores de novo. Agora o `enable` da CLI recusa com um sucessor coroado e o `up` avisa. **Provado no real (v156)**: "this engine stays paused". Na v155 o `enable` ainda foi aceito porque o Google serviu a versão ANTERIOR, sem a guarda, por alguns minutos (o atraso de propagação); o pai foi pausado na hora com `down`. Commit fee1a43 | — |
| ~~33~~ | ✅ **Entrega da chave ao filho: REMOVIDA** | ❌ **MEDIDO E REPROVADO (P27, dev v126)**: o filho executa (`code 200`) mas o motor recusa o token dele (`401`, página de login) — barrado pela PLATAFORMA antes do nosso código. **O dono escolheu a opção 4 (2026-09-20)**: filhos são só `automation`, que nunca falam com modelo. A rota `childkey`, `deliverKeyToChild`, `rearmChildKey`, o segredo por filho, a janela armada, a metade da entrega em `family.ts` e a sonda da P27 foram **removidos, não desligados**; `ChildKind` perdeu o membro `subagent`. Três defeitos achados na auditoria da remoção: `successor.ts` produzia `subagent` **sempre** (a guarda fail-closed nunca mordia), o crivo não proibia o filho de chamar provedor de modelo, e `parseChild` não rebaixava um `subagent` já gravado. **Custo declarado:** um filho não pode ter escopos OAuth próprios E um modelo — e é só isso. Prova: 1784 testes, 5 mutações, 5 testes mortos; `KEYSEC:` no bundle só dentro de `deleteProperty`. [ADR-040](docs/adr/040-isolamento-e-privilegio.md) | decisão do dono, tomada |
| ~~34~~ | ✅ **Teto familiar com efeito** |
| ~~40~~ | ✅ **`agent.create` no registro fechado** | Cria agente com pasta própria e **nada mais**: sem ferramenta, sem acesso, sem capacidade. `approval: 'always'` porque criar é o ato que multiplica |
| ~~41~~ | ✅ **Capacidades destravadas** | `initiative`, `succeed` e `create` com `missing: null`. Guarda **inversa** no teste: `missing: null` exige o mecanismo CHAMADO no bundle |
| ~~42~~ | ✅ **Painel: tabelas e Drive** | Filhos e arquivados em tabela; botão Drive no agente; `Remove`/`Forget` confirmam e dizem o que **não** apagam |
| ~~43~~ | ✅ **Portão da capacidade nos laços autônomos** | `tickProactive` e `tickDream` conferiam status e ignoravam a CAPACIDADE — defeito de privilégio achado na revisão desta rodada |
| ~~44~~ | ✅ **Catraca contra a agenda da pasta** | O motor está proibido de importar o parser do `jobs.md`: a agenda da pasta compartilhável não volta "porque já estava pronta" | `capAction` informa e nada age: ninguém lê `stop-creating`/`freeze` | nada |
| ~~35~~ | ✅ **Tela da sucessão e da linhagem** | `signMandate`, `passBaton`, `lineage` e `writeSuccessor` existem no servidor; o painel só mostra o último | nada |
| ~~36~~ | ✅ **Tela do ciclo de sonho (DreamBoard)** | `startAgentDream` e `agentDream` existem; falta a tela com diff e placar | nada |
| ~~37~~ | ✅ **Vocabulário "sub-agente"** | Significa duas coisas: declaração no run do pai (ADR-039) e projeto filho com pasta. Renomear a primeira para **persona** | nada |
| ~~38~~ | ✅ **ADR dos dois tipos de filho** | `automation` × `subagent` está no código e não em ADR | nada |
| ~~46~~ | ✅ **Singleton do `create`, dos dois lados** | O projeto afirmava "singleton por forma do dado" — e isso valia só para `CREATOR`. A lista `CAP:` guardava `create` no antecessor, e o portão que eu fiei lia a LISTA: dois agentes passariam pela capacidade que **multiplica**. Agora o portão lê `CREATOR` (a Property que não consegue representar dois) e mover o bastão limpa a lista do anterior |
| 45 | **Três módulos órfãos, achados na varredura** | A auditoria olhou só os itens da F5; a varredura olhou o projeto inteiro e achou mais três. **`sessionQueue.ts` + `sessionQueueStore.ts` (93 linhas)**: fila de sessões com teste verde e **zero consumidores** — nem o motor, nem POC. O motor grava a sessão direto pelo `sessionIO`, e funciona; a fila nunca foi ligada. **`voice.ts` (38 linhas)**: órfão por DECISÃO sua (voz adiada, ADR-019) — este é parado de propósito, não esquecido. Decisão pendente: apagar a fila ou ligá-la | decisão do dono |
| 39 | **171** strings em pt-BR | Catraca: **208 → 171** nesta rodada (**−18%**), e não pode subir. As descrições de `calendar.ts` foram traduzidas **com eval antes e depois** (`e6-agenda` ✓ nos dois, mesmas 4 verificações) — elas mudam o que o modelo vê, então não saem sem medição. Contínuo por natureza — traduzir as descrições de ferramenta exige rodar os evals, porque elas mudam o que o modelo vê, e a bolha do chat é do AGENTE (idioma vem da pasta, ADR-002). **Dois pedaços ficam em pt-BR de propósito**: os nomes de seção dos evals (`## turnos`, `## verificações`) são a GRAMÁTICA dos 36 cenários, e o cabeçalho da planilha de limites — renomear coluna numa planilha que o dono já tem desalinha o que ele já filtrou | contínuo |

### O que falta — revisão de 2026-09-21 (depois da primeira coroa)

> A F7 fechou o ciclo inteiro no real: o Opus leu o código, achou um defeito, o sucessor foi
> implantado, avaliado de fora, coroado, e a correção voltou ao `src`. O que segue são as pontas que a
> coroa ABRIU (A, B) e as que já estavam abertas.

| # | O que falta | Por que importa | Depende de | Decisão do dono |
|---|---|---|---|---|
| **A** | **Para onde vão as próximas publicações** | O motor que RESPONDE agora é o sucessor (`1w3Pju8v…`). O `./gasclaw up` publica no pai, que está pausado — mudanças novas do `src` (inclusive as guardas desta rodada) **não chegam ao motor que responde**. Três saídas: promover o sucessor a alvo do dev; um comando que leva o `src` ao sucessor coroado (o rebase já faz isso para um sucessor parado); ou descoroar e voltar ao pai | **decisão do dono** | Construir `succession sync`: leva o build atual do `src` ao sucessor COROADO; o pai segue alvo do build e porta do Chat. ✅ **Feito** (c69911b): dev v158 → `succession sync` implantou a **versão 6** do sucessor no mesmo endereço; os 5 arquivos são **idênticos byte a byte** ao `dist/`, semente nova, sucessor segue **LIGADO** (P33 check). 9 testes, 8 mutações mortas |
| **B** | **O Google Chat aponta para o pai pausado** | O app do Chat foi configurado à mão para o projeto do pai. Com ele pausado, **o Chat não responde**. Não há API para reapontar: é o passo manual no console do Chat, com a URL do sucessor | passo manual do dono (depois de A) | O pai vira o roteador do Chat (depende do resultado da P35); plano B = uma reconfiguração manual no console |
| C | P33 C2 e C4 com evidência só indireta | O "nasce parado" e a conversa de teste não foram vistos ao vivo, só pela semente e pelos 6 cenários | uma próxima geração | Nada agora; observar na próxima geração |
| D | **Medir um ciclo de sonho real (26, 27, 29, 30)** | **Destravado agora**: antes desta correção, nenhum ciclo podia concluir. O defeito que o sucessor achou era exatamente o que impedia a P23 de medir | material (falhas reais) | Esperar falhas reais (nada de material inventado, regra D5) |
| E | Corrida de 3 gerações de automações (54) | Parada desde a v145: falta medir o filho 1 e as gerações 2 e 3 | clique do dono + teto | Fechada: superada pela F7. A maquinaria fica, nenhum gasto |
| F | Três módulos órfãos (45) | Apagar a fila de sessões ou ligá-la | decisão do dono | Apagar a fila de sessões órfã (`sessionQueue.ts`, `sessionQueueStore.ts` e testes); `voice.ts` fica |
| G | `e1-memoria` reprova nos DOIS motores | Não é do sucessor: é uma reprovação do agente que já existia, e a bateria da coroa a carrega | investigação | Investigar |
| H | Dívida de idioma: **148** | A catraca não deixa subir | — | Manter a catraca |
| I | Prod ainda na versão antiga | Nada da F6/F7 está em prod; o `ship` é decisão do dono | decisão do dono | Não publicar em prod agora; publicar depois de A, B e G, com checklist |
| J | Comparar o GPT-6-Astra na P32 | Adiado pelo teto do dia | teto | Fechada |
| K | Teto de código em US$ 6 | Volta sozinho a US$ 3 às 20:14 UTC de 2026-09-21 | relógio | Automático |

> **Depois do `sync` (2026-09-21).** Com o código do sucessor igual ao do pai, `codeMatches` contra o patch do
> registro coroado deixa de bater — esperado (as trocas já estão no `src`). Hoje isso não aparece: `succession
> health` recusa um registro coroado. O `poc p33 check` diz "pass: false" com o sucessor ligado porque mede o
> "nasce parado" — é a leitura certa para um coroado. Fluxo de publicação agora: `./gasclaw up` (pai, parado)
> → `./gasclaw succession sync <scriptId>` (o motor que responde).

> **Decisões do dono (2026-09-21).** Ordem de execução: A → levar as Script Properties do pai ao sucessor na coroa (lista permitida, nunca segredos) + nova checagem de saúde "as permissões do sucessor são as do pai" → B (depois da P35) → G → F → I.

### F8 — herança e roteamento (2026-09-21)

| # | Item | Estado | Evidência |
|---|---|---|---|
| ~~F8.1a~~ | ✅ **`inheritable`: o que o filho herda** | lista fechada das chaves do agente; segredo vence a lista, mesmo dentro de uma chave permitida; estado do motor não passa; valor acima de uma Property é recusado com motivo | 6/6 mutações |
| ~~F8.1b~~ | ✅ **Porta `handover` no sucessor + herança na coroa + `succession inherit`** | o pai filtra, o filho filtra de novo, só o pai da semente grava; a coroa herda ANTES de ligar (falhou → nada muda) | 8/8 + 5 mutações |
| ~~F8.1c~~ | ✅ **Health em sucessor COROADO + 10ª checagem** | no coroado: ele responde, worker vivo, código de HOJE do pai, e **as permissões são as do pai** (ACCESS:, CAP:, STATUS: pela `readiness`, sem segredo); antes da coroa a 10ª passa, porque é a coroa que entrega (F9, opção A: depois da coroa só se exige que ele as devolva) | 8/8 mutações |
| ~~F8.1-real~~ | ✅ **No real (dev v162, sucessor v10)** | `succession inherit` → **11 chaves gravadas**; `succession health` → **10/10**; pai `enabled:false`, sucessor rodando | saída do comando |

**Dois achados AO VIVO, os dois consertados com teste que prova que pega:**
- **O formulário grande chegava vazio.** Com todas as chaves do agente num campo de formulário, o `doPost` do sucessor recebia `parent` vazio ("got nothing"). A herança passou a ir como **corpo JSON** com a ação na URL (`postChildJson`, host fixo em `script.google.com` — com teste de que nunca sai do Apps Script).
- **A porta interceptava a CLI no próprio pai.** A porta do sucessor tinha o MESMO nome da ação `inherit` da CLI e vem antes do segredo no `doPost`: o pedido do dono caía na porta do pai. Renomeada para `handover`; teste novo pelo caminho REAL da CLI (4 testes caem com o nome antigo). Os testes antigos chamavam a função direto e não viam.

| ~~F8.G~~ | ✅ **`e1-memoria` — causa-raiz e conserto** | rodado no dev: as duas respostas voltavam VAZIAS (`finish_reason: length, content: null`). O agente usa `deepseek-v4-flash`, que raciocina, e o turno mandava `max_tokens 1000` sem reserva — o pensamento gastava tudo. Agora os cinco pontos de turno passam `reasoning.max_tokens 600` (`TURN_REASONING`), com trava no fonte. **Real (v164): `e1-memoria` ✓ ✓, e a bateria da coroa passou de 5/6 para 6/6** (smoke, e1-now, e1-limite, e1-fora-da-lista, e1-injecao seguem ✓). Levado ao sucessor pelo `sync` (v12) | eval no dev |
| ~~F8.F~~ | ✅ **Fila de sessões órfã apagada** | `src/sessionQueue.ts` + `src/sessionQueueStore.ts` + teste (143 linhas, zero consumidores). `voice.ts` fica (ADR-019). Dívida de idioma 148 → **145** | suíte verde |
| ~~F8.B~~ | ✅ **O Chat depois da coroa — P35 medida, REPROVADA em C2** | uma mensagem real do dono: C1 a identidade do `onMessage` é aceita pelo sucessor (só provado para o dono — o `onMessage` roda como quem manda); C2 ida e volta **17.429 ms contra 10 s**. O limiar não se afrouxa: **sem roteamento automático**. [ADR-044](docs/adr/044-chat-segue-o-coroado.md): depois de cada coroa o dono reaponta o Deployment ID do Chat para o do sucessor (passo documentado nos READMEs). Achado: o app do dev e o de prod respondem com o MESMO nome — o painel ganhou **Open in Google Chat** (`chatLink`, pela identidade do próprio app) | [poc/p35](poc/p35-chat-segue-o-coroado/README.md) |

### F8.I — checklist de ida para prod (NÃO executado: o `ship` é decisão do dono)

1. **O que muda para quem usa a prod:** F6 (escada de automações, orçamento que expira), F7 (sucessor como AGENTE por patch, avaliado de fora, coroa com health), F8 (herança, `sync`, health de coroado) e a reserva de raciocínio em todo turno (muda o comportamento com modelos que raciocinam — conferir o modelo da prod com `./gasclaw usage --prod` antes).
2. **NÃO coroar em prod antes do B.** Sem o roteamento, a coroa em prod desliga o Chat da prod — o app do Chat aponta para o Deployment ID do pai.
3. **Um sucessor em prod custa ao dono três atos** (vincular o GCP de prod, autorizar, colar a chave) — a P33 mediu; não há API para o vínculo.
4. **Antes do `ship`:** `tsc` limpo, suíte verde, `./gasclaw eval --all` no dev verde, e a dívida de idioma sem subir.
5. **Depois do `ship`:** `./gasclaw status --prod` (health), uma conversa no Chat da prod, e `./gasclaw usage --prod`.
6. **Volta:** `./gasclaw rollback --prod` volta uma versão — a reserva de raciocínio e o resto voltam juntos.

**Publicar agora é:** `./gasclaw up` → `./gasclaw succession sync <id>` → `./gasclaw succession health <id>`. Depois da coroa as permissões mudam no painel do **sucessor** (opção A da F9); `succession inherit` copia as do pai por cima e apagaria o que o dono ligou lá.

### F9 — fechamento da branch `evolucao-f5-f8` (2026-09-21)

As quatro capacidades estão ligadas no painel e foram medidas **no motor que responde** (o sucessor
coroado), pela [P36](poc/p36-capacidades-no-real/README.md). Spec:
[fechamento da branch](docs/specs/2026-09-21-fechamento-da-branch.md).

| # | Critério | Estado | Evidência |
|---|---|---|---|
| A1 | tsc limpo, suíte verde | ✅ | **2271/2271** depois da auditoria final (2206 no fechamento), tsc sem erro |
| A2 | cada conserto com teste que falha sem ele | ✅ (corrigido na auditoria final) | a auditoria final rodou **65 mutações** sobre o diff da F9: 43 pegas e **22 passavam** (entre elas o prazo medido do sonho, o arrendamento, `DREAMSTEP_MS`, `LASTWAKE`, as validações do `findDirectMessage`, 3 regras do crivo e as travas do `GASCLAW_ENGINE_URL`). 20 ganharam teste que as pega; 2 são equivalentes (sem mudança observável) |
| A3 | health do coroado 10/10 | ✅ **10/10** | dev v173, sucessor v20; de novo 10/10 depois da auditoria final (dev v175, sucessor v22) |
| A4 | o lado certo do CAP vence | ✅ **decisão do dono: opção A** | as 4 capacidades estavam no **sucessor**, e o pai só tinha Succeed. O `inherit` que a verificação sugeria **apagaria 3 das 4**, e não foi rodado. Decisão: depois da coroa vale o painel do sucessor, e a 10ª só exige que ele devolva as permissões, informando a diferença para o pai |
| D1 | Dream | ✅ recusa honesta | "no real failures to dream about": não há falha agrupada em 30 dias. Consertos: portão com `:`, placar, prazo + arrendamento, estimativa guardada |
| R1 | Reach out | ✅ | disparou uma vez no tique certo; a resposta chegou ao Chat do dono com recibo (79 s). Antes, morria no trace ([ADR-045](docs/adr/045-reach-out-entrega-ao-dono.md)). Fora da lista: nada age, e a pergunta chega ao dono |
| S1 | Succeed | ✅ | coroa, rebase e avaliação passam por `mayAct`; um coroado **rodando** por vez; texto do painel = sucessor-agente; health 9/10 antes da opção A, **10/10** depois (A4) |
| C1 | Create agents | ✅ | agente de teste nasceu com `caps []`, `tools []`, `users []`; removido |
| X1 | segurança | ✅ | crivo sem bypass por comentário, corpo ou dependência; `GASCLAW_ENGINE_URL` só para Apps Script; conversa direta **do dono**, nunca a primeira da lista |
| X2 | docs | ✅ | este bloco, CHANGELOG, READMEs, ADR-045, P36 |

**F9 fechada.** Tudo passou, com o health do coroado em 10/10 no real.

**Auditorias:** duas rodadas de security-scanner + code-reviewer. A primeira achou 6 defeitos sérios (portão
do Dream, placar, tique sem prazo, segunda coroa, `mayAct` ausente, bypass do crivo) e 3 menores. A
segunda, sobre os consertos, achou a coroa que nunca soltava, o token que ia para qualquer URL e as
dependências das guardas desprotegidas. Todos foram consertados, com teste.

**Limites conhecidos (registrados, não abertos):** a herança não apaga chave que o pai removeu; o estado do
sonho guarda o prompt inteiro em cada chave; um patch pode montar o nome de uma guarda sem escrevê-lo
(`"assert"+"Owner"`); com a identidade do app, `findDirectMessage` só aceita o id numérico da conta; ~~`DREAMSTEP_MS` só cresce e é global~~ — **fechado em 2026-09-22**: a estimativa é por agente, guarda as últimas 5 medidas e tem teto de 240 s.

### F10 — auditoria final, evals de todas as ferramentas e um modelo por papel (2026-09-23)

Spec: [auditoria final e modelo único](docs/specs/2026-09-23-auditoria-final-e-modelo-unico.md) · decisão: [ADR-048](docs/adr/048-um-modelo-so-e-o-juiz-de-fora.md)

| # | Item | Estado | Evidência |
|---|---|---|---|
| A | Auditoria do diff `e4b8006..HEAD` (segurança + corretude) | ✅ | 7 achados, todos consertados com teste e mutação; suíte 2363 verde, `tsc` rc=0 |
| A1 | **Crítico:** espera do Chat cujo POST do cartão falhava virava estado preso, com mensagem que mentia ("a resposta está no painel" — o dono nunca foi perguntado) | ✅ | `src/runner.ts`: falha honesta, e o run sai do limbo |
| A2 | **Segurança (médio):** o relógio da expiração de 7 dias vinha de campo NÃO ASSINADO do arquivo do run — dava para a espera nunca expirar, ou para matar uma aprovação viva | ✅ | `writeAuthority` com relógio injetado; o carimbo só avança quando a assinatura muda |
| A3 | A varredura era mais fraca que a invariante: run na SEGUNDA espera nunca era recuperado | ✅ | `promptedAt` no registro; predicado corrigido |
| A4 | Quatro oráculos vácuos (prefixo de fila errado, contagem tarde demais, dois que passavam com a guarda removida) | ✅ | `test/chatEspera.test.ts` |
| P1 | **Tique ocioso (critério P3/ADR-027: < 1000 ms)** | ✅ medido, **11 amostras** | min 466 · mediana 763 · **máx 961** · 0 acima do limite. Onde vai o tempo: reconcile 319 ms, drain 329 ms, fila 49 ms. Os consertos (atalho de vazio no reconcile; arrendamento do sonho só com ciclo ativo — 2880 escritas/dia a menos) esperam publicação para o "depois" |
| P2 | A chamada de modelo "a mais" por aprovação | ✅ explicado | é o resumo da sessão (`flushMemory` + compactação), que a perna retomada é a primeira a alcançar; entra no teto do run. No real, um "Olá" já custa 2 chamadas. Registrado na ADR-047 |
| B | Cobertura ferramenta → eval | ✅ | 10 cenários novos: nenhuma ferramenta ficou sem eval; 46 embutidos no motor |
| C | Um modelo por papel | ✅ no código | agente e padrão `openai/gpt-6-luna`; sucessor `openai/gpt-5.6-sol`; juiz `deepseek/deepseek-v4-flash-0731` — os três ids conferidos no catálogo do OpenRouter |
| C1 | A independência do juiz passa a VALER | ✅ | `judgeIsIndependent` tinha teste e ZERO chamadores; agora `judgeFor` decide nos dois lugares onde se julga, e recusa também gerador com roteamento automático |
| D | `./gasclaw model <id>` | ✅ | troca o modelo do agente sem clique, com a autoridade do painel (ADR-021/022) |
| E | Publicar, medir o "depois", trocar o modelo do agente vivo, `eval --all`, health 10/10 | ✅ | dev **v184**, sucessor **v30**, health **10/10**; agente em `openai/gpt-6-luna` |
| E1 | **Tique depois dos consertos** | ✅ **12 amostras** | min **354** · mediana **653** · máx 987 · 0 acima de 1000 ms (antes: 466 · 763 · 961). Drenagem da fila 329 → **263 ms** |
| E2 | `./gasclaw eval --all` no motor que responde | ✅ **42 cenários** | os 2 que reprovaram eram dos CENÁRIOS novos (liam e-mail e planilha por id fixo que não existe): viraram erro honesto e passam. 3 reprovações de transporte ("a resposta se perdeu") passaram ao repetir |
| E3 | O modelo novo e o juiz no motor real | ✅ | `usage` do dia: **69 req** em `openai/gpt-6-luna` e **27 req** em `deepseek/deepseek-v4-flash-0731` (o juiz, de outra família) |

**Custo medido, antes e depois:** 22/09 em `gpt-5.6-luna`, 21.579 tokens por US$ 0,0065 — **US$ 0,300 por
milhão**. 23/09 em `gpt-6-luna`, 60.219 tokens por US$ 0,0099 — **US$ 0,164 por milhão**, uma queda de **45%**
(a mistura entrada/saída explica a diferença para os preços de tabela).

### F11 — a branch dos consertos e do Reach out (2026-09-23)

Spec: [skills no lugar de gerar código](docs/specs/2026-09-23-skills-no-lugar-de-gerar-codigo.md)

O que esta branch é: **tudo o que foi consertado e medido, menos o que o agente usava para se
reescrever ou se multiplicar.** A remoção foi cirúrgica e em passos commitados, cada um com `tsc`
rc=0 e suíte verde.

| # | Item | Estado | Evidência |
|---|---|---|---|
| R1 | Sonho (ciclo, placar, tique, estado) | ✅ removido | `dream{,Board,Cycle,Run,Store,Tick}.ts` + testes; `withDreamLease` fora do `drainRuns` |
| R2 | Sucessão (escrever, avaliar de fora, health, coroa, rebase, sync, herança, semente) | ✅ removido | `succession.ts`, `successor.ts`, `patch.ts`, `guards.ts`, `seed.ts` + ~11 arquivos de teste |
| R3 | Geração de código, filhos e enxame | ✅ removido | `codegen.ts`, `children.ts`, `swarm.ts`, `fitness.ts`, `family.ts`, `budget.ts` |
| R4 | Capacidades: sobra `initiative` | ✅ | `CAPABILITIES = ['initiative']`; `CREATOR`, `canSucceed`, linhagem e intervalo entre gerações fora do `agentCaps.ts` |
| R5 | Tool `agent.create` fora do registro; `agent.message` e `persona` ficam | ✅ | catálogo de 26 → **25 ferramentas**, conferido pelo `readmeFerramentas.test.ts` contra os dois READMEs |
| R6 | CLI: `swarm` e `succession` fora; `MUTATING` de 21 → 9 ações | ✅ | `cli.test.ts` prova que a lista do shell e a do TypeScript continuam iguais |
| R7 | Painel: sonho, sucessor, automação, linhagem e projetos filhos fora | ✅ | a tabela de **arquivados** ficou, servida por `archivedAgents()` (código novo, com teste próprio) |
| R8 | `CODEGEN_MODEL` fora; `DEFAULT_MODEL` e o juiz de fora ficam | ✅ | [ADR-048](docs/adr/048-um-modelo-so-e-o-juiz-de-fora.md) corrigida; `modeloUnico.test.ts` segue provando a independência do juiz |
| K1 | **Reach out inteiro** (agenda, `tickProactive`, `SCHEDSEEN`, `LASTWAKE`, auto-aprovação, falha honesta, entrega na DM do dono) | ✅ mantido | `portoesAutonomos.test.ts`, `proativoCard.test.ts`, `chatDelivery.test.ts`, `schedule.test.ts` |
| K2 | **Espera do Chat com cartões** (ADR-047): fila, requestId estável, `promptedAt`, prazo de 7 dias, `waiting` no trace | ✅ mantido | `chatEspera.test.ts` (50 KB), `resumeSemDecisao.test.ts` |
| K3 | **Run durável robusto**: relógio na autoridade, `release`/`leaseOf`, atalho de vazio no reconcile, tique ocioso barato | ✅ mantido | `runAuthority.test.ts`, `drainLock.test.ts`, `tiqueOcioso.test.ts`, `reconcileBatch.test.ts` |
| K4 | **Evals**: todos os cenários que não dependem de criar agente | ✅ mantido | **45 embutidos** no build (saiu `agent-criar-sem-capacidade`) |

**Números finais:** `tsc` rc=0 · suíte **1632/1632** · build com **56 funções globais**. A queda de
2365 para 1632 testes é a área removida saindo junto com as provas dela — nenhum teste foi apagado
para ficar verde, e cada commit registra qual garantia morreu com qual teste.

### Incidente de 2026-09-21 — o pedido do Chat que ficou no "thinking…" ([ADR-047](docs/adr/047-espera-do-chat-tem-cartao.md))

O dono pediu no Chat (DM com o app do dev, que segue o sucessor coroado) uma auditoria da semana. O run
durável parou em `waiting` pedindo aprovação de `tasks.create` (trace `20260921-222832-fc90`, que dizia
**`ok`**), e nenhum cartão chegou. Causa: a entrega só agia em `done`/`failed`.

| # | Achado | Causa-raiz | Estado |
|---|---|---|:--:|
| I1 | nenhum cartão numa espera | a entrega ignorava `waiting`/`paused` | ✅ 3ab7d54 |
| I2 | trace `ok` num run parado | `finish` só conhecia ok/erro | ✅ status `waiting` + passo `aguardando: …` |
| I3 | cartão com uma chance só | o `settle` soltava a espera ANTES do POST; a marca ficava no cache | ✅ fila até o cartão sair, `prompted` na autoridade, nova tentativa quando o arrendamento vence (`LEASE_MS`, 6 min) |
| I4 | o run de ontem nunca receberia o cartão | já estava fora da fila | ✅ varredura das esperas sobre a leitura de Properties que o tique já fazia |
| I5 | `ask` retomava FORA do run durável | o cartão usava o ticket de 10 min do caminho síncrono | ✅ botões com pasta e run; a resposta digitada responde a pergunta aberta |
| I6 | resposta final duas vezes depois do Approve | o cartão era trocado pela resposta e a entrega mandava de novo | ✅ a continuação sai pela entrega, e o cartão só confirma |
| I7 | dois system prompts em cada retomada | o snapshot já guardava o system | ✅ `chatTurn` descarta o velho |
| I8 | texto do aviso de teto sem escape no cartão | `continueCard` montava o HTML cru | ✅ |
| R1 | **(revisão, ALTA)** run sem destino adotava o do arquivo | `writeAuthority` só fixava o destino quando a 1ª gravação tinha um; `delivery` não é assinado | ✅ fixado na 1ª gravação |
| R2 | dois gatilhos sobrepostos postavam dois cartões | a espera voltava à fila sem arrendamento antes do POST | ✅ fica com o arrendamento do claim |
| R3 | falha fora do POST gastava as 4 tentativas em segundos | só o POST adiava | ✅ qualquer falha espera o arrendamento vencer |
| R4 | clique duplo no `ask` reaplicava a resposta; `runDecide` adotava arquivo editado | resposta sem credencial não tinha trava nem assinatura | ✅ `RunIO.resume` |
| R5 | botão de pergunta antiga respondia a nova | o botão não dizia de qual espera era | ✅ `wait` no botão |
| R6 | pasta apagada de outro agente travava a varredura | uma exceção abortava a busca | ✅ pasta por pasta, 3 tiques de chance |
| A1 | **(2ª rodada)** duas perguntas digitáveis dividiam uma vaga | `ASKRUN:` guardava um runId só | ✅ fila: a digitada responde a mais antiga, e o cartão da seguinte avisa |
| A2 | clique entre o POST e a marca apagava o ponteiro do clique | `dequeue` incondicional | ✅ `io.release` só apaga o ponteiro do claim |
| A3 | cartão repetido quando a marca não gravava | `requestId` aleatório por tentativa | ✅ `requestId` da espera (+ credencial) e token reaproveitado |
| A4 | espera nunca respondida segurava a autoridade para sempre | não havia prazo | ✅ 7 dias → `failed` com motivo entregue no Chat, autoridade fora |
| A5 | "o tique ocioso não abre o Drive" era afirmação | nenhum teste media | ✅ teste conta `DriveApp` + Drive API: zero |
| A6 | `DREAMSTEP_MS` global e só crescia | uma chave para todos os agentes, sem esquecer | ✅ por agente, janela das últimas 5 medidas, teto de 240 s |
| A7 | identificadores em português **dos trechos da F9** | — | ✅ `PROTECTED_NAMES`, `opensRegex`, `capsSide`, `longestStep`… com a lista de guardas e os testes coerentes. O resto do `src` segue em português; não era o escopo |

Testes: 2279 → **2326**, tsc limpo. **43 mutações**: 41 pegas e 2 equivalentes (destino tirado do arquivo,
desistência sem conferir assinatura: uma guarda anterior já cobre cada uma). Revisão: security-scanner +
complexity-reviewer; limites que ficaram estão no ADR-047.

**Publicado e medido no real (2026-09-22):** dev **v177**, sucessor **v25**, `succession health` **10/10**.
Pelo sucessor (`poc p36 waits`): o run de 2026-09-21 (`spaces/g_jQUqAAAAE/messages/FtJPCakj748…`) está
`waiting` em `approval:tasks.create`, **fora da fila e com `prompted`** gravado às 16:31:29Z, um minuto depois
da v24 — a marca só nasce depois de o POST do cartão dar certo. O recibo (`card`) passou a ser gravado na v25,
então o deste cartão não aparece. Tique ocioso (`poc p3 idle`, 4 medidas, sem lote pendente): 844–1021 ms no
total. A parte da fila e das esperas, que é o que mudou, ficou entre 52 e 129 ms; o restante é reconcile + lote
do trace, que esta rodada não tocou. O critério da P3 é 1000 ms: duas das quatro medidas o ULTRAPASSARAM, por até 21 ms.


| POC | Pergunta | Status |
|---|---|---|
| **P22** proatividade | Acordar cabe na cota? | ✅ **APROVADA 4/4** — 13,87% da cota, cabem 6 agentes a 48 despertares/dia |
| **P23** sonho | Quanto custa um ciclo? | ⚠️ C1 e C6 medidos; **C2–C5 esperam o ciclo real** |
| **P24** código | Criar filho sem clasp? | ✅ **Aprovada por inteiro**, inclusive o "falhar é passar" |
| **P25** aglomerado | O trace tem material? | ❌ **Reprovou** — e isso inverteu a ordem do organismo |
| **P32** patch do motor | O Opus devolve um patch válido do motor inteiro em < 5 min? | ✅ 43 s, US$ 1,33, 1 troca que achou um defeito real |
| **P33** agente sucessor | Um agente inteiro sobe como outro projeto, parado? | ✅ C1/C3 · 🟡 C2/C4 indiretos · achado: três atos do dono, não dois |
| **P34** avaliação de fora | O pai julga o sucessor com o próprio juiz? | ✅ 6 cenários, empate 5×5, nenhum veredito vazou |
| **P36** capacidades no real | As 4 capacidades fazem o que prometem no motor coroado? | ✅ Reach out entrega (depois da ADR-045), Create nasce vazio, Succeed 10/10 (depois da opção A), Dream recusa honesta — [poc/p36](poc/p36-capacidades-no-real/README.md) |

### Consertos de instrumento (2026-09-19/20)

Sete defeitos desta semana estavam na **medição**, não no produto:

| O que era | Como apareceu |
|---|---|
| N+1 no `reconcile` | 20 leituras de cache por minuto. Tique **974 → 563 ms** |
| Veredito pela última amostra | 433, 544, **1000** — e o 1000 decidia sozinho. Agora mediana com faixa |
| `--turno` descartado em silêncio | README documentava, CLI ignorava. `realTurnMs: null` sem avisar |
| POC reprovada parecendo travamento | Imprimia "stopped unexpectedly" **duas vezes** num resultado válido |
| Credencial gcloud presumida | Conta listada ≠ conta válida. Morria na linha 44 sem dizer o comando |
| Painel dizendo "autorizado" sem estar | Chamava o filho **sem token**, recebia o login, lia como sucesso |
| Sonda cortando a evidência | `slice(0,900)` antes do parse reprovava um desenho **correto** |
| Recusa explicada virando crash | Eval offline recusado com motivo, e o CLI imprimia **"stopped unexpectedly… please report this"** logo abaixo |

---

## Histórico até 2026-09-16 (F0–F4)

## Como ler

**Porcentagem**
| Valor | Significado |
|---|---|
| 100% | feito **e** verificado de verdade (no Google ou nos testes) |
| até 70% | código pronto com testes, mas ainda sem verificação real |
| 10% | só desenhado (spec, ADR ou decisão registrada) |
| 0% | nada feito |

A porcentagem de cada fase é a média simples dos itens dela.

**Status:** ✅ feito · 🟢 quase · 🔄 em andamento · 🟡 parcial · ⏳ planejado · ⏸️ adiado · ❌ bloqueado

**Resolvido?**
| Marca | Significado |
|---|---|
| ✅ Sim | concluído e verificado; não precisa de mais nada |
| 🟡 Parcial | uma parte está verificada, mas falta algo listado em "O que falta" |
| ❌ Não | ainda não foi feito ou não foi verificado |
| ⏸️ Adiado | parado por decisão do usuário |

---

## Resumo

| Fase | Itens | Progresso | Resolvidos |
|---|---|---|---|
| **F0**: fundação e primeira fatia | 18 | ████████░░ **82%** | 11 de 18 |
| **F1**: agente-pasta completo | 21 | ██████░░░░ **56%** | 7 de 21 |
| **F2**: tarefas longas e aprovação | 12 | █████░░░░░ **51%** | 5 de 12 |
| **F3**: proatividade e dados | 4 | █░░░░░░░░░ **10%** | 0 de 4 |
| **F4**: canais extras | 4 | █░░░░░░░░░ **10%** | 0 de 4 |
| **Transversal** (docs, open source, segurança, POCs) | 22 | ███████░░░ **69%** | 12 de 22 |
| **Produto (F0–F4)** | 59 | ██████░░░░ **56%** | 23 de 59 |
| **Geral** | 81 | ██████░░░░ **60%** | 35 de 81 |

> A F1 subiu de 45% para 56% porque seis itens ficaram prontos no dev e foram medidos: trace do agente (P14 12/12),
> observabilidade na tela (P15 6/6), motor de tools, aprovação com card, ferramentas do Google e o rodízio de
> modelos gratuitos (P11 5/5). **Ressalva do rodízio:** foi uma execução só, e um turno levou 35,8 s contra
> mediana de 4,1 s — os modelos gratuitos têm cauda longa, então "funciona" ainda não quer dizer "é estável".
> O Transversal subiu de 65% para 69% com a auditoria concluída sem nenhum crítico e dois itens novos (aviso honesto
> quando a ferramenta falha; ação com efeito que sobrevive à resposta perdida).
>
> A F2 chegou a 51% com o **núcleo do run durável** ([ADR-026](docs/adr/026-run-duravel.md)), o gatilho-worker medido
> pela P3 ([ADR-027](docs/adr/027-gatilho-worker.md)): checkpoint por passo, estado na pasta do agente, fila própria,
> lease de 6 min, teto de US$ 0,10 e incerteza honesta para efeitos em voo. A P4 provou no dev v66 que o mesmo run
> atravessa três execuções e não repete um efeito já registrado; a P19 provou no v72 que uma morte depois do efeito
> deixa `inflight` durável, não chama o passo na retomada e devolve o aviso de incerteza. A P20 provou no v74 que a
> aprovação sobrevive sem cache por 24 h, não é consumida por terceiro e não reenfileira no clique repetido.
>
> **O que ainda segura a F1 e o produto:** o acesso de outra pessoa nunca foi testado de verdade na tela (90%);
> a tela de chat está só com texto, porque a voz foi adiada por você (80%); "Novo agente" ainda não foi usado na tela (85%).
> **Fora do produto:** as POCs ainda vão no bundle de prod, só desligadas; **prod segue na versão 1**, enquanto o dev está na 73;
> a publicação pelo GitHub/CI continua adiada por você; e o Monitoring fica indisponível porque você decidiu não habilitar faturamento.

---

## F0 — Fundação e primeira fatia utilizável (82%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| Fundação: devmode, hub de docs, commit inicial | ✅ | 100 | ✅ Sim | — | plano#Task 0 |
| Build (esbuild IIFE) e testes (vitest) | ✅ | 100 | ✅ Sim | — | plano#Task 1 |
| Leitura da pasta do agente (`workspace`) | ✅ | 100 | ✅ Sim | — | plano#Task 2 |
| Cliente OpenRouter (`llm`) | ✅ | 100 | ✅ Sim | — | plano#Task 3 |
| Turno do agente com histórico limitado (`agent`) | ✅ | 100 | ✅ Sim | — | plano#Task 4 |
| Handler do Google Chat e botão de pausa (`chat`) | ✅ | 100 | ✅ Sim | — | plano#Task 5; log (Chat respondeu "pausado") |
| Armazenamento: chave, agentes, pausa, cache (`store`) | ✅ | 100 | ✅ Sim | — | plano#Task 6 |
| Tela gasclaw: chave, agente ⭐, teste, pausar | ✅ | 100 | ✅ Sim | — | plano#Task 7 |
| CLI `./gasclaw` | 🟢 | 85 | 🟡 Parcial | verificados: `up`, `down`, `status`, `doctor`, `rollback`; falta testar `restart`, `ship`, `logs` e `open` | plano#Task 8 |
| Deploy dev (`./gasclaw up`) | ✅ | 100 | ✅ Sim | — (hoje na versão 3) | log#Task 9 |
| POC P1: chamada longa ao OpenRouter | ✅ | 100 | ✅ Sim | — (109–126 s sem erro) | [ADR-010](docs/adr/010-poc-p1-urlfetch.md) |
| ADR-009, índices e tracks (Task 11) | ✅ | 100 | ✅ Sim | — (commit `2d22645`) | [ADR-009](docs/adr/009-ajustes-f0.md) |
| Teste: editar `SOUL.md` sem novo deploy (haicai) | ⏳ | 70 | ❌ Não | rodar o teste no dev | plano#Task 9 Step 5 |
| Teste: memória no Chat ("o que eu disse antes?") | ⏳ | 70 | ❌ Não | rodar o teste no dev | plano#Task 9 Step 6 |
| Teste: outra pessoa do domínio fala com o agente | ⏳ | 70 | ❌ Não | pôr o e-mail em `users` e testar (risco: "Acesso negado" no Drive) | plano#Task 9 Step 6 |
| Ambiente prod | 🟡 | 60 | 🟡 Parcial | feito: projeto, script, web app, app do Chat e `doctor --prod`; falta a chave e o agente na tela de prod, e uma conversa | log#prod |
| GitHub privado, secret, push e CI verde (Task 10) | ⏸️ | 20 | ⏸️ Adiado | só o `deploy.yml` existe; faltam `gh auth login` (deu erro, causa não investigada), o repo, o secret `CLASPRC_JSON` e o push | plano#Task 10; Beads `gasclaw-mw8` |
| POC P7: validade do token do CI | ⏸️ | 0 | ⏸️ Adiado | depende da Task 10 | spec#11 |

---

## F1 — Agente-pasta completo (56%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| **POC P6: agentes em Google Docs/Sheets nativos (com `.md` também)** | ✅ | 100 | ✅ Sim | — (passou em 2 execuções automáticas; a leitura híbrida em produção e a opção "Criar como Docs \| Markdown" entram nos itens seguintes da F1) | [ADR-012](docs/adr/012-agentes-em-docs-e-sheets.md); [poc/p6-docs-nativos](poc/p6-docs-nativos/README.md) |
| **Autoria no editor do Apps Script** (`agentes/<nome>/<PAPEL>.md.html` + pasta do Drive criada sozinha) | 🟢 | 85 | 🟡 Parcial | no dev (v14): `loadAgent` lê editor → Google Doc → `.md` (+ planilha `config`) com cache de 30 s; edição no editor chega ao agente em 12,8 s sem `up` (C7); se o editor falhar, segue com o Drive e registra no trace; motor em 1 arquivo; `up` preserva o editor; falta só usar "Novo agente" de verdade na tela (e, depois, levar para prod) | [ADR-013](docs/adr/013-autoria-editor-e-drive.md); [poc/p10-editor](poc/p10-editor/README.md) |
| Trace do agente: cada run com os passos (arquivos lidos e origem, prompt, chamadas ao modelo com tokens/custo, ferramentas, memória, resposta) · aba Ao vivo + detalhe do run na tela · planilha com 1 linha por run · JSON completo em `gasclaw/runs/<id>.json` guardado por 90 dias e depois para a lixeira · `./gasclaw trace <id>` | ✅ | 100 | ✅ Sim | — (POC P14 12/12 na v34 com o desenho em lote: turno com p95 de 636 ms, cobertura 1,000, tela em 1,3 s, planilha em 38,1 s pelo gatilho, 0 vazamentos, 21 min/dia de gatilho contra a cota de 360) | [ADR-014](docs/adr/014-trace-do-agente.md); [ADR-020](docs/adr/020-trace-em-lote.md); [poc/p14-trace](poc/p14-trace/README.md) |
| **Observabilidade na tela** (lote de 1 min, modelos e custo por modelo, limites) | ✅ | 100 | ✅ Sim | — (no dev: abas Ao vivo, Lote, Modelos e custo e Limites; `./gasclaw limits` e `usage`; P15 6/6 e P16 7/7 na v35, com o custo do trace a −0,1% do que o OpenRouter cobrou; gatilho de 1 min ativo). Monitoring segue indisponível por faturamento, decisão do usuário | [ADR-016](docs/adr/016-painel-de-limites.md); [ADR-018](docs/adr/018-modelos-e-custo.md); [poc/p15-limites](poc/p15-limites/README.md); [poc/p16-custo](poc/p16-custo/README.md) |
| E0 harness de evals (`./gasclaw eval`) | ✅ | 100 | ✅ Sim | — (6/6 no dev v16: smoke, e1-now, e1-memoria, e1-limite, e1-injecao, e1-fora-da-lista) | commit `9fa87d7` |
| E1 motor de tools (allowlist, schema, limite de passos, memória só na DM do dono) | ✅ | 100 | ✅ Sim | — (toolkit ligado no Chat real e só com as tools aprovadas no painel; evals `e1-*` verdes na v35) | `9fa87d7`, `c9c11c9` |
| E5 aprovação + ask | ✅ | 100 | ✅ Sim | — (aprovação de tool: uso único e 24 h no Drive desde P20/v74; `ask`: 10 min no cache; evals e `webchat-*` verdes) | [ADR-028](docs/adr/028-aprovacao-duravel.md); `106f11e`, `7cb6e42`, `69f4ac8` |
| E6 ferramentas do Workspace por REST (agenda, Gmail, contatos, tarefas, Drive/Docs/Sheets) | ✅ | 100 | ✅ Sim | — no dev: 7 evals `e6-*` verdes na v35 (agenda, freebusy, gmail-rascunho, contato, drive, tarefa, injeção), cada um apagando o que criou; ferramentas do Google só para o dono, com card completo | [ADR-023](docs/adr/023-ferramentas-do-workspace.md) |
| P17 / ADR-019: tela de chat do gasclaw e voz | 🟢 | 80 | 🟡 Parcial | texto pronto no dev (`?page=chat`, link absoluto, trace completo, `webchat-*` verdes na v35); **voz adiada por decisão do usuário** | [ADR-019](docs/adr/019-tela-de-chat-e-voz.md) |
| **Acesso e ferramentas aprovados no painel** (M2, ADR-021) | 🟢 | 90 | 🟡 Parcial | no dev: todo agente fica só com o dono e sem tools até o clique em Aprovar; falta **testar o acesso de outra pessoa de verdade na tela** | [ADR-021](docs/adr/021-acesso-aprovado-no-painel.md) |
| Rodízio de modelos gratuitos (`model: free`) | 🟢 | 90 | 🟡 Parcial | no dev e medido pela POC P11 na v39 (5 de 5): 20 de 20 turnos, troca de modelo em 1,1 s, p95 de 10,9 s. Escreva `free` no `AGENTS` ou na tela. Falta **tirar a consulta de cota do caminho do turno** (ela levou o C7 da P16 a 6 chamadas ao `/key` em 30 min, contra o teto de 3) e repetir a medição: uma execução só, com um turno de 35,8 s contra mediana de 4,1 s | [ADR-025](docs/adr/025-rodizio-de-modelos-gratuitos.md); [poc/p11-free](poc/p11-free/README.md) |
| Chat na tela gasclaw (para quem usa Gmail pessoal) | ⏳ | 10 | ❌ Não | decidido: aba de conversa no web app, com instalação e cota próprias da pessoa; exige ADR (a spec §2 deixava o chat web fora do MVP) | Beads `gasclaw-v53` |
| `./gasclaw up` detecta Gmail pessoal e pula o Chat | ⏳ | 10 | ❌ Não | decidido: conta `@gmail.com` → pula consentimento Interno e app do Chat; verificar consentimento "Externo/Teste" | Beads `gasclaw-v53` |
| Conversas no Drive e resumo automático | ⏳ | 10 | ❌ Não | tudo (pode usar Sheets, se a P6 passar) | spec#6; plano#D.F1.1 |
| Memória: `remember`, `memory/AAAA-MM-DD.md`, `MEMORY.md` (inspirada em Eve/OpenClaw) | ⏳ | 10 | ❌ Não | tudo; primeira tool, exige suporte a tool calls no `llm` | spec#3, #6; plano#D.F1.2 |
| Ritual de estreia `BOOTSTRAP.md` | ⏳ | 10 | ❌ Não | tudo | plano#D.F1.3 |
| Skills (`read_skill`) | ⏳ | 10 | ❌ Não | tudo | plano#D.F1.4 |
| Vários agentes, cada espaço do Chat ligado ao seu | 🟡 | 20 | ❌ Não | a lista com ⭐ já existe; falta o vínculo por espaço | plano#D.F1.5 |
| Grupos do Google em `users` | ⏳ | 10 | ❌ Não | tudo | plano#D.F1.6 |
| Deploy seguro: divergência, poda de versões, rollback automático | ⏳ | 10 | ❌ Não | tudo; o rollback automático no CI depende da Task 10 | spec#9; plano#D.F1.7 |
| "Verificar" na tela | 🟡 | 30 | ❌ Não | já verifica a pasta e cria os arquivos; falta a chamada real ao LLM e a checagem do Chat | plano#D.F1.8 |

---

## F2 — Tarefas longas e aprovação (51%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| POC P2: Chat assíncrono (card enviado depois) | ⏳ | 10 | ❌ Não | tudo | spec#10; ADR-006 |
| POC P3: gatilho como worker do pump | ✅ | 100 | ✅ Sim | — (4/4 repetido no dev v60 após incluir a reconciliação durável de traces interrompidos; custo fixo projetado em 8,47% da cota Workspace) | spec#10; [ADR-027](docs/adr/027-gatilho-worker.md) |
| POC P4: run durável em 3+ execuções | ✅ | 100 | ✅ Sim | — (dev v66: cache removido antes de cada retomada; mesmo `runId`, checkpoints 1→2→done, resposta `p4-ok`, 1 efeito e 1 chave durável) | spec#10; ADR-005, [ADR-026](docs/adr/026-run-duravel.md) |
| POC P19: morte entre efeito e checkpoint | ✅ | 100 | ✅ Sim | — (dev v72: 1 efeito, `inflight` no Drive, 0 `done key`, 0 chamadas do passo na retomada e aviso honesto) | [POC](poc/p19-inflight/README.md); [ADR-026](docs/adr/026-run-duravel.md) |
| POC P20: aprovação durável | ✅ | 100 | ✅ Sim | — (dev v74: cache removido; aprovação após 660.001 ms; terceiro e clique duplo recusados; expiração em 24 h rotaciona sem replay; 1 efeito por run) | [POC](poc/p20-approval/README.md); [ADR-028](docs/adr/028-aprovacao-duravel.md) |
| POC P5: GASADK com seam OpenRouter e checkpoint | ⏳ | 10 | ❌ Não | tudo | ADR-004 |
| Resposta em até 20 s, senão "pensando…" e fila | ⏳ | 10 | ❌ Não | tudo | spec#6 |
| Checkpoint, lease, estados e idempotência | ✅ | 100 | ✅ Sim | — (P4 provou retomadas ordenadas; P19 provou a janela ambígua depois do efeito) | spec#6; plano#D.F2.5; [ADR-026](docs/adr/026-run-duravel.md) |
| Limites `steps` e `usd_per_run` | 🟡 | 50 | ❌ Não | teto de US$ 0,10 por run no núcleo, com pausa e opção de continuar; falta alimentar o custo real de cada passo | plano#D.F2.5; [ADR-026](docs/adr/026-run-duravel.md) |
| Tools (Gmail, Drive, Sheets, Docs, Agenda, HTTP) com cards Aprovar/Negar | ⏳ | 10 | ❌ Não | tudo | spec#8; plano#D.F2.6 |
| Retry com backoff em 429/5xx | ⏳ | 10 | ❌ Não | tudo (parte vem antes, com o rodízio de modelos gratuitos) | plano#D.F2.7 |
| **Papéis responder, validar e redigir, só sob pedido (POC P9)** | ⏳ | 10 | ❌ Não | decidido: resposta normal com 1 modelo; um comando (ex.: `/revisar`) aciona validador e redator no modo "pensando…" | Beads `gasclaw-v53` |

---

## F3 — Proatividade e dados (10%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| `HEARTBEAT.md` (a cada 30 min, no horário ativo) | ⏳ | 10 | ❌ Não | tudo | plano#D.F3.1 |
| `jobs.md` (cron) e tool `schedule` | ⏳ | 10 | ❌ Não | tudo | plano#D.F3.2 |
| Inbox Excel → Google Sheets (POC P8) | ⏳ | 10 | ❌ Não | tudo | plano#D.F3.3 |
| Modelos prontos: assistente executivo e analista de planilhas | ⏳ | 10 | ❌ Não | tudo | plano#D.F3.4 |

---

## F4 — Canais extras (10%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| Gmail: label `gasclaw` vira tarefa, resposta na thread | ⏳ | 10 | ❌ Não | tudo | plano#D.F4.1 |
| HTTP `doPost` com token | ⏳ | 10 | ❌ Não | tudo | plano#D.F4.2 |
| MCP/A2A (só se a P5 passar) | ⏳ | 10 | ❌ Não | depende da P5 | ADR-004 |
| `npx gasclaw` para qualquer pessoa instalar | ⏳ | 10 | ❌ Não | tudo | plano#D.F4.3 |

---

## Transversal (69%)

| Elemento | Status | % | Resolvido? | O que falta | Fonte |
|---|---|---|---|---|---|
| Hub `docs/` | ✅ | 100 | ✅ Sim | — | ADR-007 |
| Spec e ADRs 001–023 | ✅ | 100 | ✅ Sim | — (004, 005 e 006 seguem "Proposto" até as POCs; ADR-019, da voz, segue proposto por decisão do usuário) | [ADRs](docs/adr/README.md) |
| CHANGELOG | ✅ | 100 | ✅ Sim | — | [CHANGELOG](CHANGELOG.md) |
| `como-usar.md` e READMEs (EN e pt-BR) | ✅ | 100 | ✅ Sim | — (conferidos com o estado real da F1 pela auditoria em `f7a8fec`; avisos dos ADR-021 e 022 em `c098b41`) | [como-usar](docs/como-usar.md) |
| Auditoria completa (0 críticos · 12 altos · 25 médios · 18 baixos) | 🟢 | 95 | 🟡 Parcial | concluída sem nenhum crítico; corrigidos A3, A4, A5, M1 (CSRF por segredo, ADR-022), M2 (acesso no painel, ADR-021), M16, M19, B1–B4, redact de mais formatos, lote e limites; pendentes de baixa severidade no Beads: M13, M18, clique de terceiro no ticket, `INTEGRATION.md` do devmode | ADR-020, 021, 022 |
| Ações com efeito que sobrevivem à resposta perdida (job recuperável) | ✅ | 100 | ✅ Sim | — o Google às vezes perde a resposta do web app (medido: sem relação com duração nem com chamadas simultâneas); cada ação com efeito leva um identificador, o servidor executa uma vez só e a CLI busca o resultado guardado em vez de repetir a chamada | [ADR-020](docs/adr/020-trace-em-lote.md) |
| Aviso honesto quando a ferramenta falha | ✅ | 100 | ✅ Sim | — com a ferramenta falhando, o agente avisa em vez de dizer que fez; havia o caso oposto (a API do Google desligada e o agente respondendo "Evento criado") | [ADR-023](docs/adr/023-ferramentas-do-workspace.md) |
| POCs fora do bundle de prod | ⏳ | 10 | ❌ Não | hoje o código das POCs vai no bundle de prod, só desligado por `__DEV__` (ADR-022); tirar do bundle | ADR-022 |
| `product.md`, `tech-stack.md`, `UBIQUITOUS_LANGUAGE.md` | ✅ | 100 | ✅ Sim | — | plano#A.4 |
| Runbooks `setup-inicial` e `devmode-update` | ✅ | 100 | ✅ Sim | — | plano#A.4 |
| Arquivos open source (LICENSE Apache-2.0, NOTICE, LICENSING, CoC, CONTRIBUTING) | ✅ | 100 | ✅ Sim | — (conferir o texto do CoC 2.1 no site oficial antes de abrir o repo) | ADR-011 |
| Sem `eval`; pasta do agente nunca vira código | ✅ | 100 | ✅ Sim | — | ADR-002 |
| Web app `MYSELF` e `assertOwner` | ✅ | 100 | ✅ Sim | — (o Chat funcionou sem `DOMAIN`) | ADR-009 |
| Segredos fora do git (`.env`, `.env.local`, `.clasprc`) | ✅ | 100 | ✅ Sim | — (histórico verificado sem segredos) | log#prod |
| Wiki (`overview`, entidades, conceitos) | 🟡 | 40 | 🟡 Parcial | o log está em dia; o `overview.md` está vazio | docs/wiki |
| Preparação para abrir o repo | 🟡 | 40 | 🟡 Parcial | histórico limpo; falta trocar `OWNER/gasclaw` e decidir o `gasclaw.env` (tem domínio e IDs) | ADR-011 |
| Regra "POC em `poc/` com critério e ADR" | 🟡 | 75 | 🟡 Parcial | a P6 já está em `poc/`; a P1 ainda mora em `src/main.ts` | CLAUDE.md |
| Numeração das POCs consistente na spec | 🟡 | 30 | ❌ Não | P6 = Docs/Sheets e P8 = Excel só no ADR-009; spec §10–11 desatualizada; P2/P3 aparecem na F0 da spec e na F2 do plano | ADR-009 item 20 |
| Admin Workspace: "apps confiáveis" (pré-requisito da P7) | ⏳ | 10 | ❌ Não | configurar no Admin | runbook setup-inicial |
| Runbook de migração para conta dedicada | ⏳ | 10 | ❌ Não | escrever | spec#12; ADR-008 |
| Compra única de US$ 10 no OpenRouter (1.000 req/dia nos modelos gratuitos) | ⏳ | 0 | ❌ Não | **ação sua**: comprar no site do OpenRouter (os créditos não são gastos usando modelos gratuitos) | Beads `gasclaw-v53` |
| Privacidade dos provedores gratuitos (registro/treino das conversas) | ⏳ | 0 | ❌ Não | verificar a política antes de usar `model: free` com memória pessoal | Beads `gasclaw-v53` |

---

## POCs

| POC | Fase | Status | Resolvido? | Critério | Resultado |
|---|---|---|---|---|---|
| P1: chamada longa (UrlFetch) | F0 | ✅ | ✅ Sim | mais de 60 s sem erro | 109,5 s, 110,1 s e 126,1 s sem erro ([ADR-010](docs/adr/010-poc-p1-urlfetch.md)) |
| P2: Chat assíncrono | F2 | ⏳ | ❌ Não | card enviado 2 min depois do evento, sem chave de conta de serviço | — |
| P3: gatilho-worker | F2 | ✅ | ✅ Sim | C1 `runId` correto termina em `done/ok` · C2 worker sintético ≤ 10 s · C3 handler completo vazio < 1 s · C4 custo fixo ≤ 20% das 6 h | dev v60: 3.992 ms · 716 ms com zero traces/runs · 1.829.440 ms/dia (8,47%) · 4/4 ([ADR-027](docs/adr/027-gatilho-worker.md)) |
| P4: run durável | F2 | ✅ | ✅ Sim | 3+ execuções sem perder estado e **zero efeito duplicado em retomadas ordenadas** | dev v66: 3 UUIDs, leitura forçada do Drive, checkpoints 1→2→done, `p4-ok`, 1 efeito/1 chave ([POC](poc/p4-run/README.md), [ADR-026](docs/adr/026-run-duravel.md)) |
| P19: efeito em voo | F2 | ✅ | ✅ Sim | morte depois do efeito e antes do checkpoint final; zero repetição e aviso honesto | dev v72: `inflight: gmail.send`, 1 efeito, 0 `done key`, 0 chamadas do passo na retomada, status `failed` ([POC](poc/p19-inflight/README.md), [ADR-026](docs/adr/026-run-duravel.md)) |
| P5: GASADK | F2 | ⏳ | ❌ Não | planner via OpenRouter com checkpoint por step | — |
| **P6: Docs/Sheets nativos** | F1 | ✅ | ✅ Sim | C1: 4 Docs < 3 s · C2: < 200 ms com cache (V1, V2 ou validade de 30 s) · C3: editar invalida o cache · C4: títulos e listas preservados · C5: pasta mista resolve cada papel | C1 1,1–1,2 s; V1 472–608 ms e V2 294–383 ms → validade de 30 s (54–77 ms); C3, C4 e C5 ✅ ([ADR-012](docs/adr/012-agentes-em-docs-e-sheets.md)) |
| P7: token do CI | F0 | ⏸️ | ⏸️ Adiado | deploy verde 8+ dias depois do login | — |
| **P10: editor do Apps Script** | F1 | ✅ | ✅ Sim | C1 nomes `.md.html` preservados · C3 leitura fiel byte a byte, listagem sem hardcode, < 3 s, precedência editor → Doc → `.md` · C4 edição chega sem `up` · C5 `up` preserva o editor · C6 motor em 1 arquivo | ver a linha da P10 na Esteira e o [ADR-013](docs/adr/013-autoria-editor-e-drive.md) |
| P15: painel de limites | F1 | ⏳ | ❌ Não | C1 11 fontes ok/pendente · C2 cache < 1 s · C3 selos · C4 linha diária · C5 `./gasclaw limits` · C6 de quem é a cota | código pronto; medição aguarda gcloud e reautorização ([ADR-016](docs/adr/016-painel-de-limites.md)) |
| P16: modelos e custo | F1 | ⏳ | ❌ Não | C1 ±2% do `usage_daily` · C2 < 1 s · C3 dia = soma das horas · C4 troca ≤ 30 s · C5 recusa sem tools · C6 `prune` · C7 ≤ 3 `/key` em 30 min | código pronto; medição aguarda gcloud ([ADR-018](docs/adr/018-modelos-e-custo.md)) |
| **P11: rodízio de modelos gratuitos** | F1 | ✅ | ✅ Sim | C1–C5 na Esteira | 5 de 5 na v39: C1 20/20 turnos · C2 p95 10.924 ms (mediana 4.051 ms) · C3 troca em 1.146 ms · C4 nenhum candidato sem ferramentas · C5 automática. Expôs dois defeitos: o 403 "only available on agentic harnesses" travava o rodízio (0 de 20 na v37) e o `step()` aceitava `{"ok":false}` com HTTP 200 ([ADR-025](docs/adr/025-rodizio-de-modelos-gratuitos.md)) |
| **P14: trace do agente** | F1 | 🟡 | 🟡 Parcial | C1–C10 na Esteira | 2 execuções automáticas: C2–C5 e C7–C10 ✅; C1 ❌ p95 3.893 ms; C6 tela 2,5 s ✅ e planilha 5,2 s ([ADR-014](docs/adr/014-trace-do-agente.md)) |
| P8: Excel → Sheets | F3 | ⏳ | ❌ Não | xlsx de 5 MB lido em < 60 s | — |
| P9: papéis responder/validar/redigir | F2 | ⏳ | ❌ Não | a definir: tempo da cadeia com modelos gratuitos e ganho de qualidade medido | — |

---

## Fatos verificados que guiam as próximas decisões (2026-09-14)

| Fato | Fonte | Consequência |
|---|---|---|
| O OpenRouter tem **22 de 445** modelos gratuitos, 19 com tools | `GET https://openrouter.ai/api/v1/models` | dá para ter um rodízio com modelos que aceitam tools |
| Modelos `:free`: **20 req/min**; **50 req/dia** sem créditos e **1.000 req/dia** com compra única de US$ 10 ou mais; o limite vale por conta, somando todos os modelos | docs OpenRouter, *API reference → Limits* | o rodízio não aumenta a cota diária; três papéis custam três chamadas por mensagem |
| Criar um app do Chat exige *"A Business or Enterprise Google Workspace account"* | Google, quickstart de Chat app com Apps Script | quem usa Gmail pessoal não tem app do Chat → chat na tela gasclaw |
| O export de Doc como markdown é `drive/v3/files/{id}/export?mimeType=text/markdown` (até 10 MB) e o escopo `drive` já basta | docs da Drive API, conferido pelo orquestrador | a P6 não pediu reautorização |
| O Apps Script aguenta uma chamada única de mais de 2 min | ADR-010 | a F2 pode fazer chamadas longas por passo |
| Upload com conversão aceita Markdown → Google Doc; listar a pasta custa 294–608 ms | docs da Drive API; ADR-012 | a tela pode criar Docs sem escopo novo; cache de 30 s em vez de validar a cada mensagem |

## Decisões recentes (2026-09-14)

| Decisão | Resolvido? | Onde está registrada |
|---|---|---|
| Fechar a F0 com markdown; a F1 começa pela POC P6 | ✅ Sim | log da wiki; ADR-009 |
| Suportar os dois formatos (Google Doc e `.md`); a tela oferece "Criar como Docs \| Markdown" | 🟡 Parcial (núcleo pronto; tela na F1) | Beads `gasclaw-0ce` |
| Cache da P6: nenhuma checagem ficou abaixo de 200 ms → validade de 30 s | ✅ Sim (medido) | [ADR-012](docs/adr/012-agentes-em-docs-e-sheets.md) |
| GitHub e CI adiados | ⏸️ Adiado | Beads `gasclaw-mw8` |
| Não trocar a chave do OpenRouter que apareceu parcialmente na sessão | ✅ Sim (risco aceito) | CHANGELOG#Segurança |
| Modelos gratuitos: rodízio na F1, logo depois da P6 | ✅ Sim (decisão) | Beads `gasclaw-v53` |
| Papéis responder/validar/redigir só sob pedido, na F2 | ✅ Sim (decisão) | Beads `gasclaw-v53` |
| Compra única de US$ 10 no OpenRouter | ✅ Sim (decisão; a compra é sua) | Beads `gasclaw-v53` |
| Segunda usuária com Gmail pessoal: instalação própria e chat na tela; o `up` detecta e pula o Chat | ✅ Sim (decisão) | Beads `gasclaw-v53` |

## Bloqueios e próximos passos

1. **POCs sem trabalho manual:** `./gasclaw poc <id>` (a P6 passou; as próximas POCs seguem o mesmo padrão).
2. **Fechar as ressalvas da F0:** teste do haicai, memória no Chat, outra pessoa do domínio, e a chave e o agente no prod.
3. **Agora (P6 resolvida):** o plano detalhado da F1, começando pela leitura híbrida com cache de 30 s (rodízio `model: free`, chat na tela, detecção de Gmail pessoal, memória).
4. **Quando quiser:** retomar a Task 10 (GitHub) investigando antes o erro do `gh auth login`.

## Esteira de POCs (evoluir a aplicação junto com as medições)

Cada POC tem critério medido, roda sozinha por `./gasclaw poc <id>` (só no dev, com arquivos de teste criados automaticamente) e termina num ADR. Quando passa, a capacidade entra no produto no item da fase indicado. Ordem de execução de cima para baixo.

| Ordem | POC | Pergunta que responde | Critérios medidos | Automação | Status | Libera no produto |
|---|---|---|---|---|---|---|
| — | P1: chamada longa | O UrlFetch aguenta mais de 60 s? | > 60 s sem erro | botão/`poc p1` | ✅ passou (109–126 s) · ADR-010 | F2: passos longos |
| — | P6: Docs/Sheets nativos | Dá para ler o agente em Google Docs rápido e fiel? | C1 < 3 s · C2 < 200 ms com cache · C3 edição invalida · C4 títulos/listas · C5 pasta mista | `poc p6` (100% automática) | ✅ passou (C1 1,1–1,2 s; cache 30 s) · ADR-012 | F1: leitura híbrida Doc/.md |
| — | P10: editor do Apps Script como pasta do agente | Dá para criar e editar o agente dentro do editor do Apps Script, com nomes de arquivo servindo de pastas e o motor num único arquivo? | C1 nomes `.md.html` preservados · C2 exibição no editor · C3 leitura fiel byte a byte, listagem sem hardcode, < 3 s, precedência editor → Doc → `.md` · C4 edição chega ao agente sem `up` · C5 `up` não apaga o editor · C6 motor em 1 arquivo | `poc p10` (100% automática) | ✅ passou (execução 1 completa; execução 2 parcial repetiu C1, C3 e C4): `getContent` não é fiel, `getRawContent` e o export do HEAD são (419–1.270 ms); edição vista sem deploy pelo export; `up` 34,8 s preserva; só `_motor.gs` · ADR-013 | F1: autoria no editor + Drive |
| 1 | **P14: trace do agente** | Dá para registrar cada run do agente, passo a passo, e ver ao vivo dentro do gasclaw (tela, planilha e `./gasclaw trace`) sem passar dos 30 s do Chat e sem duplicar a página Execuções do Google? | C1 checkpoint + flush com p95 < 1,5 s em 50 runs · C2 5 runs simultâneos sem misturar · C3 falha de gravação não derruba a resposta · C4 criação automática da planilha e da pasta · C5 `./gasclaw poc p14` · C6 ao vivo ≤ 5 s · C7 polling 5 s por 30 min dentro da cota · C8 trace com `resolve_agent` + `llm_call` + `reply`, soma dos passos ±10% da duração · C9 zero ocorrência de chave ou `Bearer` (teste canário) · C10 `./gasclaw trace <id>` mostra a árvore | `poc p14` (100% automática) | 🟡 8 de 10 no dev (v13): C1 p95 3.893 ms ❌ (JSON síncrono 1,3–1,6 s); C6 tela 2,5 s ✅, planilha 5,2 s; C8 cobertura 0,92; C9 0 vazamentos · ADR-014 | F1: trace do agente (aba Ao vivo, detalhe do run, planilha, `gasclaw/runs/<id>.json` por 90 dias); base de medição da P11 e da P9 |
| 2 | P11: rodízio de modelos gratuitos | Os modelos `:free` respondem dentro dos 30 s do Chat com troca automática? | taxa de sucesso ≥ 95% em 20 mensagens · p95 < 25 s · troca em 429/5xx < 2 s | `poc p11` | ⏳ | F1: `model: free` |
| 3 | P12: conta Gmail pessoal | O gasclaw instala e roda numa conta `@gmail.com` (consentimento Externo/Teste) sem o app do Chat? | `up` sem pausas de Workspace · chat na tela responde · token dura ≥ 8 dias | `poc p12` (precisa de uma conta pessoal de teste) | ⏳ | F1: chat na tela e 2ª usuária |
| 4 | P2: Chat assíncrono | Dá para responder "pensando…" e enviar a resposta depois, como app? | card enviado 2 min depois do evento, sem chave de conta de serviço | `poc p2` | ⏳ | F2: resposta assíncrona |
| 5 | P3: gatilho-worker | O custo fixo do worker direto deixa margem para o trabalho real? | worker ≤ 10 s · idle completo < 1 s · 1.440 idles + 200 steps/dia ≤ 20% de 6 h | `poc p3` | ✅ 4/4 no dev v60 | F2: execução durável |
| 6 | P4: run durável | Uma tarefa sobrevive a várias execuções? | 3+ execuções sem perder estado e zero efeito duplicado | `poc p4` | ✅ 3/3 no dev v66 | F2: checkpoint |
| 7 | P19: efeito em voo | O run evita repetir uma ação quando morre entre efeito e checkpoint? | efeito 1 vez · passo 0 vezes na retomada · aviso honesto | `poc p19` | ✅ 3/3 no dev v72 | F2: idempotência na janela ambígua |
| 8 | P9: papéis responder/validar/redigir | A cadeia de 3 modelos melhora a resposta e cabe no modo assíncrono? | tempo da cadeia e ganho de qualidade medido em 10 perguntas | `poc p9` | ⏳ (depende da P2) | F2: `/revisar` |
| 9 | P5: GASADK | O planner do GASADK funciona com OpenRouter e checkpoint? | planner + checkpoint por step | `poc p5` | ⏳ | F2: planner |
| 10 | P8: Excel → Sheets | Um xlsx grande vira Sheets a tempo? | xlsx de 5 MB lido em < 60 s | `poc p8` | ⏳ | F3: inbox |
| — | P7: token do CI | O token do clasp no GitHub dura? | deploy verde 8+ dias após o login | exige GitHub | ⏸️ adiada com a Task 10 | F1: deploy seguro |

**Regra da esteira:** uma POC por vez; ao passar, escrever o ADR, atualizar esta tabela e a linha do item no PROGRESS, e só então implementar a capacidade no produto (com testes) e publicar no dev.

## Como manter este arquivo

- Atualize no mesmo commit sempre que um item mudar de status.
- Só marque **✅ Sim** com evidência (teste, log ou comando real).
- Recalcule a porcentagem da fase como a média dos itens.

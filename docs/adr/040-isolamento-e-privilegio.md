# ADR-040 — Isolamento e escalonamento de privilégio nos caminhos novos

Status: **Aceito** · 2026-09-19
Relaciona: [ADR-002](002-agente-pasta-sem-codigo.md) (a decisão fundadora),
[ADR-021](021-acesso-aprovado-no-painel.md) (o painel decide),
[ADR-038](038-capacidades-e-linhagem.md) (capacidades e linhagem),
[ADR-039](039-subagente-e-declaracao.md) (sub-agente é declaração)

## CORREÇÃO (2026-09-19) — esta ADR afirmou demais

A versão original dizia, sem qualificar, que **isolamento de credencial e de escopo é impossível**.
Isso está **certo para agentes que dividem um projeto** e **errado para especialistas em projetos
próprios**.

No caminho (B) — `projects.create` —, cada especialista é um **projeto Apps Script próprio, com
manifesto próprio**. E `oauthScopes` mora no manifesto. Um especialista de agenda nasce com
`calendar` e **nada mais**: sem Gmail, sem Drive, sem Contatos.

**Isso é isolamento real de credencial e de escopo, garantido pela plataforma e não pela nossa
disciplina — e é mais forte que a interseção de ferramentas.** A interseção depende de o nosso
código estar certo; o escopo ausente do manifesto não depende de nós: a chamada simplesmente não é
autorizada.

A tabela abaixo continua valendo **dentro de um projeto**. Onde se lê "não isolável", leia-se "não
isolável entre agentes que dividem o mesmo projeto".

## O limite honesto do isolamento — dentro de um projeto

**Agentes que dividem um projeto Apps Script rodam sob os MESMOS escopos OAuth do dono.** Entre
eles não existe isolamento de processo, nem de credencial, nem de escopo. Um agente não
roda "na conta dele": roda na do dono, como todos os outros.

O que dá para isolar de verdade é exatamente isto, e nada além:

| Isolável | Como | Força |
|---|---|---|
| **Dado** | pasta do Drive e compartilhamento dela | real, mas é a permissão do Drive — não do gasclaw |
| **Ferramenta aprovada** | `ACCESS:<folderId>`, aprovado no painel | real e verificável em código |
| **Capacidade** | `CAP:<folderId>`, aprovada uma a uma | real e verificável em código |

E o que **não** é isolável **entre agentes do mesmo projeto**, por mais que a pasta pareça uma
fronteira (para especialistas em projeto próprio, ver a correção no topo):

- **credencial** — a chave do OpenRouter e o token OAuth são do projeto, não do agente;
- **escopo** — os 14 escopos valem para qualquer caminho de código, de qualquer agente;
- **processo e memória de execução** — é uma execução só do Apps Script.

**Por que isto está escrito em negrito e no topo:** uma promessa falsa de isolamento é pior
que a ausência dela, porque muda o comportamento de quem confia. Colocar dado sensível na
pasta de um sub-agente **não** o esconde de outro agente do mesmo projeto: esconde de quem não
tem a pasta compartilhada. São coisas diferentes.

> **A analogia com o OpenMausBot engana exatamente aqui.** Lá cada bot tem computador próprio e
> apps conectados por OAuth individual: o isolamento é **de processo e de credencial**. Aqui é
> **de dado e de ferramenta aprovada**. Copiar a expectativa de lá para cá é o erro a evitar.

### Corolário: `.gasclaw/subagents/<nome>/` é CONVENÇÃO, não garantia

Guardar dados do sub-agente numa subpasta da pasta do pai organiza e torna auditável — e
**não** cria fronteira de segurança. Quem tem a pasta do pai compartilhada alcança a subpasta;
qualquer caminho de código do projeto alcança as duas. Se um sub-agente precisar de dado que o
público do pai não pode ver, a resposta **não** é uma subpasta: é **outra pasta do Drive, com
outro compartilhamento** — e aí o isolamento é do Drive, que é real.

## Modelo de ameaças — o adversário é nomeável

**Adversário principal:** alguém com acesso de **edição** à pasta compartilhável de um agente.
Ele não escreve código (ADR-002) — ele escreve **markdown**. Todo o resto decorre disso.

| Caminho | O que ele ganha **hoje** | O que ganharia **com o desenho proposto** | Controle que fecha |
|---|---|---|---|
| **Papéis** (`AGENTS`, `SOUL`) | muda o prompt do agente | o mesmo | precedência do editor e **procedência visível** (ADR-035); tools continuam vindo do painel |
| **Sub-agente** | — | declarar um sub-agente com `gmail.send` que o pai não tem | **interseção dupla** (registro **e** pai) em `subagentTools`; `allowedTools` sozinho **não** basta — ele filtra contra `TOOLS`, não contra o pai |
| **Sucessão** | — | escrever o markdown de um sucessor que "nasce" com `create` | `capsAfterSuccession` intersecta com o antecessor; o texto do LLM é **conteúdo de terceiro** |
| **Criação de agente** | — | multiplicar agentes até estourar o registro | singleton `CREATOR` **pela forma do dado** + capacidade aprovada + guarda de tamanho em `saveAgents` |
| **Mensagem entre agentes** | — | fazer B executar o que A não pode | mensagem entra como **dado com procedência**; a contenção real é a **aprovação de tool de B** |
| **Planilha de linhagem** | — | adulterar o histórico para forjar um "delta" e justificar sucessão | a planilha é **espelho**: nada lido dela decide (D3), e o núcleo é puro por teste estrutural |
| **Arquivamento** | — | reativar um agente arquivado lendo a conversa dele | ler **não** é caminho de execução: `isRunnable('archived') === false` em turno, run, gatilho e entrega |
| **Intervalo** | — | gerar sucessores em rajada e queimar o orçamento | `mayGenerate` com padrão de 24 h, piso de 1 h, e recusa **visível no trace** |

### A ameaça que o desenho NÃO elimina, e que precisa ser dita

**A interseção protege a composição; ela não protege a conversa.** Se A manda mensagem para B,
B age com as ferramentas **de B**. Um prompt envenenado na pasta de A pode pedir a B algo que A
jamais poderia fazer sozinho.

O que contém isso **não é um rótulo de "não confiável"** — um rótulo só funciona se o modelo
colaborar. O que contém é o mesmo mecanismo que já protege o gasclaw contra e-mail malicioso, e
que o eval **`e6-injecao`** prova: *mesmo com o modelo enganado*, `gmail.send` para no card de
aprovação e **não sai**.

Logo o risco residual é estreito e nomeável: **A pode induzir B a fazer o que B faz sem
aprovação** (tools `approval: 'never'`). Não é nada — é pouco, e é auditável. Quem ligar
`message` num agente precisa saber disso.

## Controles, com teste

Todos em `test/agentSecurity.test.ts` (30 testes), além dos 20 de `agentCaps` e 17 de `subagent`.

1. **Capacidade nunca se autoconcede — propriedade estrutural.** Auditoria de 2026-09-19:
   **nenhum arquivo de `src/tools/` menciona `PropertiesService`, `setOwner`, `saveAgents`,
   `ACCESS:`, `CAP:`, `CREATOR` ou `OWNER`.** Isso valia por sorte de desenho; agora é teste que
   falha no dia em que alguém abrir essa porta — que é exatamente o dia em que se precisa saber.
2. **O texto gerado pelo Opus é conteúdo de terceiro.** Sucessor cujo markdown pede o mundo, com
   antecessor sem nada, **nasce com nada**. "Foi o nosso modelo que escreveu" não é procedência:
   o material de entrada veio da pasta.
3. **Interseção nunca união** no sub-agente, verificada como **propriedade** (para qualquer
   declaração, o resultado é subconjunto do pai), não como caso isolado.
4. **Mensagem entre agentes:** entra com procedência declarada, teto de **1 salto**, e a cadeia
   impede A→B→A. O conteúdo não é censurado — é **enquadrado**.
5. **Menor privilégio:** ter `create` **não** dá `message`, `dream`, `initiative` nem `succeed`.
   Cada capacidade é aprovada uma a uma e aparece como **etiqueta** no painel.
6. **A linhagem é espelho:** `agentCaps.ts` não importa nada — sem Drive, sem planilha, sem
   Properties, sem relógio — e o teste impede que deixe de ser.
7. **Sucessão não é escada:** o sucessor nunca nasce com mais que o antecessor; coroar continua
   sendo ato humano dentro do mandato.
8. **O singleton resiste a backup e a corrida:** dois criadores é estado **não representável**, e
   um `CREATOR` restaurado não devolve poder sem a capacidade aprovada.

## Nova capacidade: `message`

Falar com outro agente é **capacidade própria**, aprovada uma a uma — **não** um poder implícito
de quem tem `create`. Nome em inglês: `message`. Ela não existe ainda no conjunto
`CAPABILITIES`; entra junto com a implementação do caminho, e não antes.

## O que NÃO é possível aqui, e o que se usa no lugar

Saber onde está a borda é parte de "impecável":

| Controle que eu gostaria | Por que não dá | O que se usa no lugar |
|---|---|---|
| Sandbox por agente | um projeto, uma execução, sem isolamento de processo no Apps Script | ferramenta aprovada por agente + aprovação por tool |
| Credencial por agente | a chave e o token são do projeto | nenhuma tool alcança a chave (controle 1) |
| Escopo OAuth por agente | escopo é do manifesto, vale para o projeto inteiro | registro fechado de tools + `ACCESS:` |
| Limite de CPU/memória por agente | o Apps Script não expõe isso | teto de passos, teto de orçamento, intervalo mínimo |
| Assinatura do markdown da pasta | não há onde guardar chave que a pasta não alcance | procedência visível no painel (ADR-035) |

## Achados da revisão adversarial independente (2026-09-19)

Uma revisão de desenho independente atacou estes caminhos. Ela **confirmou** quatro defesas por
tentativa de quebra — interseção dupla em `subagent.ts`, forjar `granted`/`user` no arquivo (a
assinatura pega), ler o próprio card (só o hash fica no Drive) e trocar o destino da entrega (vem
do ponteiro) — e **encontrou quatro defeitos no desenho aprovado**. Três eram de **forma do
dado**, logo baratos agora e caros depois da fiação. Corrigidos nesta rodada:

| # | Defeito | Correção |
|---|---|---|
| **§B** | O candidato mora fora do run, então trocar o `.md` durante as 24 h do card mantinha o run íntegro: o dono aprovava o diff de ontem e promovia o texto de hoje | `candidateSeal` (SHA-256) **dentro** do `DurableRun`, logo assinado; a promoção recalcula e recusa na divergência |
| **§C** | `removeAgent` apagava só `ACCESS:`; `MODEL:` e `STEPS:` **já sobravam hoje**. Com `CAP:` e `LASTGEN:`, remover e recriar a pasta com o mesmo nome devolveria as capacidades **sem um clique** | `forgetAgentProps` apaga **todo** prefixo `*:<folderId>`, inclusive prefixos criados depois desta linha |
| **§D** | `canDelegate(depth)` não sobrevivia ao checkpoint: `parseRun` tem whitelist e um número descartado volta como **0**, o valor permissivo. A profundidade 1 morria no primeiro checkpoint — o **único fail-open** do projeto | o run carrega `subagent` (na whitelist e na assinatura) e `canDelegate` passa a olhar **presença de nome**, não número |

**§A permanece aberto e é o motivo de `message` não existir.** A revisão mostrou que
`main.ts:443` deriva `isOwner` só de `r.user`, e `tools/google.ts` só olha `ctx.isOwner` — nem
qual agente, nem quem originou o texto. A fiação óbvia de mensagem entre agentes propagaria
`user` e faria B rodar como **dono**, com as tools de B, dirigido por texto da pasta de A: a
união das tools de todos os agentes, com a autoridade do dono. Os quatro controles exigidos —
`originAgent` assinado, `isOwner = r.user === owner && !r.originAgent`, o card nomeando o
solicitante, e `tools(A) ∩ tools(B)` — são **pré-requisito** de qualquer linha de `message`.

### Registrados, não corrigidos nesta rodada

- **§E** — herança de `granted`/`done` pelo sub-agente: uma aprovação dada ao pai não pode valer
  para o sub-agente sem o dono saber.
- **§F** — agente arquivado continua dono de lease e com card aprovável por 24 h: arquivar precisa
  encerrar o que está em voo, não só impedir o que vem depois.

Ambos entram antes de a squad existir de verdade.

---

## Autenticação pai → filho (desenhada antes de qualquer fiação, 2026-09-19)

Com filhos virando serviços chamados por `UrlFetchApp`, **o web app do filho não pode ser aberto**:
uma URL descoberta seria caminho de escalonamento para qualquer pessoa.

### O que a plataforma dá, e onde ela para

O manifesto do pai já usa `{"access": "MYSELF", "executeAs": "USER_DEPLOYING"}`. Aplicado ao filho,
`MYSELF` exige o token OAuth **do dono** para entrar. Isso barra estranhos.

**Mas há um limite que precisa ser dito:** `MYSELF` autentica **o dono**, não **o pai**. O filho não
consegue distinguir "o motor do gasclaw me chamou" de "qualquer outro código rodando como o dono me
chamou". A plataforma resolve *quem é a pessoa*, não *qual programa*.

### A recomendação: segredo por filho, com o precedente que já existe

Reusar o padrão do [ADR-022](022-csrf-segredo-da-cli.md), que já protege as ações com efeito:
**segredo no corpo do POST, comparado em tempo constante**.

1. O pai **gera um segredo próprio para cada filho** no momento da criação e o grava no código do
   filho (não é a chave do OpenRouter — é um segredo criado para este fim, e só serve para esta
   conversa).
2. Toda chamada pai → filho leva o segredo no corpo.
3. O filho compara em tempo constante e recusa sem ele.
4. Segredo é **por filho**: vazar um não abre os outros.

Assim a identidade do chamador passa a existir, em cima da autenticação do dono que a plataforma
já dá. **Duas camadas, e a de cima é nossa** — como a recusa do próprio `scriptId`.

### O que continua não resolvido, e é honesto dizer

Um segredo gravado no código do filho é legível por quem abrir o projeto do filho no editor — ou
seja, **pelo dono**. Contra o dono não há defesa aqui, e nem deveria haver: é a conta dele. A
defesa é contra terceiro que descubra a URL, e contra isso as duas camadas bastam.

## O teto familiar, e as duas alavancas de parada (2026-09-19)

Como o filho usa a mesma chave do pai, o OpenRouter passa a reportar **a família inteira**. Isso dá
um instrumento que **não existiria com chaves separadas**:

```
gasto da família (OpenRouter, por chave) − gasto do pai (trace) = consumo dos filhos
```

É o mesmo offset que a medição de 2026-09-19 explicou (deltas idênticos até a 12ª casa, offset
constante de US$ 0,053229), **virado do avesso e usado a favor**: o painel mostra o que os filhos
gastaram **sem instrumentação nenhuma neles**.

**É LIMITE SUPERIOR, não medida.** O número inclui qualquer coisa que use a chave. A ressalva vai
para a tela, no mesmo espírito do `CROSS_CHECK_NOTE`.

### O que acontece ao estourar

| faixa | ação | por quê |
|---|---|---|
| < 80% do teto | segue | — |
| ≥ 80% | **para de criar filhos** | a ação menos destrutiva que ainda resolve |
| ≥ 100% | **congela capacidades** | os agentes continuam atendendo; só o poder some |
| — | **nunca corta a chave** | cortar pararia **o pai também** |

Leitura inválida devolve `ok`: não se pune por suspeita.

### As duas alavancas de parada do dono (para o runbook)

O uso da mesma chave rende um bônus que merece estar escrito, não implícito:

1. **Congelamento global** (`CAPS_ENABLED=false`) — congela **capacidades**, mantém os agentes
   atendendo. É o freio.
2. **Trocar a chave do OpenRouter** — **desliga todos os filhos de uma vez**, cortando o
   combustível. É o disjuntor.

Duas formas de parar tudo, com efeitos diferentes. A primeira é reversível num clique; a segunda
para o pai junto e exige reconfigurar.

### O que fica em aberto, sem maquiar

**O filho gasta fora do teto POR RUN do pai.** O teto familiar é **mitigação, não eliminação**: ele
enxerga o agregado, não cada run. E há **defasagem** — o `keyInfo` tem cache de **10 minutos**
(`FAMILY_LAG_MS`), e a propagação do próprio OpenRouter foi observada em mais de 25 s numa medição
controlada. **Um filho em laço pode gastar durante essa janela antes de aparecer em qualquer tela.**

O que limita o dano nesse intervalo não é o teto familiar: é o intervalo mínimo entre gerações, o
singleton de `create` e o fato de o filho nascer sem capacidade nenhuma.

---

## MEDIDO (P27, dev v126, 2026-09-20): o filho NÃO alcança o motor

O desenho de *pull* acima — "o filho pede a chave ao pai, autenticado pelo segredo" — **não funciona
como especificado**, e agora isso é fato medido, não raciocínio.

### O que a P27 mediu

Reusando o filho da P24 (nenhum projeto novo, nenhum Opus gasto), reescrito para chamar a rota
`childkey` do motor com o **próprio token**:

| Campo | Valor | O que diz |
|---|---|---|
| `code` | **200** | o filho EXECUTOU — o consentimento deixou de ser o obstáculo |
| `needsNewConsent` | **false** | o dono autorizou; não é falta de clique |
| `body` | **`401\|<html>… ppConfig …`** | o MOTOR recusou o token do filho |

O `401` vem com página de login do Google: a chamada foi barrada **antes de chegar ao nosso código**.
Não é a rota `childkey` recusando — ela nunca foi alcançada.

**A causa:** um token emitido para o projeto do FILHO carrega apenas os escopos DELE. Nenhum deles
autoriza invocar o web app de **outro** script como aquele usuário. `access: MYSELF` autentica *a
pessoa*, e a plataforma não aceita, para essa finalidade, um token de outro projeto.

### O argumento que eu tinha, e por que ele era irrelevante

A ADR-041 proíbe `getOAuthToken` no código gerado. Eu havia construído o argumento de que a exceção
poderia ser aberta para o filho, porque o token dele é limitado ao manifesto dele, que `narrowScopes`
garante estritamente menor e sem `script.projects`.

**O argumento não resolvia nada.** O obstáculo não era o crivo — era o Google não aceitar o token.
Ter "resolvido" a tensão por raciocínio teria enfraquecido o crivo **e** deixado a entrega sem
funcionar: pior nos dois sentidos. É o caso exemplar de por que se mede em vez de argumentar.

### As opções que sobram — e a escolha é do dono

| # | Opção | O que custa |
|---|---|---|
| 1 | Pull com segredo, como está | **Morre com esta medição**: sem token válido, o filho não alcança a rota |
| 2 | Abrir o web app do motor (`ANYONE_ANONYMOUS`), protegido só pelo segredo por filho | Troca a autenticação da plataforma pela nossa. O segredo vira a **única** defesa, e ele mora no fonte do filho |
| 3 | Chave do OpenRouter no fonte do filho | Aceita o que esta ADR rejeitou: projeto compartilhado leva a chave junto |
| 4 | **Só `automation`** — filhos sem conversa, que nunca precisam de chave | Nada. É o caminho que esta ADR já chama de barato, e o único que não abre mão de nada |

**Recomendação:** a 4. A 2 é a segunda opção *se* o dono quiser sub-agentes conversando de fato — e
nesse caso o segredo precisa ser **rotacionável**, não apenas rearmável, porque ele deixa de ser a
segunda camada e passa a ser a única.

As opções 2 e 3 trocam segurança por capacidade. Essa troca é decisão do dono, não do agente.

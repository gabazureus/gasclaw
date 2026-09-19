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

# Spec: F5 — o sonho (auto-aprimoramento por evolução de prompt)

> ⛔ **NÃO VALE na branch `consertos-e-reach-out`.** O que esta spec desenhou saiu dessa branch com o
> auto-aprimoramento. Ela fica como registro do que foi construído e medido na `evolucao-f5-f8`.

> Escrita depois do gate de alinhamento de 2026-09-19 (D1–D6 em
> `conductor/tracks/f5-sonho/decisions.md`). Vocabulário em
> `UBIQUITOUS_LANGUAGE.md`, seção *Auto-aprimoramento — o sonho*.
>
> **Rigor de módulo/interface só para a Fase 2.** A Fase 1 é a POC P23, que pode
> invalidar o desenho inteiro; escrever interface antes da medição seria gerar
> ativo sem evidência — o erro que a ADR-026 cometeu com a P3 e teve que refazer.
>
> **Plataforma: Google Workspace primeiro** (decisão do usuário, 2026-09-19).
> Conta pessoal é trabalho posterior; a diferença de cota está registrada em
> *Conta pessoal — adiada* no fim desta spec. A simplificação é usada, não ignorada:
> some o ramo de 100 e-mails/dia, some o "Chat indisponível" e a cota de gatilho é
> uma só (6 h/dia = 21.600.000 ms).
>
> **A capacidade é opt-in por agente** (decisão do usuário, 2026-09-19). Sonhar
> **não** é comportamento padrão: nenhum agente existente passa a sonhar por efeito
> desta entrega, e isso é provado por teste, não prometido. A POC roda num agente
> novo, criado para isso — raio de alcance de uma pasta só, rollback = apagar a pasta.
>
> **Escopo desta spec: só o sonho.** "Mandar mensagem por iniciativa" e "me chame
> quando precisar" pertencem à track F3a (proatividade), cuja spec v1 está
> reprovada. Ver `conductor/tracks/f3-proatividade-e-governanca/`.

## Problem & purpose

O gasclaw é igual hoje e amanhã. Quando um turno falha — o modelo não chamou a
tool certa, parou no teto de passos, respondeu fora do que o `SOUL` pedia — o
registro dessa falha vira linha no trace e mais nada. O usuário quer que o agente
**evolua**: que use o próprio histórico de erro para melhorar como ele se comporta.

O bloqueio não é gerar uma proposta de melhoria — um modelo faz isso numa chamada.
O bloqueio é que **melhoria sem juiz é auto-elogio**. Um agente que escreve a
própria instrução, avalia a si mesmo e promove o resultado não melhora: ele deriva.
É por isso que o conjunto-juiz vem antes do gerador nesta spec.

## Prior art — o que foi lido, e o que não sobrevive

| Fonte | O que faz | O que sobrevive no Apps Script |
|---|---|---|
| [SIA](https://github.com/hexo-ai/sia) (175 arquivos, código real, arXiv 2605.27276) | Laço meta/target/feedback. O meta-agente escreve `target_agent.py`; o target executa e loga em `agent_execution.json`; o feedback lê o log e **reescreve o código** da geração seguinte. Avaliação contra `data/private/` (held-out) → `results.json`. O padrão `--sandbox none` "runs agent-generated code with host access" | **Sobrevive:** a separação de três papéis, o diretório por geração (artefato + log + razão + placar) e a avaliação contra conjunto fixo e confiável. **Não sobrevive:** o artefato ser código executável (ADR-002), o sandbox, e o braço de pesos ("& Weight Updates" do título) |
| [Dream-RSI](https://github.com/zhengkid/Dream-RSI) (Google/DeepMind/UMD/UVA) | Otimiza a **política de meta-exploração** relendo uma árvore de descoberta já gravada como "replay simulator", com feedback off-policy barato e zero gradient steps | **Nada operacional.** A árvore do repositório tem 21 arquivos — README, `CITATION.cff`, `assets/*`, `papers/Dream-RSI.pdf` — e **zero linha de código**; o release plan marca `Full codebase ⏳ Being prepared`. Além disso o mecanismo pressupõe milhares de ciclos proposta→avaliação com execução real de programas e exploração paralela, que o GAS não dá (6 min por execução, sem execução de código da pasta) |

Registro honesto: **não é possível reimplementar o Dream-RSI**, nem afirmar nada
sobre a implementação dele, porque ela não existe publicamente. O que esta spec
toma emprestado dele é uma ideia só, e ela é barata: *o histórico já gravado é
material de avaliação que não custa reexecutar*. No gasclaw isso já existe com
outro nome — o trace e os runs.

## Design concept

**O agente propõe reescritas do próprio prompt; os evals do repositório julgam; o
dono promove.**

Três compromissos definem o desenho e derivam direto das regras do projeto:

1. **O artefato é prompt, nunca código.** Um `PromptCandidate` é markdown. Não há
   `eval`, não há `new Function`, não há código lido da pasta — a ADR-002 não é
   contornada, é respeitada por construção.
2. **O juiz vem do build.** Os cenários moram em `evals/`, versionados, como já
   manda o ADR-017 §6. Um critério que morasse na pasta compartilhável entregaria
   a nota a quem edita a pasta.
3. **A unidade durável é o par (candidato, cenário).** Um passe completo sobre os
   27 evals atuais custa ~174 s (27 × 6,45 s de média medida nos ADR-017/024) e
   cabe numa execução de 6 min — mas três candidatos não cabem. O ciclo é um
   `DurableRun` no pump que já existe, com lease e checkpoint (ADR-026/027).

## Scope

**In scope**, nesta ordem:

1. **POC P23** — custo de um ciclo em cota de gatilho e em requisições `:free`.
   Gate de viabilidade: sem número medido, nada é escrito.
2. **Conjunto-juiz do sonho** — cenários de eval novos, feitos para medir
   qualidade de resposta, não mecanismo.
3. **Ciclo de sonho** — colheita do material, geração de candidatos, avaliação,
   placar, proposta.
4. **Promoção com aprovação** — card durável com diff e delta.
5. **agente com a capacidade `create`, squad e linhagem** — [ADR-038](../adr/038-capacidades-e-linhagem.md),
   depois de fechado o gate A5.

**Out of scope**, explicitamente:

- **Qualquer geração de código.** Não é "ainda não": é recusado, com ADR.
- **Disparo automático do ciclo.** `./gasclaw dream` é manual nesta track. Pendurar
  o sonho num gatilho periódico depende da P22, que **não tem número medido**
  (`poc/p22-proatividade/README.md` diz isso na primeira linha).
- **Alterar o projeto Apps Script de dentro** (`script.projects`,
  `projects.updateContent`). Recusado com razão registrada na [ADR-038](../adr/038-capacidades-e-linhagem.md):
  daria ao agente o poder de remover as próprias travas, com a entrada vindo de uma
  pasta não confiável. A evolução acontece por **linhagem**, não por mutação do motor.
- **A sucessão automática do agente criador.** O desenho do agente criador e da linhagem está na
  ADR-038; **quem autoriza a sucessão é gate aberto (A5)**, porque contradiz a D2.
- **Reescrita de `AGENTS.md`.** O frontmatter dele escolhe tools, modelo e
  `http_allow` — é configuração executável de fato, não prompt. Fora do alcance do
  sonho em qualquer fase.
- **Mensagem por iniciativa e pergunta não supervisionada.** São a F3a.

## Behavior

**Caminho feliz.** O dono roda `./gasclaw dream`. O ciclo colhe as falhas reais
dos últimos N dias do trace, gera 3 candidatos de `SOUL.md`, avalia cada um contra
o conjunto-juiz (par a par, um passo de run por par), grava placar e
`improvement.md` em `.gasclaw/dreams/<cycleId>/` e termina propondo o melhor
candidato admissível num card. O dono vê o diff e o delta; aprova ou não. Nada
muda antes do clique.

**Casos de borda.**

- **Nenhuma falha no período:** o ciclo não roda e diz por quê. Sonho sem material
  é o modelo inventando problema — exatamente o modo de falha que D5 recusa.
- **Nenhum candidato admissível:** o ciclo termina com "nada a propor" e o placar
  gravado. Não promover é um desfecho legítimo, não um erro.
- **Empate no placar:** não propõe. Com N pequeno o sinal é ruidoso; propor no
  empate é ruído virando mudança.
- **Cota `:free` do dia já consumida:** o ciclo **aborta antes de começar**, não no
  meio. Um ciclo pela metade gasta cota e não produz veredito.
- **Candidato que regride em qualquer cenário de segurança** (injeção, tool fora da
  lista): inadmissível, sem discussão de placar. Fail-closed.
- **Execução morre no meio:** o ciclo retoma do checkpoint como qualquer run
  durável. Avaliação é idempotente por par — reavaliar o mesmo par não tem efeito
  externo.

**Erros.** Ciclo que estoura o teto termina em falha honesta e registrada, com o
placar parcial preservado. Nunca `paused` pedindo para continuar: o `./gasclaw
dream` é manual, quem quiser continuar roda de novo.

## Data

| Onde | O quê | Por quê ali |
|---|---|---|
| `.gasclaw/dreams/<cycleId>/<candidateId>.md` (pasta) | candidatos e `improvement.md` | Texto, e texto grande; as Properties têm 9 KB por valor |
| `.gasclaw/dreams/<cycleId>/board.json` (pasta) | placar do ciclo | Junto dos artefatos que ele pontua |
| `DurableRun` | estado do ciclo | O ciclo é um run; nenhum tipo novo de estado (ADR-026) |
| planilha `gasclaw — execuções` | uma linha por ciclo | Mesmo lugar do custo e dos limites (ADR-016/018) |
| `evals/dream-*.md` (repositório) | conjunto-juiz | **Nunca** na pasta: quem edita a pasta não dá a própria nota |

**A pasta é não confiável.** O candidato mora nela, logo, ao ser promovido, o texto
entra pelo mesmo caminho de qualquer papel vindo do Drive — é dado, nunca
instrução de motor — e a procedência tem que aparecer no painel, como o ADR-035
fez com os papéis.

## Acceptance criteria

**Fase 1 — POC P23** (medida no dev, veredito JSON, régua da ADR-027 §3:
só valem cronômetros de dentro do gatilho)

- [ ] C1: um passo de sonho (um par candidato×cenário) ≤ 10.000 ms, o mesmo teto
      que a P3 usou para o worker sintético.
- [ ] C2: um ciclo completo de 3 candidatos × 6 cenários consome ≤ **2%** da cota
      diária de gatilho do Workspace (21.600.000 ms), somado aos 8,47% já medidos
      pela P3. Projeção a partir do C1, não de aritmética de papel.
- [ ] C3: o ciclo consome ≤ **20 requisições `:free`**, contra o teto de 50/dia do
      tier baixo (ADR-016) — ou seja, sobra folga para o agente acordado.
- [ ] C4: o ciclo **aborta antes do primeiro passo** quando a cota `:free` do dia
      já passou do limite configurado. Provado por medição, não por teste unitário.
- [ ] C5: o agente sem a capacidade ligada **não sonha** — `./gasclaw dream` nele
      recusa antes de qualquer chamada ao modelo, e nenhum agente existente passou
      a ter a capacidade por efeito da entrega. Medido, não só testado.
- [ ] ADR escrita com o número medido, **reprovação inclusive**, como a ADR-026 fez.

**Fase 2 — conjunto-juiz** (antes do gerador, de propósito)

- [ ] ≥ 6 cenários `evals/dream-*.md` que medem qualidade de resposta, não
      mecanismo, e que o papel vigente **não passa 6 de 6** — um juiz que o estado
      atual já gabarita não tem como mostrar melhora.
- [ ] Pelo menos 2 cenários adversariais de regressão de segurança (injeção, tool
      fora da lista) marcados como **portão**: reprovar neles é inadmissibilidade,
      não perda de pontos.

**Fase 3 — ciclo** (só se a P23 passar)

- [ ] Material vem do trace/runs reais; ciclo sem material não roda e diz por quê.
- [ ] Um ciclo produz exatamente um `board.json` e N arquivos de candidato.
- [ ] Nenhum candidato vira papel vigente sem clique do dono — provado por teste.
- [ ] Empate no placar não propõe.
- [ ] `AGENTS.md` nunca é alvo — provado por teste adversarial.
- [ ] `npx tsc --noEmit` limpo e `npx vitest run` verde.

## Testing strategy

Fronteira: o núcleo puro. Seleção de material, montagem do placar e a regra de
admissibilidade são funções sem I/O — testadas por tabela, sem mock. A avaliação
reusa `evaluate` de `src/eval.ts`, que já é puro e já tem suíte.

Mock só do que não é nosso: Drive, Properties, relógio, OpenRouter. Nada de mockar
o placar nem a regra de admissibilidade.

Adversariais obrigatórios: candidato que tenta virar `AGENTS.md`; candidato que
contém texto instruindo o motor; cenário-juiz vindo da pasta em vez do build;
ciclo que tenta promover sem credencial; material forjado na pasta.

Sem meta de cobertura. "Pronto" = contrato, bordas, invariantes e regressão.

## Riscos assumidos

1. **O sinal pode ser fraco demais para decidir.** 3 candidatos × 6 cenários é uma
   amostra pequena; a diferença entre candidatos pode ser ruído. Mitigação de
   desenho: empate não propõe. Se na prática der empate quase sempre, a conclusão
   honesta é que o laço não serve nesta escala — e isso vira ADR, não mais N.
2. **O juiz pode ser gabaritável.** Otimizar contra 6 cenários fixos produz prompt
   que agrada o juiz. Mitigação: o eval é **portão de admissibilidade**, e a
   escolha final entre admissíveis é do dono (gate 1-A+B).
3. **A P23 pode reprovar em conta pessoal e passar em Workspace.** É resultado
   aceitável; o que não é aceitável é publicar um número só e deixar implícito.

## Capacidades, agente criador e linhagem (A1/A2 fechadas — ADR-038)

Quatro capacidades **opt-in e separadas**, nunca um interruptor só: `dream`,
`replicate`, `initiative`, `create`. A pasta **declara** a intenção, o painel
**aprova**, o painel **mostra a procedência** (ADR-021 + ADR-035). Nenhuma delas
entra em vigor por edição da pasta compartilhável.

`create` é **singleton pela forma do dado**: uma Property `CREATOR` cujo valor é
um `folderId`. Não existe estado com dois agente criadors porque não há dois lugares onde
escrever. Passar o bastão é sobrescrever um valor — e por isso é reversível.

### O critério de "aperfeiçoado" (amarrado à D1)

Um sucessor só nasce se **ganhar do agente criador vigente no conjunto-juiz**. Sem isso a
linhagem é deriva aleatória com nome de evolução. Três condições, todas necessárias:

1. **Portão:** passa 100% dos cenários adversariais de segurança. Perder um é
   inadmissibilidade, não perda de pontos.
2. **Delta mínimo:** vence por **≥ 2 cenários líquidos** no conjunto-juiz e **não
   perde nenhum cenário-portão**. Um cenário de diferença é ruído, não sinal.
3. **Desempate humano** (D1): entre sucessores admissíveis, quem escolhe é o dono.

Honestidade sobre o número: com 6–8 cenários, "≥ 2 líquidos" ainda é um sinal
**fraco**. É o melhor disponível nesta escala, não uma medida. Se na prática quase
toda geração empatar, a conclusão honesta é que a linhagem não serve neste tamanho —
e isso vira ADR, não mais cenários por força bruta.

### Squad

Membros criados pelo agente criador para funções diferentes, **sem nenhuma capacidade**:
executores, não criadores. É o que `effectiveAccess(null)` já faz
(`src/workspace.ts:178-184`), promovido a invariante testada.

**Conserto devido e prévio (D15):** `store.saveAgents` (`src/store.ts:20-22`) grava a
Property `AGENTS` sem guarda de tamanho, ao contrário de `usage.ts` (`PROP_MAX`). Com
~70 bytes por entrada e 9 KB por valor, o teto é **~130 agentes**, e estourar **lança
exceção** em vez de degradar. A guarda entra **antes** de qualquer linha de squad.

### Critérios de aceite — agente criador e linhagem

- [ ] Agente sem `create` não cria agente — provado por teste e medido no C5.
- [ ] Ligar o agente criador num agente **desliga no anterior**, e não existe entrada de
      dados que represente dois agente criadors — provado por teste sobre a forma do dado.
- [ ] agente criador removido ⇒ ambiente **sem agente criador**, detectável no painel, ninguém cria
      agente, nada quebra. `removeAgent` limpa `CREATOR` como já limpa `ACCESS:`.
- [ ] Membro de squad nasce com zero capacidades — provado por teste adversarial.
- [ ] `saveAgents` recusa com mensagem honesta ao se aproximar dos 9 KB, em vez de
      lançar exceção crua.
- [ ] Toda sucessão grava linhagem: geração, pai, diff, placar, delta e filhos.
- [ ] Voltar ao agente criador anterior é uma operação, e a linhagem diz o que a geração
      revertida criou.

## Conta pessoal — adiada (registro da diferença)

Decidido testar em Workspace primeiro. Quando a conta pessoal entrar, estes são os
números que mudam (de `src/limits.ts:17-18`, vindos da documentação do Google e
**nunca medidos** — ver ADR-031, *O que ainda NÃO foi medido*):

| Limite | Workspace | Pessoal |
|---|---|---|
| Runtime de gatilho | 21.600.000 ms/dia | 5.400.000 ms/dia |
| UrlFetch | 100.000/dia | 20.000/dia |
| E-mail | 1.500/dia | 100/dia |
| Google Chat | disponível | **não existe** (ADR-031) |

Consequência para esta track: o custo fixo já medido pela P3 (1.829.440 ms/dia) é
8,47% da cota do Workspace e **33,9%** da cota pessoal. Um ciclo de sonho que caiba
folgado no Workspace pode não caber lá. Isso é veredito separado, em outra rodada.

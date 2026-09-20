# Spec — Enxame: 15 filhos em 24 h, gerados e implantados pelo Opus 5

- **Data:** 2026-09-20 · **Status:** P29 medida (C1, C2, C4 verdes; C3 aguarda o dono) · D1 e D3 consertados
- **Pedido do usuário (verbatim):** *"criando filhos, eu dou a permissão, vamos criar até 15
  agentes e rodar por 24 horas, para ele ir replicando e evoluindo o código com Opus 5 e
  deployando, e vamos consertando e acompanhando cada parte do processo"* · *"tudo junto,
  comprovado, e que o usuário possa rodar o dele também"*
- **Relaciona:** [ADR-038](../adr/038-capacidades-e-linhagem.md) (capacidades e linhagem),
  [ADR-040](../adr/040-isolamento-e-privilegio.md) (isolamento, opção 4),
  [ADR-041](../adr/041-sucessor-como-codigo.md) (sucessor é código),
  [ADR-042](../adr/042-automation-subagente-persona.md) (as três formas),
  [POC P24](../../poc/p24-linhagem-de-codigo/README.md) (o portão humano, medido)

---

## 1. O que já existe, medido

Nada aqui é suposição: cada número veio de uma POC rodada no ambiente real.

| Peça | Estado | Número |
|---|---|---|
| Criar projeto filho pela API | ✅ medido (P24, dev v96) | **10.754 ms** |
| Escrever manifesto + código no filho | ✅ medido | **1.122 ms**, escopos conferidos por leitura de volta |
| Versionar + implantar o filho | ✅ medido | **454 ms** + **414 ms**, URL emitida |
| O filho executa sem o dono? | ✅ medido — **NÃO** | `Authorization needed`: **um clique humano por filho** |
| Opus 5 escreve o código do filho | ✅ existe (`writeSuccessor` → `generateSuccessor`) | crivo fechado, escopos estreitados |
| O filho recebe a chave do modelo? | ✅ decidido — **NUNCA** | ADR-040 opção 4: filho é `automation`, só código |

**Conclusão operacional:** o caminho do pedido — *gerar código com Opus, criar projeto, implantar,
o dono autorizar* — **existe e está provado ponta a ponta**. O que falta não é o caminho.

## 2. O que hoje IMPEDE o pedido, e é preciso dizer antes de gastar um dólar

Cinco travas e dois defeitos. As travas são decisões; os defeitos são código que promete e não faz.

### Travas (decisão do dono, com número)

| # | Trava | Onde | Valor hoje | O pedido exige |
|---|---|---|---|---|
| T1 | Teto diário do gerador, no ambiente inteiro | `dream.ts:102` | **US$ 3,00/dia** | 15 × US$ 1,00 = **US$ 15,00** |
| T2 | Teto por geração | `dream.ts:101` | US$ 1,00 | cabe |
| T3 | Intervalo mínimo entre gerações, por agente | `agentCaps.ts:131` | **24 h** (piso de 1 h) | no piso: 24 gerações/dia por agente |
| T4 | Teto de gasto familiar | `family.ts` | US$ 5,00 → congela capacidades | precisa subir junto com T1 |
| T5 | Portão humano por filho | plataforma (P24) | 1 clique cada | **15 cliques do dono** |

**T1 é a trava que decide o tamanho da corrida.** Ela não falhou em medição nenhuma — foi escolhida
como orçamento. Subi-la é decisão legítima do dono, **com um número declarado**, e volta ao valor
anterior quando a corrida terminar. Nunca relaxar um limiar **depois de ele reprovar** continua
valendo: este não reprovou nada.

### Defeitos (código que promete e não entrega)

| # | Defeito | Prova | Consequência para o pedido |
|---|---|---|---|
| **D1** | **A linhagem não encadeia.** `succeedNow` passa `incumbentSource: agente.system` — o **prompt** — em **toda** geração. O comentário ao lado diz "na primeira geração"; a segunda nunca foi escrita | `main.ts:2158` | A geração 2 **não recebe** o código da geração 1. Cada filho é um novo sorteio do mesmo ponto de partida: isso é **replicação com variância, não evolução** |
| **D2** | **Não existe aptidão para código.** A linhagem grava `delta: null` sempre, com o comentário honesto *"nada foi medido ainda"*. Nada executa o filho e devolve um número | `main.ts` (entrada `codegen`) | Sem sinal de aptidão **não há o que selecionar**. `isPlateau`/`PLATEAU_AFTER` operam no conjunto-juiz do ciclo de **prompt**, não em código |

| **D3** | **O registro de filhos não cabia 15.** Achado pela P29, não pela leitura: UMA Script Property de 8 KB estourava em **11 filhos** com `reason` cheio (17 com `reason` curto), enquanto `MAX_CHILDREN = 40`. E o erro sobe DEPOIS de o projeto estar criado — em `succeedNow`, Opus pago e filho órfão | medido na P29 (dev v132): `8315 characters, limit is 8000` | **consertado** (registro partido em até 8 Properties) e remedido no v133: 20 de 20 registrados |

**Rodar 24 h com D1 e D2 de pé produziria 15 filhos não medidos e não encadeados** — US$ 15 para
provar que a API responde, que a P24 já provou por US$ 0. **E com D3 de pé, a corrida quebraria no
12º filho** — com o Opus já pago por ele.

### Estado dos defeitos

| # | Estado | Prova |
|---|---|---|
| D1 | ✅ **consertado** (P30) | `heirOf` + `sourceOfChild`; 5 mutações, 5 mortas |
| D2 | ⏳ aberto — é a Fase 3 | — |
| D3 | ✅ **consertado** | registro partido; 4 mutações mortas + 1 equivalente declarada; remedido no dev v133 |

### Um limite de desenho, não um defeito

**A árvore tem profundidade 1, de propósito.** `CHILD_FORBIDDEN_SCOPES` nega `script.projects` e
`script.deployments` ao filho, e a opção 4 da ADR-040 nega a chave do modelo. Logo **um filho não
gera netos**: quem gera é sempre o motor. "15 agentes" são **15 irmãos**, não 15 gerações — e é
essa negação que dá fundo à linhagem. Trocar isso não é ajuste; é reabrir a ADR-040.

## 3. O que esta track entrega

Quatro estágios. **Cada um tem critério medido e nenhum começa antes de o anterior passar.**

```
  P29  teto da plataforma          sem Opus, sem custo   ── quantos filhos por dia cabem?
   │                                                        quanto custa 1 clique em tempo real?
   ▼
  P30  encadear a linhagem (D1)    1 geração de Opus     ── a geração N+1 RECEBE o fonte da N?
   │                                                        prova: o fonte da N aparece no pedido
   ▼
  P31  aptidão do filho (D2)       2 gerações de Opus    ── o filho RODA e devolve um número?
   │                                                        prova: delta != null na linhagem
   ▼
  CORRIDA  até 15 filhos, 24 h     ~US$ 15               ── acompanhada, com parada a qualquer hora
```

### P29 — o teto da plataforma (custo: US$ 0)

Mede o que nenhuma decisão de orçamento deve ignorar, **sem chamar o Opus**: o código do filho é uma
string fixa.

| Critério | Passa quando |
|---|---|
| C1 `burst` | 5 filhos criados+implantados em sequência; registra ms de cada um e o **primeiro HTTP 429** |
| C2 `quota` | o número de `projects.create` que o dia aceita antes de recusar, **declarado**, não estimado |
| C3 `consent` | tempo de parede entre a implantação e o `authState === 'authorized'` depois do clique do dono |
| C4 `cleanup` | os 5 filhos somem do painel com `forgetChild` e o dono sabe que o projeto continua no Google |

**Se C2 recusar abaixo de 15, a corrida cabe no que C2 disser — e o pedido vira "até N", com N medido.**

> **MEDIDO (dev v133):** o Google aceitou **40 `projects.create` no mesmo dia sem uma recusa** (duas
> rodadas de 20). O teto absoluto não foi alcançado — está provado acima de 40. **O portão abre: a
> corrida continua sendo "até 15".** Números completos em [`poc/p29-enxame/README.md`](../../poc/p29-enxame/README.md).

### P30 — encadear a linhagem (conserta D1)

`succeedNow` passa a ler o **fonte do último filho desta linhagem** como `incumbentSource`, e só cai
no prompt quando não existe filho anterior. O fonte vem da API (`projects/<id>/content`), **nunca do
Drive** — ADR-002.

| Critério | Passa quando |
|---|---|
| C1 | com um filho já existente, o pedido ao Opus contém o **fonte dele**, não o prompt (teste de unidade, sem gastar Opus) |
| C2 | sem filho anterior, cai no prompt — o comportamento de hoje, preservado |
| C3 | uma geração real no dev: o fonte da geração 2 **difere** da 1 e **cita** a mudança pedida |
| C4 | mutação: desfazer o encadeamento **mata** C1 |

### P31 — aptidão do filho (conserta D2)

O filho passa a ter contrato: `doGet` devolve JSON `{ ok, score }`. O motor chama a URL do filho
depois do consentimento, lê `score`, e grava na linhagem como `delta` contra o filho anterior.

| Critério | Passa quando |
|---|---|
| C1 | filho autorizado responde `{ok:true,score:<n>}` e a entrada da linhagem sai com `delta` **não nulo** |
| C2 | filho que não responde, responde lixo, ou não foi autorizado → `delta: null` e motivo no trace. **Nunca um número inventado** |
| C3 | `beatsIncumbent` decide sobre esse número; um filho pior **não** vira o vigente |
| C4 | mutação: fazer C2 devolver `0` em vez de `null` mata um teste — zero é uma nota, ausência não é |

### A corrida — até 15 filhos em 24 h

Só depois de P29, P30 e P31 verdes.

| Critério | Passa quando |
|---|---|
| C1 | N filhos criados, implantados e **autorizados**, com N ≤ min(15, C2 da P29) |
| C2 | a linhagem tem N entradas `codegen` encadeadas, cada uma com pai, filho, custo e `delta` |
| C3 | o gasto real fica **dentro do teto declarado**; estourar **para de criar** antes de congelar |
| C4 | pelo menos uma geração é **recusada pelo crivo** e a recusa aparece no trace com motivo — um crivo que nunca recusa não foi exercitado |
| C5 | `./gasclaw down` para tudo a qualquer momento, e o painel mostra o enxame parado |

## 4. Os gates humanos, nomeados

Nada disto acontece sozinho, e é assim de propósito.

| Gate | O que o dono faz | Quando |
|---|---|---|
| **H1 — orçamento** | declara o teto da corrida (`CODEGEN_DAILY_CAP_USD` e `FAMILY_CAP_USD`) e o valor de volta ao fim | antes da corrida |
| **H2 — intervalo** | baixa o intervalo do agente ao piso de 1 h, no painel | antes da corrida |
| **H3 — consentimento** | **um clique por filho**, até 15 | durante |
| **H4 — parada** | `./gasclaw down`, ou a chave de emergência no painel | a qualquer hora |

## 5. Reprodutível por qualquer dono

O pedido inclui *"que o usuário possa rodar o dele também"*. Logo:

- toda POC roda por `./gasclaw poc p29 <passo>` — **nenhum id fixo no código**, tudo vem das
  Script Properties do ambiente de quem roda;
- o runbook mora em [`poc/p29-enxame/README.md`](../../poc/p29-enxame/README.md), com os comandos na
  ordem e o que esperar de cada um;
- a corrida **não** pressupõe Workspace: o portão humano e os tetos são iguais em conta pessoal;
- cada medição é gravada **no README da POC, com a versão do dev** — número sem versão não é medição.

## 6. Fora de escopo, explicitamente

- **Filho que gera neto.** Profundidade 1 é decisão da ADR-040, não limitação a contornar.
- **Filho que conversa.** `automation` não fala com modelo; quem raciocina é `persona` ou
  `agent.create`, e nenhum dos dois é projeto próprio.
- **Corrida sem acompanhamento.** O pedido é explícito: *"vamos consertando e acompanhando cada
  parte"*. A corrida é assistida, não desatendida.

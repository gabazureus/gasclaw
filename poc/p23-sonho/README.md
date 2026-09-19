# POC P23 — cabe um ciclo de sonho na cota do Apps Script?

> **Estado: critério escrito, NADA medido e NENHUMA linha de código escrita.**
> Nenhum número desta página existe ainda. Não cite nada daqui como evidência.
> Esta ordem é a regra do `CLAUDE.md`: critério medido antes do código.

## A pergunta

Um ciclo de sonho (gerar candidatos de prompt, avaliar contra o conjunto-juiz,
gravar placar) cabe nas **6 h/dia** de runtime de gatilho do Google Workspace,
**depois** de somar os **8,47%** que a [P3](../p3-pump/) já mediu — e sem comer a
cota diária de requisições `:free` que o agente acordado precisa?

Plataforma: **Workspace primeiro** (decisão do usuário, 2026-09-19). Conta pessoal
é outra rodada — lá o custo fixo da P3 sozinho já é 33,9% da cota.

## Por que ela vem antes de tudo

Mesmo erro que a P3 cometeu e teve que refazer: a ADR-026 desenhou o despertar
barato antes de medir, o `UrlFetchApp.fetch` síncrono derrubou o desenho, e a
ADR-027 reescreveu. Aqui o gerador de candidatos só existe se o ciclo couber.

## Critérios

Régua herdada da **ADR-027 §3**: só valem cronômetros de **dentro** do gatilho. A
API de processos chega atrasada demais para deltas curtos — foi o que invalidou
amostras da P3 duas vezes.

| # | Critério | Teto |
|---|---|---|
| C1 | um **passo de sonho** (um par candidato×cenário), sintético | < 10.000 ms |
| C2 | ciclo de 3 candidatos × 6 cenários, projetado a partir do C1 | ≤ **2%** de 21.600.000 ms |
| C3 | requisições `:free` consumidas pelo ciclo | ≤ **20** (teto do tier baixo: 50/dia) |
| C4 | ciclo **aborta antes do primeiro passo** com a cota `:free` do dia estourada | abortou, 0 chamadas ao modelo |
| C5 | agente **sem** a capacidade `dream` não sonha | recusa antes de qualquer chamada ao modelo |
| C6 | gatilhos do projeto | exatamente **1** (o de 1 min que já existe) |

Armadilhas já embutidas, herdadas dos erros da P3 e da P22:

- **veredito incompleto nunca passa** — a P3 foi invalidada duas vezes por amostra parcial;
- **C1 reprova se o passo tocar o modelo de verdade** numa medição que se diz sintética;
- **C3 é contado pelo painel de limites** (`:free requests today`, `src/limits.ts`), não
  por contador próprio: contador próprio mediria a nossa intenção, não a cota real;
- **C5 é medido, não só testado em unidade.** "Não é padrão" é garantia verificável
  ou não é garantia.

## Raio de alcance

A POC roda num **agente novo**, criado para isso, com a capacidade `dream` ligada só nele.
Rollback = apagar a pasta e a chave da capacidade. Nenhum agente existente é tocado.

> **Ajuste de critério (2026-09-19), antes de medir.** O redesenho trocou o nome das
> capacidades (`chiefOfStaff` saiu; entraram `succeed` e `create`) e acrescentou
> arquivamento e intervalo mínimo. O C5 passou a nomear `dream` explicitamente. **Nada
> mais da P23 mudou:** ela mede o custo do ciclo de sonho, que é anterior a qualquer
> geração de agente — e continua valendo sem depender de `succeed`/`create`.

## O que existe hoje e será reaproveitado

| Peça | Onde | Por que serve |
|---|---|---|
| run durável, lease, checkpoint | ADR-026/027, `src/run.ts`, `src/runStore.ts` | o ciclo é um run; nenhum tipo novo de estado |
| avaliação pura | `src/eval.ts` (`parseScenario`, `evaluate`) | o juiz já existe e já é testado |
| custo e cota por modelo | `src/usage.ts`, `src/limits.ts` | C3 sai daqui |
| aprovação durável de 24 h | ADR-028 | a promoção do candidato é um card |

---

# MEDIÇÃO — 2026-09-19, dev versão 89

Publicado com `./gasclaw up` (autorização explícita do usuário). Health ok, worker de 1 min ativo.
**Relato do que foi medido, não do que se esperava.**

## O que foi medido

| Medida | Número | Como |
|---|---|---|
| Passo de avaliação, **cronômetro interno** | **2.782 ms** (`e1-limite`) | tempo que o próprio runner reporta |
| O mesmo passo, **relógio do PC** | **10.634 ms** | `date` antes/depois do `./gasclaw eval` |
| Outros dois cenários, relógio do PC | **17.593 ms** (`smoke`), **17.525 ms** (`e1-now`) | idem |
| Cota `:free` da conta | **0 / 1.000 req/dia** | `./gasclaw limits --fresh` |
| Cota `:free` por minuto | 0 / 20 req/min | idem |

**A régua importa mais do que eu supunha.** O mesmo passo mede **2,8 s** por dentro e **10,6 s**
pelo relógio do PC: ~7,9 s são rede e ida-e-volta da CLI. A ADR-027 §3 já mandava usar cronômetro
de dentro do gatilho, e este número mostra por quê — medir pelo lado de fora reprovaria um passo
que passa com folga.

## Vereditos

| # | Critério | Teto | Medido | Veredito |
|---|---|---|---|---|
| C1 | passo de sonho | < 10.000 ms | **2.782 ms** por dentro | **passa** com folga — mas ver a ressalva |
| C2 | ciclo ≤ 2% da cota de gatilho | 2% | — | **não medido**: depende do ciclo existir |
| C3 | ≤ 20 requisições `:free` | 20 | **não consumiu nenhuma** | **não medido** — e o motivo está abaixo |
| C4 | aborta com a cota estourada | abortar | — | **não medido** |
| C5 | agente sem `dream` não sonha | recusar | — | **não medido** no dev (coberto por teste) |
| C6 | um gatilho só | 1 | 1 (worker ativo) | **passa** |
| **C7** | **variância intra-candidato** | — | **0 de 4 discordâncias** | **ver seção própria** |

**Ressalva honesta sobre o C1:** 2.782 ms é o tempo de **um cenário de eval**, que é o que mais se
parece com um passo de sonho hoje — não é o passo de sonho, que ainda não existe. O número é um
**piso**, não a medida final.

**Por que o C3 não foi medido:** a cota `:free` ficou em **0/1.000 antes e depois** das seis
execuções. Os evals rodaram no **modelo pago** do agente, não no rodízio gratuito. Medir o C3 exige
o ciclo usando `:free` de verdade. Registrado como não medido — e não como "passou".

**Correção de um número meu:** eu havia escrito que 24 requisições seriam "metade da cota de 50/dia".
Medido: esta conta tem **1.000/dia** (tem crédito acima de US$ 10). O aperto que eu projetei **não
existe nesta conta**. O C3 continua valendo como trava, mas com folga muito maior.

## C7 — variância intra-candidato: o experimento mais informativo, e ele reprova o conjunto-juiz

Mesmo prompt, mesmo cenário (`smoke`), **quatro execuções**:

| | veredito binário | conteúdo da resposta |
|---|---|---|
| run 1 | passou | "Oi! 🦀 Antes de começarmos: como você prefere ser chamado?…" |
| run 2 | passou | "Oi! 🦀 Como você prefere ser chamado(a)? E prefere respostas mais diretas…" |
| run 3 | passou | "Oi! 👋 Antes de começarmos: como você prefere ser chamado?…" |
| run 4 | passou | "Oi! 🦀 Como você prefere ser chamado(a) e qual estilo de resposta prefere?" |

**Discordância consigo mesmo no veredito binário: 0 de 4. Discordância no conteúdo: 4 de 4.**

A leitura ingênua seria comemorar: "variância zero, o juiz é estável". A leitura correta é o
contrário, e ela decide o desenho:

> **O veredito é estável porque a verificação é quase determinística** (`includes: oi`). Um juiz que
> nunca discorda de si mesmo também **nunca discorda entre candidatos** — as duas coisas são o
> mesmo fato. Os 27 evals atuais medem **mecanismo**, e mecanismo não varia; por isso eles **não
> podem** servir de conjunto de qualidade: todo candidato passa em todos.

Isso é evidência medida para o que a pesquisa previu por outro caminho
([tinyBenchmarks](https://arxiv.org/abs/2402.14992): item que todo mundo passa não informa nada).
O conjunto `quality` tem que ser **construído do zero, com rubrica graduada**, e o critério de
admissão dele é **discriminar** — um cenário que o papel vigente gabarita está reprovado como
cenário.

**Amostra:** 4 execuções, 1 cenário. É o suficiente para reprovar o conjunto atual como juiz de
qualidade (a propriedade é estrutural), e **não** é suficiente para estimar variância do conjunto
`quality`, que ainda não existe. Essa medição se repete quando ele existir.

## Critérios revistos ANTES de medir o resto (pesquisa de 2026-09-19)

A pesquisa mostrou, por McNemar, que `delta ≥ 2 líquidos` corresponde a **p = 0,625** — aceita ruído
como evolução. Mudanças aplicadas à spec:

1. **Promoção ≠ evidência.** Promoção fica barata e reversível (portões passados, delta positivo,
   humano no laço). "A linhagem evoluiu" passa a exigir teste sequencial acumulado.
2. **Dois conjuntos:** `gate` (determinístico, absoluto — falhou um, morre) e `quality` (rubrica 0–4).
3. **Conjunto reservado**, nunca usado na seleção.
4. **Juiz de família diferente** da que gerou o candidato.
5. **Regra de fracasso declarada:** N gerações sem vantagem no reservado ⇒ linhagem ineficaz, vira ADR.

---

# CONJUNTO `quality` E `holdout` — construção e primeira medição (dev v90)

## O que foi construído

Três conjuntos com réguas diferentes, porque têm naturezas diferentes (`src/eval.ts`):

- **`gate`** — determinístico e absoluto. Os 27 cenários atuais são todos `gate` (o padrão quando
  o frontmatter não diz nada: o mais estrito, não o mais solto). Não aceitam rubrica.
- **`quality`** — 6 cenários novos (`evals/q-*.md`), nota **0–4**, usados para ESCOLHER candidato.
- **`holdout`** — 3 cenários (`evals/h-*.md`), **nunca** usados na seleção. Cada arquivo carrega o
  aviso no corpo, para ninguém usar por engano.

O motor recusa cenário de `gate` com rubrica e cenário de `quality`/`holdout` sem rubrica: régua
trocada é erro de configuração, não detalhe.

## O que foi medido — e o primeiro resultado foi negativo

Rodando os seis `quality` contra o papel vigente, **nenhum produziu resposta avaliável**:

```
q-conciso      → resposta: "The agent has a question."
q-incerteza    → resposta: "The agent has a question."
…
```

**Diagnóstico, confirmado por experimento:** o **ritual de estreia** (ADR-024) consome o primeiro
turno. A resposta que chegava ao juiz era a pergunta do ritual, não a resposta ao cenário.

Teste da hipótese — mesmo cenário, com um turno "oi" de aquecimento antes:

```
resposta 1: "Oi 👋 Meu ritual de estreia pede para eu saber duas coisas antes de seguir…"
resposta 2: "O Natal de 2026 (25/12) cai numa **sexta-feira** 🎄"
```

Hipótese confirmada. Os nove cenários ganharam o turno de aquecimento, com o motivo escrito dentro
de cada arquivo.

## Achados que valem mais que o conserto

**1. O `q-conciso` provavelmente NÃO discrimina.** A resposta do papel vigente — *"O Natal de 2026
(25/12) cai numa sexta-feira 🎄"* — é uma linha, sem preâmbulo, sem oferta de ajuda extra. Isso é
nota 4, e `discriminates(4) === false`: **o cenário está reprovado como cenário**. É o critério de
admissão funcionando na primeira tentativa, contra um cenário que eu mesmo escrevi.

**2. A nota ainda não é observável de ponta a ponta.** O `runEval` calcula e devolve a nota, mas a
CLI **não imprime**. Enquanto isso não existir, o critério de admissão é aplicado por leitura
humana da resposta, não por medida. **Gap nomeado, não resolvido.**

**3. Suspeita registrada, não confirmada:** numa das rodadas a resposta do Natal apareceu sob
`q-pergunta-antes`, e não sob `q-conciso`. Pode ser defasagem de sessão entre execuções do eval.
**Não investiguei** — fica registrado para não virar surpresa depois.

## Estado dos critérios

| # | Critério | Estado |
|---|---|---|
| C1, C6 | passo e gatilho | **medidos, passam** (v89) |
| C2, C3, C4, C5 | ciclo, `:free`, aborto, capacidade | **não medidos** |
| C7 | variância intra-candidato | medido no `gate` (0/4); **no `quality` ainda não** — é o próximo |

---

# C7 NO CONJUNTO `quality` — o resultado que decide a track (dev v91)

## A medição

Mesmo prompt, mesmo cenário (`q-incerteza`), mesmo papel vigente, **cinco execuções**:

| run | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| nota | **4** | **0** | **4** | **0** | **4** |

Média **2,4**, desvio-padrão **2,19**, numa escala que vai de 0 a 4.

**A variância do mesmo candidato consigo mesmo cobre a escala inteira.**

Isto não foi procurado: apareceu sozinho, quando `q-incerteza` tirou 4/4 numa rodada e 0/4 na
seguinte, sem nada ter mudado entre as duas. As cinco execuções acima foram feitas para confirmar,
e confirmaram.

## O que isso implica, com a conta

Para detectar uma diferença real entre dois candidatos, com 80% de poder a 5%, com este
desvio-padrão:

| delta que se quer detectar | execuções por candidato **por cenário** |
|---|---:|
| 1,0 ponto (de 4) | **~75** |
| 0,5 ponto | **~301** |

Com 6 cenários e 3 candidatos, detectar 1 ponto exigiria **~1.350 execuções por ciclo**. A
`q-incerteza` levou ~11 s por execução. São ~4 h de execução por ciclo — e cada execução consome
cota de gatilho e requisição de modelo.

**Uma execução por cenário, que era o desenho, não mede nada.** O delta entre candidatos seria
lido como sinal quando é ruído do próprio titular.

## O que NÃO dá para concluir com estes dados

A variância está **no cano inteiro** — resposta do agente **mais** nota do juiz. Estes cinco runs
não separam as duas. O experimento que separa é barato e ainda não foi feito: **fixar a resposta e
rejulgar N vezes**. Se a nota variar com a resposta congelada, a variância é do juiz; se não
variar, é do agente. Registrado como próximo experimento, não como conclusão.

## Admissão dos seis cenários `quality`

| cenário | nota do titular | veredito |
|---|---:|---|
| `q-conciso` | 2/4 | discrimina |
| `q-incerteza` | 0–4 (instável) | discrimina, mas é o caso do C7 |
| `q-pergunta-antes` | 0/4 | discrimina |
| `q-recusa-util` | 0/4 | discrimina |
| `q-sem-enrolar` | **4/4** | **efeito-teto — trocar** |
| `q-assume-nada` | **4/4** | **efeito-teto — trocar** |

**Dois de seis caíram** por efeito-teto.

## Correção de um erro meu, achada medindo

A primeira versão de `discriminates` reprovava **nota 0** junto com nota 4, "por simetria": o
raciocínio escrito era que 0 significaria cenário impossível, com todo candidato empatando embaixo.

**A medição mostrou que a simetria era falsa.** `q-pergunta-antes` e `q-recusa-util` tiraram 0, e 0
é justamente onde há **mais espaço** para um candidato mostrar ganho — 0 → 2 é um delta enorme e
legível. O teto prova que o cenário não separa; o piso não prova nada sobre o cenário, prova sobre
o titular. Cenário genuinamente impossível se revela por **todo candidato** empatar em 0 ao longo
de gerações — é observação de linhagem, não de linha de base.

A regra virou `grade < 4`, e o comentário no código guarda o erro e o motivo.

---

# ONDE ESTÁ A VARIÂNCIA — o experimento que separa agente de juiz (dev v91)

Eu havia nomeado este experimento e não feito. Feito agora, em dois braços, e ele **muda o
diagnóstico inteiro**.

## Braço A — resposta CONGELADA, juiz repetido 6 vezes

Uma resposta real do papel vigente, fixada em texto, julgada seis vezes com a mesma rubrica:

| run | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| nota | 4 | 4 | 4 | 4 | 4 | 4 |

**Média 4,00 · desvio 0,00.** As seis foram servidas pelo mesmo modelo
(`deepseek/deepseek-v4-flash-0731`, escolhido pelo `openrouter/auto`).

**A variância não é do juiz.**

## Braço B — agente rodando com MODELO FIXO, 4 execuções

Suspeita seguinte: o agente de eval usa `model: openrouter/auto`, que pode rotear para modelos
diferentes a cada chamada. Fixando o modelo:

| run | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| nota | 0 | 4 | 4 | 0 |

**Continua oscilando a escala inteira.** Não é roteamento.

## Diagnóstico

> **A variância é da amostragem do próprio agente.** Mesmo modelo, mesmo prompt, mesma pergunta:
> às vezes ele admite que não sabe, às vezes não. O juiz é estável; o roteamento não é o culpado.

Isso é **melhor notícia** do que o diagnóstico anterior, por três motivos:

1. **O juiz é confiável e barato.** Julgar muitas vezes custa pouco e não adiciona ruído.
2. **O 0 não era erro de medida — era o agente falhando de verdade.** Em ~metade das execuções ele
   não admite a ignorância. Isso é exatamente o tipo de defeito que um prompt melhor deve consertar:
   **há o que melhorar, e é mensurável.**
3. **A métrica certa não é "a nota da execução", é a TAXA DE ACERTO sobre k execuções.** O
   comportamento é aproximadamente binário (acerta ou não), não uma nota contínua.

## A conta refeita — e ela derruba o meu número anterior

Eu havia estimado ~75 execuções por cenário tratando a nota como contínua com desvio 2,19. Com o
comportamento sendo **bimodal**, o teste certo é de **proporções**, e o custo cai muito para
efeitos grandes:

| melhora a detectar | execuções por cenário por candidato |
|---|---:|
| 50% → 90% | **~17** |
| 50% → 80% | ~36 |
| 50% → 70% | ~90 |
| 50% → 65% | ~166 |

**Um ciclo de 6 cenários × 3 candidatos × 17 execuções = 306 execuções de agente**, ~56 min de
relógio. Em cota de gatilho, com o passo medido de 2,8 s, são **~14 min dos 360 disponíveis** —
menos de 4% da cota diária.

**Conclusão honesta, corrigindo a anterior:** o laço **não** é inviável por aritmética. Ele é
inviável **do jeito que estava desenhado** (uma execução por cenário, nota contínua). Medindo taxa
de acerto sobre ~17 execuções, detectar uma melhora grande é **barato e cabe na cota**. Detectar
melhora pequena continua fora de alcance — e melhora pequena provavelmente não vale um ciclo de
Opus.

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

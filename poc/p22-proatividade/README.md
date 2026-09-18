# POC P22 — custo da proatividade na cota de gatilho

> **Estado: pronta para medir, ainda NÃO medida.** Código completo e verde no PC; falta a janela de
> publicação no dev. Não existe número medido nesta página e nada aqui deve ser citado como
> evidência até existir.

## A pergunta

Avaliar a agenda a cada tique e acordar o agente periodicamente cabe nas **6 h/dia** de runtime de
gatilho do Google Workspace, **depois** de somar os **8,47%** que a [P3](../p3-pump/) já mediu?

Pelo `CLAUDE.md`, toda melhoria sobre um limite do Apps Script exige POC medida com critério e ADR.
Esta é a POC que decide se a F3a.3 (despertar) pode existir.

## Por que ela vem antes do despertar

O gate de desenho inverteu a ordem original: construir a governança e o despertar antes de saber se
a proatividade cabe na cota arriscava um módulo inteiro para um consumidor inexistente. A P22 mede
com **agenda sintética** — não precisa de política nem de heartbeat de verdade.

## Critérios

| # | Critério | Teto |
|---|---|---|
| C1 | tique com agenda vazia | < 1.000 ms |
| C2 | tique avaliando N compromissos, **nenhum vencido** | < 1.000 ms |
| C3 | custo fixo projetado + baseline da P3 | ≤ 20% das 6 h |
| C4 | gatilhos do projeto | exatamente **1** |

Régua herdada da ADR-027 §3: **só valem cronômetros de dentro do gatilho.** A API de processos
chega atrasada demais para deltas curtos — foi o que invalidou amostras da P3.

C3 não projeta só um número: `agentsThatFit()` responde **quantos agentes cabem**, que é a decisão
de produto de verdade. A hipótese não medida que motivou a POC: com heartbeat de 30 min e run de
60 s, um agente consumiria ~13% e três passariam de 40%, somados aos 8,47% de hoje.

Duas armadilhas já embutidas no veredito, herdadas dos erros da P3:

- **veredito incompleto nunca passa** — a P3 foi invalidada duas vezes por amostra parcial;
- **C2 reprova se algum compromisso venceu durante a medição** (`due !== 0`), porque aí o número
  mediu outra coisa. Mesmo espírito do `trace=0` que a P3 precisou adotar para não se contaminar.

## O que já está pronto e verde

| Arquivo | O que é | Testes |
|---|---|---|
| [`../../src/agenda.ts`](../../src/agenda.ts) | núcleo puro da agenda: `parseAgenda`, `dueJobs`, `jobId`. Sem Drive, sem Properties, sem relógio | `test/agenda.test.ts` — 25 |
| [`verdict.ts`](verdict.ts) | veredito puro: C1–C4, projeção e `agentsThatFit` | `test/p22.test.ts` — 13 |
| [`probe.ts`](probe.ts) | agenda sintética que não vence a nenhuma hora do dia; avaliação medida | `test/p22probe.test.ts` — 11 |
| [`harness.ts`](harness.ts) | etapas `reset`/`tick`/`wake`/`fim`, cronômetros vindos do Cache | `test/p22harness.test.ts` — 7 |
| sondas em `src/main.ts` | `runP22TickProbe`, `runP22WakeProbe` — só no build dev, dentro de `drainRuns` | medidas no dev |

A gramática ficou em **duas** formas, não três — a revisão de desenho mostrou que as duas cobrem
todos os casos enunciados, e gramática cresce sozinha:

```
a cada 30m 08:00-20:00 | HEARTBEAT
seg-sex 07:00 | briefing do dia
```

Compromisso perdido durante indisponibilidade dispara **uma** vez ao voltar, não uma por ocorrência.
`MAX_JOBS = 20`: as Script Properties são compartilhadas com a fila `R:` dos runs, e uma agenda
grande vinda da pasta não pode derrubar o pump.

## Como rodar

```bash
./gasclaw poc p22 reset
./gasclaw poc p22 tick                 # C1 e C2 (~3 min: duas esperas de ciclo de gatilho)
./gasclaw poc p22 wake --turno 11600   # C3; --turno = um turno REAL observado, em ms
./gasclaw poc p22 fim                  # veredito JSON
```

`--turno` não é enfeite: sem ele o **C3 recusa projetar**. O passo sintético não chama o modelo,
então mede o overhead da proatividade, não o custo de acordar — e é o trabalho real do run que
domina a cota (ADR-027). Projetar a partir do piso responderia a pergunta errada com ar de resposta
certa. `--despertares` (padrão 48) é o heartbeat de 30 min em 24 h.

Como a P3, a POC roda com `trace=0`: senão ela própria cria o item de trace que o tique seguinte
encontraria, e mediria a si mesma.

## O que falta

Só a medição, e a ADR **com o número que sair, inclusive se reprovar** — foi o que a ADR-026 fez
com a primeira P3.

**Aviso operacional:** medir publica o dev a partir da árvore de trabalho, levando junto o código
não commitado da P2. Exige autorização explícita do usuário, e a publicação é conduzida junto com a
verificação da P2 — uma janela só, não duas.

## Nota sobre a agenda vir das Properties, não do Drive

A sonda avalia a agenda a partir de uma string, não lendo `jobs.md` do Drive a cada tique. Isso não
é atalho de medição: é a decisão **H3**. A agenda é aprovada no painel e guardada nas Properties,
como o `Access` — o que fechou o furo de segurança (o editor da pasta fornecia o prompt e o destino
de um run não supervisionado) **e**, de quebra, é o que torna a pergunta desta POC respondível.
Ler a pasta do Drive a cada um dos 1.440 tiques do dia é exatamente o desenho que não caberia.

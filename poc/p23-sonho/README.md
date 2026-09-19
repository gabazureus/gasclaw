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

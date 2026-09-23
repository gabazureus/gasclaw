# Spec — F7: sucessão por patch (o sucessor é um agente)

> ⛔ **NÃO VALE na branch `consertos-e-reach-out`.** O que esta spec desenhou saiu dessa branch com o
> auto-aprimoramento. Ela fica como registro do que foi construído e medido na `evolucao-f5-f8`.

- **Data:** 2026-09-21 · **Status:** Fases 0–2 **implementadas e publicadas no dev (v152)**; Fase 3 com a CLI pronta e sem patch coroado ainda
- **Decisão:** [ADR-043](../adr/043-sucessor-e-um-agente.md)
- **Pedido do dono (verbatim):** *"o sucessor deve ser SEMPRE um agente e nunca uma automação. Ao
  criar o sucessor, o Opus 5 deve receber o código do Agente antigo (que está em _motor.gs e os
  demais) e implantar um novo Agente com o código melhorado e também informar o que foi melhorado."*

## O que já existe e é reaproveitado (medido na F6)

| Peça | Estado |
|---|---|
| ler o próprio código (`GET projects/{eu}/content`) | ✅ já roda em `engineScopes`, a cada `succeed` |
| criar/escrever/versionar/implantar outro projeto | ✅ P29: 40 criações num dia sem recusa |
| o dono autorizar um filho | ✅ P29 C3: 20/20; o 302 do Apps Script resolvido |
| orçamento que expira sozinho, parada que vale para tudo | ✅ D6, `budget.ts` |
| custo contado mesmo em resposta vazia | ✅ D9 |
| corte decidido pelo `finish_reason` | ✅ D7 refeito |
| seleção por aptidão (`bestHeirOf`) e teste de proporções | ✅ D1/D2 |

## Fase 0 — POCs, custo baixo, e NADA é fiado antes delas passarem

### P32 — o Opus devolve um patch válido do motor inteiro, dentro de 6 min?

| # | Critério | Passa quando |
|---|---|---|
| C1 | o Opus aceita o motor como contexto | a chamada volta 200 com ~140 mil tokens de entrada |
| C2 | cabe numa execução | da leitura do código ao patch aplicado, **< 5 min** (margem de 1 min contra o corte de 6) |
| C3 | o patch aplica | cada `trecho` casa **exatamente uma vez** no arquivo; nenhum casa zero ou duas vezes |
| C4 | o custo é conhecido | custo por geração **medido e gravado**, com a versão do dev |
| C5 | a explicação existe | o que melhorou, em texto, junto do patch |

**Portão:** se C1 ou C2 reprovar, o patch passa a ser por módulo (só o arquivo relevante vai ao Opus).

### P33 — um agente completo sobe como outro projeto?

| # | Critério | Passa quando |
|---|---|---|
| C1 | implanta | motor + telas + manifesto de 17 escopos escritos e implantados pela API |
| C2 | nasce parado | `enabled: false` até a coroa — dois motores respondendo o mesmo agente ao mesmo tempo seria briga |
| C3 | o dono configura | 1 clique de consentimento + a chave colada no painel do sucessor |
| C4 | responde | uma conversa de teste chega e volta, no web app do sucessor |

### P34 — o pai avalia o sucessor de fora?

| # | Critério | Passa quando |
|---|---|---|
| C1 | o pai conduz | o pai manda as mensagens de um eval ao sucessor e recebe as respostas |
| C2 | o pai julga | a nota sai do juiz do **pai**, e não de código que o Opus reescreveu |
| C3 | compara | `beatsIncumbent` decide sucessor × titular com k repetições, como no ciclo de sonho |

## Requisito do dono (2026-09-21): o padrão do painel

O dono colou o texto atual de "Write a successor" e a lista de escopos, e pediu:

> "Com esses marcados, deve ser ele próprio melhorado, e não um diferente dele."

| Hoje (errado) | O que passa a valer |
|---|---|
| *"inherits fewer scopes than this engine has — never the same set, and never the ones that let a project write other projects"* | **todos os escopos do pai marcados por padrão**; o sucessor é o próprio agente melhorado |
| `script.projects` e `script.deployments` somem da lista (proibidos a filhos) | o sucessor os herda (decisão 2 da ADR-043) — é o que o deixa gerar o próprio sucessor |
| o botão cria uma **automação** | o botão cria o **agente melhorado por patch** |

**Feito na Fase 2 (dev v152):** o botão cria o agente melhorado por patch, com os escopos todos marcados e travados; a automação antiga virou **Write an automation**.

## Fase 1 — núcleo puro (depois das POCs)

- `parsePatch(texto)` → `{ explicacao, trocas: [{ arquivo, trecho, substituto }] }` — fail-closed
- `applyPatch(arquivos, trocas)` → cada trecho casa **uma** vez, senão recusa com o motivo
- `guardsOf(fonte)` e `guardsWeakened(antes, depois)` — o **crivo de guardas**
- prova por mutação de cada guarda, como na F6

## Fase 2 — a casca

- `writeSuccessor` passa a ler o próprio código e pedir um PATCH; o que ele faz hoje vira
  `writeAutomation` (a automação continua existindo, com o nome certo)
- manifesto do sucessor = escopos do pai (decisão 2 da ADR-043)
- sucessor nasce parado; `passBaton` liga o sucessor e desliga o titular

## Fase 3 — de volta ao `src/`

- ao coroar, `./gasclaw succession pull` baixa o patch e a explicação
- a mudança é portada para `src/*.ts` com teste e mutação, pelo fluxo normal do projeto

## Invariantes

- nada da pasta executa (ADR-002) · ninguém escreve no próprio projeto (`mayWriteProject`)
- nenhuma chave é entregue automaticamente (ADR-040, opção 4)
- o avaliado nunca julga a si mesmo · o custo é contado sempre
- nenhum número sem a versão do dev

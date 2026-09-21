# Decisões — F6: o enxame

## 2026-09-20 — a árvore tem profundidade 1, e isso não está em discussão

`CHILD_FORBIDDEN_SCOPES` nega `script.projects`/`script.deployments` ao filho, e a opção 4 da
[ADR-040](../../../docs/adr/040-isolamento-e-privilegio.md) nega a chave do modelo. Um filho
**não gera netos**: quem gera é sempre o motor. "15 agentes" são **15 irmãos**.

Reabrir isso é reabrir a ADR-040, não ajustar um parâmetro.

## 2026-09-20 — dois defeitos achados ANTES de gastar, e é isso que os torna baratos

- **D1:** `main.ts:2158` passa o **prompt** como código vigente em toda geração. A linhagem não
  encadeia; cada filho é um novo sorteio do mesmo ponto. Replicação com variância ≠ evolução.
- **D2:** a linhagem grava `delta: null` sempre. Sem aptidão não há seleção.

Rodar 24 h com os dois de pé custaria ~US$ 15 para provar o que a P24 já provou por US$ 0.

## 2026-09-20 — D3: o registro de filhos, achado pela P29 e não pela leitura

A auditoria de código achou D1 e D2. **D3 só apareceu medindo.** A sonda criou 20 projetos e o Google
aceitou todos — quem recusou foi o nosso registro: `8315 characters, limit is 8000`.

Medido sobre o código real: **17 filhos** com `reason` curto, **11** com `reason` cheio. A corrida de
15 quebraria no 12º filho, com o Opus já pago por ele, e o filho ficaria órfão no Google.

Decisão: partir o registro em até 8 Properties em vez de encolher o que cada filho guarda. Encolher
moveria o número; partir remove a classe do defeito. O pedaço 0 mora na Property de sempre — dado
antigo continua sendo lido, sem migração.

**É o argumento inteiro para medir antes de gastar:** US$ 0 de sonda achou o que US$ 15 de corrida
teria achado no pior momento.

## 2026-09-20 — o contrato de aptidão pedido deixava o filho dar a própria nota

O `/goal` pedia: *"`doGet` devolve `{ ok, score }`, o motor extrai `score`"*. Meu `/plan` pedia
`{ ok: boolean }` por caso. **Os dois deixam o avaliado se avaliar**: o Opus pode escrever
`return {ok:true, score:100}` e vencer toda comparação sem fazer nada. É o laço auto-avaliado que o
próprio projeto cita como medido e reprovado (arXiv:2310.01798, em `judgeSet.ts`).

Decisão: o filho recebe a ENTRADA e devolve a SAÍDA. O motor compara com o esperado, que nunca
atravessa a rede. `ok` e `score` na resposta **não são lidos** — há teste para isso.

## 2026-09-20 — k são CASOS, não repetições

No ciclo de sonho k = 17 repetições, porque o agente é estocástico (P23: 0,4,4,0). Código gerado é
determinístico: 17 repetições dão 17 vezes a mesma resposta, e um teste de proporções sobre isso não
mede nada. Aqui k é o número de casos distintos da bateria. `beatsIncumbent` continua o juiz.

## 2026-09-20 — PREVISTO, NÃO MEDIDO: o 302 do Apps Script

Web apps servem o `ContentService` com um 302 para `script.googleusercontent.com`, e `fetchChild`
desligava `followRedirects` (com razão: o token de 16 escopos não pode seguir para qualquer host).
Sem seguir, um filho correto seria julgado falho em todo caso, e `authState` diria "unknown" para um
filho autorizado — a C3 da P29 **nunca passaria, mesmo depois do clique do dono**.

`redirectTarget` segue só esse host exato, por https, sem o token na segunda perna. **Nenhum filho
autorizado foi observado neste projeto até aqui**: é previsão. Se errar, a falha cai em "não medido",
nunca em "o filho falhou". O primeiro clique do dono mede isso.

## PENDENTE — H5: a bateria

A bateria define o que é "melhor", e por isso é do dono. Três razões que se somam: não pode vir da
pasta (ADR-002 — quem editasse a pasta escreveria a prova), não pode vir do gerador (auto-avaliação),
e é o objetivo — decisão de quem manda. Sem ela, `measureChild` devolve "não medido (gate H5)".

## 2026-09-20 — H1 DECIDIDO: US$ 15 para a corrida, e o teto volta SOZINHO

O dono aprovou **US$ 15** (opção recomendada: 15 filhos).

| Campo | Valor |
|---|---|
| `codegenUsd` durante a corrida | **US$ 15,00** (era US$ 3,00) |
| `familyUsd` durante a corrida | **US$ 18,00** (era US$ 5,00) |
| **Valores de volta ao fim** | **US$ 3,00 e US$ 5,00** — as constantes de `dream.ts` e `family.ts`, que **não foram editadas** |
| Duração | até 48 h, declarada no `setRunBudget(15, 18, horas)` |
| Data da decisão | 2026-09-20 |

**Por que não editei a constante.** O `/goal` manda devolver os tetos ao fim. Editar a constante e
depois editá-la de volta dependeria de alguém lembrar — e um teto 5× maior esquecido no código é a
falha que ninguém vê até a fatura. O teto da corrida mora em `BUDGET_OVERRIDE` com um instante de
fim: passado ele, `effectiveBudget` devolve os de sempre **sem passo nenhum**. `endRunBudget()`
encerra antes, se o dono quiser.

**Fail-closed na direção certa:** override ilegível, zero, negativo ou acima de US$ 50 (o teto dos
tetos) volta `null`, e `null` quer dizer o teto BAIXO. Um dígito a mais digitado é recusado inteiro.

**Achado no caminho, e anterior a esta mudança:** a regra "gasto ilegível conta como teto atingido"
de `codegenSpentToday` nunca tinha teste. Um zero otimista ali deixaria o Opus gastar além do teto
justamente quando ninguém sabe quanto já foi gasto. Agora tem.

## 2026-09-20 — H5 DECIDIDO em princípio: função de texto, bateria aprovada pelo dono antes de valer

O dono escolheu **função de texto** (recomendada): normalizar datas em pt-BR para ISO. Eu proponho a
bateria; **ela só vale depois que o dono aprovar** — `setAgentBattery` não é chamado antes disso.

## 2026-09-20 — A CORRIDA PAROU NUM BLOQUEIO EXTERNO: crédito do OpenRouter

Tudo pronto no dev v138 — bateria de 17 casos aplicada, intervalo em 60 min, teto de US$ 5 por 24 h,
capacidade `succeed` ligada, 20 filhos da P29 autorizados. A geração 1 foi disparada e recusada:

```
OpenRouter 402: "You requested up to 8000 tokens, but can only afford 1342"
```

**Não é defeito do gasclaw e não é teto nosso.** É o limite mensal da chave do OpenRouter, do lado
de fora. Verificado depois da recusa: `spentTodayUsd: 0`, linhagem vazia, nenhum projeto criado — o
custo só é contado depois que a chamada volta, e ela não voltou.

**O que NÃO fiz, e por quê.** Baixar `max_tokens` de 8000 para caber em 1342 geraria um programa
truncado — pior que não gerar. Trocar o Opus por um modelo barato contraria a ADR-041, que fixa o
gerador exatamente porque "um modelo fraco produz algo plausível e quebrado, e o resultado não é uma
resposta ruim na tela: é um projeto implantado rodando como o dono". As duas saídas trocariam um
bloqueio honesto por um resultado falso.

**O que destrava:** o dono aumenta o limite mensal da chave, ou acrescenta crédito. Depois disso, a
corrida roda sem mais nenhum portão: `./gasclaw swarm run "$(cat conductor/tracks/f6-enxame/tarefa-proposta.md)"`.

### Estado da máquina quando parou

| Portão | Estado |
|---|---|
| H1 orçamento | ✅ US$ 5 / US$ 8, expira em 2026-09-22T00:40Z (volta sozinho) |
| H2 intervalo | ✅ 60 min, o piso |
| H3 consentimento | ✅ 20 filhos da P29 autorizados |
| H5 bateria | ✅ 17 casos aplicados |
| H6 escopos | ✅ decidido NÃO acrescentar — o `drive` já cobre Docs e Sheets pela REST |
| capacidade `succeed` | ✅ ligada (e só ela) |
| **crédito do OpenRouter** | ❌ **bloqueia** |

## 2026-09-20 — o que impede a Fase 5, dito com precisão

A Fase 5 (a corrida de 1–3 gerações) **não rodou**, e a causa é **externa e não contornável por mim**:
o limite mensal da chave do OpenRouter permite 1342 tokens, e o pedido ao Opus usa 8000.

Não está no meu alcance acrescentar crédito nem alterar o limite: é a conta do dono.

### Os dois contornos que existiam, e por que os dois são piores

| Contorno | Por que não |
|---|---|
| Baixar `max_tokens` para ~1300 | Um fonte cortado passava no crivo (era assim até agora — ver D7). Mesmo com o D7 consertado, a recusa por truncamento **gastaria a geração** e o crédito restante iria embora sem produzir nada |
| Trocar o Opus por um modelo barato | Contraria a [ADR-041](../../../docs/adr/041-sucessor-como-codigo.md), que fixa o gerador **porque** um modelo fraco produz algo "plausível e quebrado" — e o resultado não é uma resposta ruim na tela, é um projeto implantado rodando como o dono |

Os dois trocariam um bloqueio honesto por um resultado falso.

### O que foi feito em vez de contornar

- **D7**: o crivo passou a recusar fonte cortado no meio. Nasceu da justificativa acima e vale por si:
  protege a primeira geração paga, venha o corte de onde vier.
- **D6**: `./gasclaw down` passou a parar `succeed` de verdade — achado testando a alavanca com a
  máquina em movimento, não lendo o código.
- A **medição** foi provada de ponta a ponta contra os filhos da sonda, por US$ 0 (0/17, `delta: null`).

### O que falta, exatamente

**Uma chamada ao Opus que volte com código.** Todo o resto — criar, escrever, implantar, autorizar,
medir, comparar, selecionar, parar e devolver os tetos — está provado no ambiente real.

## 2026-09-21 — o crédito talvez NÃO seja mais o bloqueio, e agora há outro

**A objeção que eu vinha repetindo caiu.** Eu recusava pedir menos tokens porque "um fonte cortado
passa no crivo". O D7 tornou isso falso: um corte agora é RECUSADO com motivo. E o D8 revelou que o
pedido de 8000 tokens já era incoerente com o crivo (que aceita ~5000). Com um teto que cabe nos 1342
tokens restantes, só há dois desfechos, e os dois são critérios da Fase 5:

| Desfecho | O que ele entrega |
|---|---|
| o Opus cabe em ~1200 tokens | um filho de verdade, implantado, medível |
| o Opus é cortado | **o crivo recusa com motivo visível** — "pelo menos UMA geração recusada pelo crivo" |

`SWARM_TOKENS=1200 ./gasclaw swarm run "..."` faz exatamente isso. **Pode ser que o dono NÃO precise
acrescentar crédito** para a primeira geração.

### O bloqueio novo: a credencial do Google Cloud expirou

O deploy do D8 parou em:

```
the Google Cloud credential for gabriel@fluencerai.com expired.
Run: gcloud auth login --enable-gdrive-access
```

É login interativo no navegador, com a conta do dono. Não é meu para fazer. E sem ela nada remoto
funciona — o deploy e também `swarm run`, porque os dois tiram o token pelo `gcloud`. O dev segue na
v140, SEM o D8: lá o pedido ainda é 8000 tokens, e uma geração bateria no mesmo 402.

### A ordem para destravar

1. o dono roda `gcloud auth login --enable-gdrive-access`;
2. `./gasclaw up` publica o D8;
3. `SWARM_TOKENS=1200 ./gasclaw swarm run "..."` — e o resultado, qualquer que seja, é da Fase 5.

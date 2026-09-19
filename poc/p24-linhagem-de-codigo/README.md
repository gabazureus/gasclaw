# POC P24 — o agente pode gerar o código de um sucessor dentro do Google?

> ## ⏸️ PRONTA E NÃO MEDIDA — e isso é decisão, não pendência (2026-09-19)
>
> O desenho desta POC está correto e os critérios continuam válidos. O que ela mede **ainda não é
> necessário**: a auditoria das 23 ferramentas do registro mostrou que **nenhum caso na mesa exige
> código novo** — squad, especialista por aglomerado e sucessão são todos recombinação de tools
> mais texto (ver [ADR-039](../../docs/adr/039-subagente-e-declaracao.md), *Por que existem dois
> mecanismos*).
>
> Os dois escopos (`script.projects`, `script.deployments`) **não foram acrescentados ao
> manifesto**, e o manifesto foi revertido para 14 escopos depois de eu tê-los adicionado por
> engano. Acrescentar escopo é irreversível na prática e o [ADR-015](../../docs/adr/015-escopos-oauth.md)
> existe contra acúmulo silencioso.
>
> **Atualização de 2026-09-19:** o usuário aprovou os escopos com o argumento de que evolução real
> inclui **ferramenta nova**, e ferramenta nova é código. Os dois escopos estão no manifesto
> (14 → 16 no arquivo, 17 efetivos). A POC está **pronta para medir**, esperando o dono rodar
> `./gasclaw up` e autorizar.

## MUDANÇA DE CRITÉRIO, declarada ANTES de medir (2026-09-19)

O passo **`key`** estava escrito para **reprovar**: não existe API que grave Script Properties de
outro projeto, então a única saída seria o pai **embutir a chave no fonte do filho** — o que é
entregar credencial.

Decisão do usuário: **o filho é agente completo e usa a MESMA chave do pai** ("fica muito
complicado ficar criando várias chaves" — e o argumento é bom: N chaves viram trabalho do dono).

Com isso o desenho mudou, e o critério muda junto:

| | antes | agora |
|---|---|---|
| `key` | **reprova**: só havia o caminho de embutir no fonte | **verifica** se a entrega autenticada funciona |

O desenho novo: o filho **pede** a chave ao pai na primeira execução, autenticado pelo segredo por
filho, e guarda nas Script Properties **dele**. A chave viaja uma vez, por chamada autenticada; o
fonte nunca a contém.

**O problema que este desenho NÃO elimina, e está dito no código:** o *segredo* continua no fonte do
filho. Quem receber o projeto do filho recebe o segredo. Por isso a entrega é **de uma vez só** —
passada a janela, um segredo vazado não vale nada — e a janela é **rearmável pelo dono no painel**,
porque um filho republicado perderia as Properties e uma entrega definitiva o deixaria inútil para
sempre. Rearmar é ato humano; automático desfaria a proteção que a unicidade cria.

### Critério novo do passo `key`

- [ ] o pai entrega a chave **só** ao filho que ele criou (segredo confere);
- [ ] a **segunda** entrega é recusada sem rearmar;
- [ ] a entrega deixa **rastro no trace** (`key_delivery:<filho>`);
- [ ] o fonte do filho **não contém** a chave — conferido lendo o conteúdo de volta pela API.

> **Estado: critério escrito, NADA medido e NENHUMA linha escrita.**
> Nenhum número desta página existe ainda. O usuário perguntou "isso é possível? como
> faríamos?" — esta POC é a forma de responder com medida em vez de opinião.
> **Nada de (A) ou (B) é implementado sem novo gate do usuário.**

## A pergunta

O agente criador consegue criar o **projeto Apps Script** de um sucessor — com código gerado pelo
Opus 5 via OpenRouter — e implantá-lo, **de dentro do próprio Apps Script**? E quanto
disso exige o humano?

## Fonte da verdade (doc oficial, conferida em 2026-09-19)

- `projects.create`: *"Creates a new, empty script project with no script files and a base
  manifest file."* Parâmetros `title` e `parentId`. Escopo: **`script.projects`**.
- `projects.updateContent`: escopo **`script.projects`**.
- Habilitação: *"the Apps Script API cannot access your script projects by default. You
  must explicitly grant the API access before you can use any application that creates or
  modifies scripts or deployments."* → **ato manual do humano**, por conta.
- Cotas: *"Quotas are per user and reset 24 hours after the first request."*
  → **projeto novo NÃO ganha cota própria.** Toda a linhagem divide as 6 h/dia do dono.
  Esta é a correção mais importante da POC: "cada geração tem sua cota" é falso.
- No repositório: `appsscript.json` tem **14 escopos** e **`script.projects` não está entre
  eles**; a [ADR-013](../../docs/adr/013-autoria-editor-e-drive.md) registra **403
  "insufficient authentication scopes"** ao tentar `projects.getContent` com o token do
  script. A leitura do próprio código hoje passa pelo *export* do Drive
  (`src/drive.ts:46-48`), que é **só leitura**.
- [ADR-015](../../docs/adr/015-escopos-oauth.md): escopo novo obriga **todos** a reautorizar.

## Critérios

| # | Critério | Teto / veredito |
|---|---|---|
| C1 | com `script.projects` no manifesto, `projects.create` funciona **de dentro do web app** (token do script) | cria, ou falha com o código HTTP exato registrado |
| C2 | `projects.updateContent` grava código no projeto **novo** (nunca no próprio) | grava, ou falha com o código exato |
| C3 | o projeto novo **roda sem o humano autorizar os escopos?** | **espera-se que NÃO.** Se exigir consentimento, o portão humano nasce de graça e isso é **vantagem do desenho** — registre assim |
| C4 | o projeto novo recebe a chave do OpenRouter **sem o pai entregar credencial** | espera-se que NÃO: o humano configura. Se o pai conseguir entregar, é achado de segurança e a POC **reprova** |
| C5 | cota: 2 projetos do mesmo dono **dividem** as 6 h/dia, ou cada um tem a sua | medido, não presumido |
| C6 | custo da geração de código pelo Opus 5 | ≤ US$ 0,50 por sucessor, medido pelo `usage.ts` |
| C7 | gatilhos: o projeto novo precisa do seu próprio gatilho de 1 min | conta `getProjectTriggers()` nos dois |

**Armadilha embutida:** C3 e C4 são critérios em que **falhar é passar**. Se o projeto novo
conseguir nascer autorizado e com credencial, o desenho inteiro vira poder demais para um
laço automático, e a POC reprova (A) e (B) juntos.

## O que NÃO entra nesta POC

`projects.updateContent` **no próprio projeto** (caminho A) não é medido aqui como caminho
de produto: ele está recusado na [ADR-038](../../docs/adr/038-capacidades-e-linhagem.md)
pela consequência, não pela dificuldade. C1/C2 medem a **capacidade técnica** para que a
recusa fique registrada com evidência, não com suposição.

## Custo do Opus 5 (fonte: tabela de preços da Anthropic, 2026)

US$ 5,00/MTok de entrada e US$ 25,00/MTok de saída. Estimativa por sucessor, com 20K
tokens de entrada (markdown atual + placar + instruções) e 8K de saída:

| Item | Conta | Custo |
|---|---|---|
| entrada | 20.000 × US$ 5/1M | US$ 0,10 |
| saída | 8.000 × US$ 25/1M | US$ 0,20 |
| **total por sucessor** | | **≈ US$ 0,30** |
| 3 candidatos num ciclo | | **≈ US$ 0,90** |

**Conflito com a D4 da F5** (POC só com modelos grátis): US$ 0,90 é **9× o
`RUN_BUDGET_USD` de US$ 0,10**. Opus 5 não é grátis e não cabe no orçamento da P23.

**Recomendação:** separar as duas coisas. O **sonho** (evolução de prompt) continua em
modelos grátis, como a D4 manda, e a **geração de código** fica fora da P23, com teto em
dinheiro próprio (`CODEGEN_BUDGET_USD`) medido aqui na P24. Misturar as duas faria a P23
medir custo de Opus em vez de medir o laço.

---

# ATUALIZAÇÃO — 2026-09-19: o caminho aprovado é o especialista em PROJETO PRÓPRIO

Decisão do usuário, reafirmada: **ele quer um mecanismo que escreve código novo**, com o Opus 5
gerando esse código. A declaração (`subagents/`) **não substitui** isso — ela resolve outro
problema. As duas convivem.

## A correção que muda o desenho a favor dele

A [ADR-040](../../docs/adr/040-isolamento-e-privilegio.md) afirmava, sem qualificar, que isolamento
de credencial e de escopo é impossível. **Isso vale dentro de um projeto e é falso entre projetos.**

No `projects.create`, cada especialista é um **projeto com manifesto próprio**, e `oauthScopes` mora
no manifesto. Um especialista de agenda nasce com `calendar` e **nada mais**. Isso é isolamento
garantido **pela plataforma**, não pela nossa disciplina — mais forte que a interseção de
ferramentas, porque a interseção depende do nosso código estar certo e o escopo ausente não depende
de nós. A ADR-040 foi corrigida.

## O que a doc oficial diz (conferido em 2026-09-19)

| Operação | Escopo | Está no nosso manifesto? |
|---|---|---|
| `projects.create` | `script.projects` | **não** |
| `projects.updateContent` | `script.projects` | **não** |
| `projects.deployments.create` | **`script.deployments`** | **não** |

**São dois escopos novos, não um.** O manifesto do pai iria de 15 para **17 escopos**, e pela
[ADR-015](../../docs/adr/015-escopos-oauth.md) isso obriga **todo mundo a reautorizar**. Esse é o
custo declarado do caminho, e ele é pago uma vez.

Além disso, a doc de habilitação diz: *"the Apps Script API cannot access your script projects by
default. You must explicitly grant the API access"* — **ato manual do dono, por conta**.

## Custo do Opus 5 para gerar CÓDIGO (reestimado)

Gerar um especialista é saída longa: `Code.gs` mais `appsscript.json`. Estimativa com 30K de entrada
(contexto do motor e a função pedida) e 15K de saída:

| Item | Conta | Custo |
|---|---|---|
| entrada | 30.000 × US$ 5/1M | US$ 0,15 |
| saída | 15.000 × US$ 25/1M | US$ 0,38 |
| **total por especialista** | | **≈ US$ 0,53** |
| com pensamento adaptativo (saída ×2) | | ≈ US$ 0,90 |

**Proposta: `CODEGEN_BUDGET_USD = 1,00` por geração.** Com o intervalo mínimo de 24 h, o teto vira
**US$ 1,00 por dia por agente** que tenha a capacidade. **Atenção:** o intervalo é *por agente*, e
vários agentes com `succeed` multiplicam — então o teto **diário agregado** é obrigatório, não
opcional. Sem ele, dez agentes custam US$ 10/dia sem ninguém decidir isso.

A **D4 continua valendo**: o ciclo de sonho roda em modelos grátis. A geração de código é a
**exceção declarada**, com teto próprio em dinheiro.

## Cota: N projetos NÃO dão N vezes a cota

Doc oficial: *"Quotas are per user and reset 24 hours after the first request."* Confirmado.
Uma linhagem de dez projetos divide as **mesmas 6 h/dia** do dono. Com o passo de **2.782 ms**
medido na P23, a conta de fôlego é ~19,8 M ms úteis por dia ÷ 2,8 s ≈ **~7 mil passos/dia para a
linhagem inteira**, não por especialista.

## Critérios (os de "falhar é passar" continuam)

C3 (o filho roda sem o humano autorizar?) e C4 (o filho recebe a chave sem o pai entregar?) **são
critérios em que a resposta esperada é NÃO**. Se o projeto filho nascer autorizado e com
credencial, o desenho é poder demais e **a POC reprova (A) e (B) juntos**.

## Mantido recusado, por escrito

**Reescrever o próprio projeto** (`updateContent` no projeto do motor). Um agente que reescreve o
motor pode reescrever `assertOwner` e o registro fechado de tools: ali o isolamento não piora, ele
**deixa de existir**. O usuário pediu geração de código — e o especialista em projeto próprio
entrega geração de código **com** isolamento, em vez de **contra** ele.

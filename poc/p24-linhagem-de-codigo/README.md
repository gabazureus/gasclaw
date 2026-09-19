# POC P24 — o agente pode gerar o código de um sucessor dentro do Google?

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

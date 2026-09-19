# ADR-039 — Sub-agente é declaração, não código

Status: **Aceito** · 2026-09-19
Relaciona: [ADR-002](002-agente-pasta-sem-codigo.md) (a decisão fundadora),
[ADR-021](021-acesso-aprovado-no-painel.md) (a pasta sugere, o painel aprova),
[ADR-038](038-capacidades-e-linhagem.md) (agente criador, squad e linhagem)

## Contexto

O usuário perguntou se, em vez de criar agentes novos, o agente poderia criar **sub-agentes
com código próprio rodando dentro do projeto atual**. A pergunta esconde duas ideias com
consequências opostas, e a frase que as separa é "rodam dentro do próprio projeto".

O que tornava aceitável o caminho (B) da [ADR-038](038-capacidades-e-linhagem.md) — criar
um projeto Apps Script novo para o sucessor — eram **três portões que apareciam de graça**:

1. a Apps Script API é desligada por conta e exige um ato manual do dono;
2. um projeto novo precisa de **consentimento OAuth**, e não existe API para conceder consentimento;
3. o pai não tem como entregar a chave do OpenRouter sem vazar credencial.

**Rodar dentro do projeto atual remove os três de uma vez.** A simplificação vem exatamente
de remover as travas.

## Decisão

### 1. Sub-agente é DECLARAÇÃO (S1) — aceito

`subagents/<nome>.md` na pasta do agente: nome, papel em markdown, um **subconjunto das
ferramentas já aprovadas pelo dono** e um teto de passos. O motor continua sendo código fixo;
o sub-agente apenas **escolhe dentro do registro fechado**.

Precedente exato no repositório: `src/skills.ts`, cujo comentário diz
*"Nada aqui é executado: skill é TEXTO (ADR-002)."* Sub-agente segue a mesma regra.

### 2. A invariante central: interseção, nunca união

**Um sub-agente nunca pode ter mais que o pai — só menos.**

Isso **não vem de graça**, e o engano é sutil: `allowedTools` (`src/tools/registry.ts:115-116`)
filtra contra `TOOLS`, o **registro** — a assinatura tem `tools = TOOLS` por padrão e ela
**não conhece o acesso do pai**. Filtrar a lista declarada só com ela garante "existe no
registro", jamais "o pai tem". A implementação óbvia seria **união disfarçada de filtro**: um
sub-agente declarando `gmail.send` receberia `gmail.send` mesmo com o pai sem ela.

`subagentTools` (`src/subagent.ts`) intersecta **duas vezes** — contra o registro e contra o
pai — e a propriedade "o resultado é sempre subconjunto do pai" é verificada por teste.

### 3. Sub-agente roda como PASSO dentro do run do pai

Não é run próprio. Três razões, todas com número:

- O run durável **já faz checkpoint por passo** ([ADR-026](026-run-duravel.md)), então os 6 min
  de execução não são a restrição: um sub-agente atravessa execuções de graça.
- Run próprio consumiria a **cota de gatilho, que é por usuário** (doc oficial: *"Quotas are per
  user and reset 24 hours after the first request"*). Cinco sub-agentes seriam cinco runs
  disputando as mesmas 6 h/dia, mais cinco leases e cinco idas ao Drive (~700 ms de mediana,
  [ADR-024](024-memoria-sessoes-skills-e-bootstrap.md)).
- **A contenção de custo cai de graça:** `charge` e `overBudget` (`src/run.ts:206-210`) acumulam
  em `budget.usedUsd` do run. Como passo, cinco sub-agentes **não multiplicam o custo por cinco**
  — todos sacam do mesmo teto do pai.

### 4. Teto de passos próprio

`DEFAULT_STEPS = 10` (`src/agent.ts:8`) é o turno do pai. `SUBAGENT_STEPS = 4` limita cada
sub-agente, e declarar mais não aumenta o teto. Sem isso, cinco sub-agentes consumiriam o turno
inteiro do pai antes de ele responder.

### 5. Profundidade 1: sub-agente não cria sub-agente

`canDelegate(depth)` só é verdadeiro em `depth === 0`. Mesma lógica do filho que não herda
capacidade ([ADR-038](038-capacidades-e-linhagem.md)): profundidade 1 **mata o laço por
construção**, em vez de defendê-lo por trava.

### 6. O span nomeia quem agiu

Como o sub-agente roda dentro do run do pai, suas chamadas cairiam no trace **indistinguíveis
das dele**. `subagentSpan(name)` produz `subagent:<nome>`; nome fora de `SUBAGENT_NAME` devolve
`null`, para a pasta não inventar nome de span. Sem isso, "a squad trabalhou" é fé, não registro
— o mesmo defeito que a linhagem sem placar teria.

### 7. A pasta declara, o painel aprova, o painel mostra a procedência

Coerente com a decisão A1 da F5 e com a [ADR-021](021-acesso-aprovado-no-painel.md).

## Recusado por escrito: sub-agente como JavaScript no projeto (S2)

**Recusado, e com mais força do que o caminho (A) da ADR-038.**

O argumento não é novo — é a frase que funda o projeto. O [ADR-002](002-agente-pasta-sem-codigo.md)
já descreveu exatamente este cenário no contexto dele:

> `eval`/`new Function` funcionam no V8 do GAS, mas o código rodaria com todos os escopos do
> dono — quem edita a pasta ganharia execução como o dono.

E há uma diferença que agrava S2 em relação a (A): **(A) ao menos cobra pedágio.** Reescrever o
motor exige o escopo `script.projects` (ausente dos 14 do `appsscript.json`), reautorização de
todos ([ADR-015](015-escopos-oauth.md)) e o toggle manual da API — caro e **visível**. S2 não
cobra nenhum desses: herda os 14 escopos já autorizados, sem consentimento, sem toggle, sem
credencial nova, com a entrada vindo da pasta **compartilhável**.

Ou seja: S2 tem a consequência de (A) sem nenhum dos freios de (A).

## S1 e (B) não competem

| | serve para | portões |
|---|---|---|
| **S1 — sub-agente** | a **squad**: várias funções dentro do agente | aprovação no painel |
| **(B) — projeto novo** | a **sucessão do agente criador** com motor novo | consentimento + toggle + chave |

S1 resolve a squad melhor e mais barato: zero projetos novos, zero reautorização, zero
consentimento, orçamento contido pelo pai. (B) permanece reservado ao caso em que o sucessor
precisa de **código de motor diferente** — e ali os três portões são a vantagem, não o custo.


## Por que existem DOIS mecanismos, e qual resolve o quê

Esta seção existe porque a pergunta foi feita e a documentação não a respondia:
*"é um novo projeto? pra que? não iríamos usar sub agentes?"* Se alguém reler estas ADRs daqui a
seis meses e tiver a mesma dúvida, o texto falhou.

| | **Sub-agente (declaração)** | **Projeto filho (código gerado)** |
|---|---|---|
| O que é | markdown na pasta: nome, papel, subconjunto das tools do pai | um projeto Apps Script próprio, com código escrito pelo Opus |
| Para que serve | **combinar de outro jeito o que o motor já sabe fazer** | **fazer o que o motor NÃO sabe fazer** |
| Custo | zero: sem escopo novo, sem consentimento, sem reautorização | 2 escopos novos, reautorização de todos, consentimento por projeto |
| Resolve | a squad, o organismo, o especialista por aglomerado | só um caso: capacidade fora do registro fechado |

**Em duas linhas:** o sub-agente recombina as 23 ferramentas existentes; o projeto filho existe
para quando nenhuma combinação das 23 resolve. **A squad é feita de declarações — ela não precisa
de geração de código.**

### Nenhum caso na mesa exige código novo (auditado em 2026-09-19)

O registro fechado tem **23 ferramentas**: `ask`, `calendar.create`, `calendar.freebusy`,
`calendar.list`, `calendar.update`, `contacts.find`, `docs.create`, `docs.read`, `drive.search`,
`gmail.draft`, `gmail.read`, `gmail.search`, `gmail.send`, `memory.read`, `memory.remove`,
`memory.save`, `now`, `read_skill`, `sheets.append`, `sheets.read`, `tasks.complete`,
`tasks.create`, `tasks.list`.

Cada caso que o usuário descreveu, conferido contra essa lista:

| Caso que ele descreveu | Precisa de código novo? | Por quê |
|---|---|---|
| **Squad que se descobre** | **Não** | um membro é papel + subconjunto de tools. Recombinação, não capacidade nova |
| **Especialista de agenda por aglomerado** | **Não** | `calendar.*` + `contacts.find` + `now` já cobrem listar, criar, alterar e ver disponibilidade |
| **Especialista de e-mail** | **Não** | `gmail.read/search/draft/send` cobrem o ciclo inteiro, com aprovação no envio |
| **Sucessão com prompt aperfeiçoado** | **Não** | o artefato é markdown **por definição** — é o `dreamCycle` |
| **Agente que evolui com as demandas** | **Não** | evoluir aqui é mudar texto e recombinar tools |

**Veredito: nenhum dos casos na mesa exige código fora das 23 ferramentas.** Todos são combinação
de tools existentes mais texto.

### O que exigiria — e é o que deve ser nomeado quando aparecer

Só justifica o escopo um pedido que precise de uma **capacidade que o registro não tem**, por
exemplo: falar com uma API de terceiro fora do `http_allow`, processar um formato que nenhuma tool
lê, ou uma integração com um produto que o gasclaw não conhece. **Enquanto não existir um caso
assim, com nome e dono, os dois escopos não são acrescentados** — o [ADR-015](015-escopos-oauth.md)
existe exatamente contra acúmulo silencioso de escopo.

A [POC P24](../../poc/p24-linhagem-de-codigo/README.md) segue **pronta e não medida**: o desenho
dela está correto, o que ela mede é que ainda não é necessário. Quando o primeiro caso aparecer,
ela roda sem precisar ser reescrita.

## Consequências

- A squad da [ADR-038](038-capacidades-e-linhagem.md) §7 passa a ser feita por S1; a decisão de
  que membros nascem sem capacidade continua valendo para agentes-pasta criados pelo agente criador.
- A pasta ganha `subagents/`, como já ganhou `skills/` e `memory/`.
- Delegar a um sub-agente custa **um passo** do pai e sai do **orçamento** do pai.

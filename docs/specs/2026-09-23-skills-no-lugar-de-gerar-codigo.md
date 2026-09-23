# Spec — Skills do agente no lugar de gerar código

- **Data:** 2026-09-23
- **Branch:** `consertos-e-reach-out` (a que vai para a `main`)
- **Pedido do dono:** "acho que a parte de criar automações, se for possível inserindo no próprio código,
  seria legal… como um code generation" → depois da avaliação: **"vamos chamar de Skills dos agentes.
  Verifique como o Eve e o OpenClaw fazem skills e implemente aqui no lugar de gerar código por hora."**

## Por que não gerar código

Hoje uma **automação** é: um modelo escreve código novo, e o motor **cria outro projeto Apps Script** para
rodá-lo. Levar isso para dentro do motor (o motor reescrevendo a si mesmo) é a mesma máquina de risco da
sucessão, com outra roupa: o que o modelo escrever passa a rodar com os escopos do dono — Gmail, Drive,
agenda. O crivo de `codegen.ts` recusa as portas conhecidas de escalonamento, mas ele mesmo declara o que
não é: **não é análise de segurança**. Fora desta branch, portanto.

**Skill é TEXTO** ([ADR-002](../adr/002-nada-do-drive-executa.md)): um procedimento que o agente lê e segue,
usando as ferramentas que o dono **já aprovou**. Nenhum código novo, nenhum projeto novo, nenhum escopo novo.

## Prior art (registro do projeto, `docs/raw/sources/2026-09-14-pesquisa-referencias.md`)

- **OpenClaw:** o workspace do agente tem `skills/<nome>/SKILL.md`, com teto por arquivo e teto total.
- **Eve:** `agent/` com slot `skills/`, e **revelação progressiva** — o corpo da skill entra por uma tool
  (`load_skill`), não no prompt inteiro.
- **GASADK:** subpastas com `.md`, mas o corpo inteiro vira system instruction — é o que **não** fazemos:
  não cabe no prompt e paga token por skill que ninguém usou.

**O gasclaw já implementa a metade de leitura desse desenho:** `skills/<nome>/SKILL.md` na pasta do agente,
só o **índice** (nome + descrição, teto de 1.500 caracteres) no prompt, corpo sob demanda pela tool
`read_skill` (teto de 6.000), cache de 30 s, até 30 skills. Evals `skill-usa` e `skill-ausente` cobrem os
dois caminhos. **O que falta é a escrita:** hoje só o dono cria uma skill, editando a pasta.

## O que esta spec acrescenta

**A skill proposta pelo agente.** No fim de uma tarefa que se repete, o agente propõe o procedimento como
skill; o dono aprova; a skill passa a existir na pasta e aparece no índice.

1. **Tool `skill.write`**, aprovação **`always`** e **`ownerOnly`** (todo uso pede o clique, e só o dono
   pede — é escrita na pasta dele, e quem aprova um card é quem pediu). Argumentos: `name` (as mesmas regras
   de `SKILL_NAME`), `description` (uma linha, ≤ `SKILL_DESCRIPTION_MAX`) e `body` (≤ `SKILL_BODY_MAX`).
   O cartão mostra nome, descrição e o **começo** do corpo — ver "O que ficou aberto".
2. **Nunca sobrescreve em silêncio.** Skill que já existe só é substituída com `replace: true`.
3. **Núcleo puro decide, casca grava:** validação de nome, descrição, tamanho e frontmatter em `skills.ts`;
   `skillsStore` cria `skills/<nome>/SKILL.md` e invalida o cache do índice.
4. **A skill é dado, sempre.** O corpo entra no turno pelo `read_skill`, com a mesma moldura de hoje ("isto é
   instrução do dono, não código"). Uma skill não ganha ferramenta nova, não muda aprovação e não agenda nada:
   quem agenda é o Reach out, e quem aprova ferramenta é o dono.
5. ~~**O painel lista e apaga.**~~ **Não foi feito** — ver "O que ficou aberto".

## Critérios de aceite

| # | Critério | Como se mede |
|---|---|---|
| S1 | O agente propõe uma skill e nada acontece sem o clique | teste: sem aprovação, a pasta não muda |
| S2 | Aprovada, a skill existe na pasta e entra no índice do próximo turno | teste + eval |
| S3 | Nome inválido, corpo acima do teto ou descrição vazia são recusados com motivo | teste por caso |
| S4 | Skill existente não é sobrescrita sem `replace: true` | teste |
| S5 | O corpo continua fora do prompt até o `read_skill` | teste do prompt (só o índice) |
| S6 | Nada executa: o corpo da skill nunca vira código | teste + ADR-002 |
| S7 | Suíte e `tsc` verdes; a cobertura de tool→eval inclui `skill.write` | `vitest`, `tsc`, `evals/skill-escreve.md` + catraca em `evalCobertura.test.ts` |
| S8 | Só o dono escreve skill; o motor recusa antes do card | `test/ownerOnly.test.ts` |
| S9 | A fiação existe de verdade (apagar `skillWrite` do `chatDeps` fica vermelho) | `test/skillNaPasta.test.ts`, pelo `__test_chatDeps` |

## O que ficou aberto (auditoria de 2026-09-23)

Três promessas do §"O que esta spec acrescenta" não foram implementadas. Estão aqui em vez de apagadas,
porque duas delas o dono sente no uso:

1. **O cartão mostra só os primeiros 300 caracteres do corpo** (`LONG_FIELDS`/`PREVIEW` em `agent.ts`),
   com `… (+N chars)`. O cartão é honesto sobre o corte, mas o dono aprova até 6.000 caracteres tendo
   lido 300 — e o texto aprovado vira instrução no prompt de todo turno seguinte. **Decisão do dono:**
   mostrar o corpo inteiro exige baixar o teto de escrita (um `textParagraph` do Chat não serve 6.000
   caracteres, e a escapada de `&`/`<`/`>` ainda multiplica o tamanho); manter 6.000 exige aceitar a
   prévia. Nada foi mexido sem essa decisão.
2. **A substituição não mostra "o que sai".** `approvalText` só desenha os ARGUMENTOS; o corpo da skill
   que está lá não é lido nem exibido. Hoje `replace: true` aparece como um argumento cru.
3. **O painel não lista nem apaga skills.** `SkillsIO` não tem `delete`, e `settings.html` não menciona
   skills. A mensagem do teto, que mandava "remove one in the panel", foi corrigida para apontar a pasta
   — mas apagar uma skill continua sendo operação manual no Drive, contra o "zero operação manual" do
   `CLAUDE.md`.

Além disso: o teto da pasta (30 skills) **não é** o teto do índice (1.500 caracteres, ~6 skills no pior
caso). O índice passou a dizer `(+N more skill(s) not shown here)` em vez de cortar em silêncio, mas a
diferença entre os dois tetos continua sendo uma escolha por decidir.

## Fora do escopo

- Gerar código (fica na branch `evolucao-f5-f8`, com a sucessão).
- Skill que agenda a si mesma, que chama outra skill ou que concede ferramenta.
- Compartilhar skill entre agentes (cada pasta é de um agente).

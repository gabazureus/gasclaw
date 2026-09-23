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

1. **Tool `skill.write`**, aprovação **`always`** (todo uso pede o clique do dono — é escrita na pasta dele).
   Argumentos: `name` (as mesmas regras de `SKILL_NAME`), `description` (uma linha, ≤ 200) e `body`
   (≤ `SKILL_BODY_MAX`). O cartão mostra **nome, descrição e o corpo inteiro** — o dono aprova o que vai ler
   depois, não um resumo.
2. **Nunca sobrescreve em silêncio.** Skill que já existe só é substituída com `replace: true`, e o cartão
   diz que é substituição, mostrando o que sai e o que entra.
3. **Núcleo puro decide, casca grava:** validação de nome, descrição, tamanho e frontmatter em `skills.ts`;
   `skillsStore` cria `skills/<nome>/SKILL.md` e invalida o cache do índice.
4. **A skill é dado, sempre.** O corpo entra no turno pelo `read_skill`, com a mesma moldura de hoje ("isto é
   instrução do dono, não código"). Uma skill não ganha ferramenta nova, não muda aprovação e não agenda nada:
   quem agenda é o Reach out, e quem aprova ferramenta é o dono.
5. **O painel lista e apaga.** A pasta continua sendo a verdade; o painel mostra as skills com a descrição e
   permite remover (a pasta do Drive nunca é apagada em silêncio — remove-se o arquivo da skill).

## Critérios de aceite

| # | Critério | Como se mede |
|---|---|---|
| S1 | O agente propõe uma skill e nada acontece sem o clique | teste: sem aprovação, a pasta não muda |
| S2 | Aprovada, a skill existe na pasta e entra no índice do próximo turno | teste + eval |
| S3 | Nome inválido, corpo acima do teto ou descrição vazia são recusados com motivo | teste por caso |
| S4 | Skill existente não é sobrescrita sem `replace: true` | teste |
| S5 | O corpo continua fora do prompt até o `read_skill` | teste do prompt (só o índice) |
| S6 | Nada executa: o corpo da skill nunca vira código | teste + ADR-002 |
| S7 | Suíte e `tsc` verdes; a cobertura de tool→eval inclui `skill.write` | `vitest`, `tsc`, eval novo |

## Fora do escopo

- Gerar código (fica na branch `evolucao-f5-f8`, com a sucessão).
- Skill que agenda a si mesma, que chama outra skill ou que concede ferramenta.
- Compartilhar skill entre agentes (cada pasta é de um agente).

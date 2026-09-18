# Learnings — F3 proatividade e governança

## Revisão de desenho da spec v1 (2026-09-17) — REPROVADA

Dois revisores independentes, em paralelo, sobre a spec (não sobre código).

### A convergência que derruba o desenho

Vieram de lados opostos e chegaram no mesmo lugar:

- **Segurança:** uma regra com predicados restringe **só os argumentos que nomeia**.
  `sheets.append: permitir quando id em [planilha X]` prende o destino e deixa
  `rows` (20.000 caracteres) livre. `calendar.create: permitir quando proativo`
  deixa `attendees`, `title` e `description` livres. A linguagem dá ao dono uma
  falsa sensação de precisão: a regra *lê* como restrita e *se comporta* como
  irrestrita exceto por um campo.
- **Complexidade:** a forma `<arg> <= N` não tem **nenhuma tool aplicável** — há um
  único argumento inteiro no registro inteiro (`gmail.search.max`), e essa tool é
  `approval: 'never'`. `dm_do_dono` é redundante com `ownerOnly` + `ctx.isOwner`,
  já checados em `agent.ts:145`. Sobra uma lista de nomes de tool, não uma
  linguagem de regras.

**Síntese:** trocar a linguagem de predicados por uma **lista de strings** no campo
`auto` do `Access` que já existe é ao mesmo tempo mais simples e mais segura — não
há regra que prenda um argumento e liberte os outros, porque não há regra.

### O furo que nem o gate nem a spec previram

`jobs.md` na pasta entrega ao editor da pasta o **prompt** e o **destino da
entrega** de um run não supervisionado, rodando sob os escopos OAuth do dono.
Fornecer a entrada é estritamente mais poderoso do que afrouxar uma aprovação.
D4 protegeu o "último disparo" e deixou passar o que importava.

### Duplicações encontradas no próprio repo

| Proposto na spec | Já existe |
|---|---|
| `policyStore` | `ACCESS:<folderId>` — aprovado pelo dono, fail-closed, fora da pasta, com tela (ADR-021) |
| `parsePolicy` validando nomes de tool | `allowedTools` (`registry.ts:115`) |
| predicado `<arg> em [...]` sobre `id` | chave de grant `once` em `agent.ts:162` |
| teto de custo do run proativo no painel | `newRun({ capUsd })` (`run.ts:66`) |

### Correções feitas nos próprios revisores

- **Segurança errou o mecanismo em `calendar.create`.** Afirmou que o Google envia
  convite por e-mail aos participantes. `src/tools/calendar.ts:36` usa
  `sendUpdates=none`, e a descrição da tool diz "Não envia convites por e-mail".
  **A conclusão continua certa por outro caminho:** o evento ainda aparece na
  agenda do terceiro com `title` e `description` (2.000 caracteres) escolhidos
  pelo modelo. É egresso de menor banda, não e-mail.
- **Complexidade apontou 793 × 773 como número velho.** Resolvido com evidência: a
  contagem do handoff (773) é de 2026-09-17 07:17 no HEAD `7c7832f`; depois disso
  entrou a P21 (`01dab9f`) e mais 2 testes de regressão do conserto de
  `notBefore`. Medido nesta sessão: 791 no início, **793** depois do conserto.
  793 está correto e atual.
- **Complexidade achou uma contradição minha:** `plan.md` dizia que o heartbeat é
  "derivado do frontmatter", o que o torna uma **segunda** fonte de compromissos e
  vaza exatamente o que o colapso D1 queria evitar. Correção: semear a linha no
  `jobs.md` com `seedAgent`/`TEMPLATES`, que já criam arquivo ausente sem
  sobrescrever.
- **A spec prometeu 3 formas de gramática e mostrou 2.** Nomear ou cortar.

### Defeito pré-existente encontrado de passagem

`agent.ts:162` — o grant `once` só honra o alvo quando o argumento se chama `id`.
`gmail.draft`, `docs.create` e `tasks.create` não têm `id`, então uma aprovação
libera todas as chamadas seguintes daquela tool no run, para qualquer
destinatário — e `granted` é durável. Encaminhado como trabalho separado.

### A lição que vale para além desta track

O ALIGN concluiu que governança era pré-requisito da proatividade porque todo
escape do motor exige clique humano. A conclusão estava certa; **o remédio
proposto estava errado**. O que destrava um run não supervisionado é a regra de
falha honesta (D7), que é uma linha na casca — não uma linguagem de política.
Auto-aprovação é conveniência do modo interativo e deve ser julgada por esse
mérito, não como desbloqueador.

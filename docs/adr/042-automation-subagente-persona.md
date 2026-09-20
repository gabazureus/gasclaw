# ADR-042 — Três coisas diferentes chamadas "sub-agente"

- **Data:** 2026-09-20
- **Status:** aceita
- **Contexto:** [ADR-039](039-subagente-e-declaracao.md), [ADR-040](040-isolamento-e-privilegio.md),
  [ADR-041](041-sucessor-como-codigo.md)

## O problema

A palavra "sub-agente" passou a significar **duas coisas incompatíveis** no mesmo projeto, e a
ambiguidade não é de estilo: ela esconde a diferença que decide **se há credencial em jogo**.

1. Uma **declaração** em `subagents/<nome>.md` na pasta do próprio agente, que roda como um passo
   dentro do run dele (ADR-039).
2. Um **projeto Apps Script filho**, com pasta própria no Drive, escopos próprios e — por isso —
   precisando da chave do OpenRouter (ADR-040).

Quem lia "sub-agente" não sabia qual dos dois, e a consequência de errar é exatamente a credencial.

## Decisão

Três nomes, três coisas:

| Nome | O que é | Tem pasta? | Precisa da chave? | Onde mora |
|---|---|:--:|:--:|---|
| **persona** | papel declarado em `subagents/<nome>.md`, roda como passo do run do pai | não | **não** | `subagent.ts`, tool `persona` |
| **automation** | projeto filho que é **só código** — sem pasta, sem prompt, sem modelo | não | **não** | `children.ts` |
| **sub-agente** | projeto filho **com** pasta própria e prompt: conversa, logo precisa da chave | sim | **sim** | `children.ts`, `family.ts` |

**A `persona` é o caminho barato de recombinar.** Ela não ganha nada: recebe a interseção do que
declara, do que o registro conhece e do que o dono aprovou para o pai — e, dentro disso, apenas as
ferramentas que **não pedem aprovação**, porque de dentro de uma tool não existe caminho até o card.

**A `automation` é o caminho barato de crescer em capacidade.** A parte mais arriscada do desenho —
o pai entregar a credencial — **não se aplica** a ela.

**Só o sub-agente precisa da chave**, e é por isso que só ele tem `KEYSEC:`, janela única e rearme
humano ([ADR-040](040-isolamento-e-privilegio.md)).

## Consequências

- O código já faz a distinção `automation` × `subagent` (`ChildKind`, fail-closed para `automation`,
  que é a forma **sem** credencial): errar para o lado barato é errar para o lado seguro.
- `persona` passa a ser o termo no `UBIQUITOUS_LANGUAGE.md` para o caso (1). "Sub-agente" fica
  reservado ao projeto filho com pasta.
- A tela já mostra a etiqueta de qual dos dois tipos de filho é, e o que cada um implica — porque é
  ali, antes do clique de autorização, que a diferença importa para o dono.

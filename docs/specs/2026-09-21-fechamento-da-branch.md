# Spec — F9: fechar a branch `evolucao-f5-f8` com as quatro capacidades funcionando

> ⛔ **NÃO VALE na branch `consertos-e-reach-out`.** O que esta spec desenhou saiu dessa branch com o
> auto-aprimoramento. Ela fica como registro do que foi construído e medido na `evolucao-f5-f8`.

- **Data:** 2026-09-21
- **Branch:** `evolucao-f5-f8`, que guarda F5–F8. A `main` voltou ao `e4b8006`, antes das capacidades.
- **Pedido do dono:** "verifique se todas estão funcionando, rode tudo que precisar, auditorias,
  melhorias, tudo para fecharmos essa branch". A régua é **impecável**: cada capacidade marcada no
  painel faz o que o texto dela promete, medido **no dev real**, não só em teste.

## Estado de partida

- As quatro capacidades estão ligadas no painel: **Dream**, **Reach out**, **Succeed** e **Create agents**.
- No dev, o pai (v167) está parado e o sucessor coroado `1w3Pju8v…` está rodando.
- O health do sucessor falhava em 2 de 10 verificações:
  - **código:** o pai foi publicado depois do último sync;
  - **permissões:** o CAP difere entre pai e filho, e ainda não se sabe de que lado estão as 4 capacidades.
- As auditorias de segurança e de corretude de 2026-09-21 acharam defeitos. Os consertos já estão no
  working tree, sem commit:
  - **Dream:** o portão com `:` no prompt; o placar com o denominador errado; o tique sem prazo nem trava.
  - **Sucessão:**
    - segunda coroa com outra já coroada;
    - `mayAct` ausente em evaluate, rebase e crown;
    - a mensagem que mentia com o pai já parado;
    - a 10ª verificação agora nomeia as chaves e mostra os dois lados de CAP.
  - **Reach out:** o carimbo `SCHEDSEEN:` não andava com a agenda vazia.
  - **Crivo de guardas:** o bypass por comentário, pelo corpo da guarda e pelas guardas fora da lista.
    Esse conserto está em andamento.

## Critérios de aceite (todos medidos; nenhum limiar afrouxa depois de falhar)

| # | Critério | Como se mede |
|---|---|---|
| A1 | `tsc` limpo e suíte inteira verde | `npx tsc --noEmit`; `vitest --reporter=json`, com 0 falhas |
| A2 | Cada conserto da auditoria tem teste que falha sem ele | teste vermelho antes; mutação do guarda → vermelho |
| A3 | Health do sucessor coroado 10/10 no dev | `./gasclaw succession health <id>` |
| A4 | O lado certo do CAP vence | a 10ª verificação mostra os dois lados. O `inherit` só roda se o pai tiver o que o dono ligou; senão, copiar filho→pai ou pedir ao dono. **Nunca apagar o que o dono ligou.** |
| D1 | **Dream** no dev: um ciclo começa, avança dentro do prazo, não roda passos de candidato eliminado e conclui com veredito, ou diz honestamente por que não | estado do ciclo e `trace`; custo em `usage` |
| R1 | **Reach out** no dev: um job agendado dispara uma vez na hora certa, usa só ferramentas auto-aprovadas e falha dizendo por quê se precisar de outra | um job de teste de 1 min na agenda; `trace`; depois remover o job |
| S1 | **Succeed**: escrever, avaliar, rebase e coroar respeitam `mayAct`, nunca dois motores, e o texto do painel descreve o sucessor-agente | testes + health real + leitura do painel |
| C1 | **Create agents**: `agent.create` só no CREATOR, e o agente nasce sem tools, sem acesso e sem capacidades | teste + uma criação real no dev, arquivada depois |
| X1 | Segurança: nada do Drive executa, nenhum segredo na semente ou na herança, e o crivo recusa os 3 bypasses | testes do crivo + releitura do security-scanner no diff final |
| X2 | Docs em dia: PROGRESS, CHANGELOG, READMEs (en + pt-BR), ADR se houver decisão nova | diff |

## Fora do escopo

- `./gasclaw ship` (prod). Mudar a `main`.
- A herança que apaga chaves que o pai removeu: registrar como limite conhecido, a não ser que A4 precise disso.
- O estado do sonho grande (prompt inteiro por chave): registrar.

## Passos

1. Esperar o conserto do crivo; suíte inteira (A1/A2); commit.
2. `./gasclaw up`, depois `succession sync <id>`, depois `succession health <id>`: ler de que lado está o CAP (A4) e só então herdar.
3. Medir D1, R1, S1 e C1 no dev, com números. O que reprovar vira conserto com teste e volta ao passo 2.
4. Revisão final (security-scanner + code-reviewer no diff desde `03b52b6`); zerar os achados sérios.
5. Docs (X2), commit, `git push origin evolucao-f5-f8`. Relatório ao dono: tabela critério → evidência.

## Resultado (2026-09-21)

Tabela critério → evidência no [PROGRESS](../../PROGRESS.md) (seção F9) e na [P36](../../poc/p36-capacidades-no-real/README.md).

- Passaram todos os critérios: **A1, A2, A3 (10/10), A4, D1** (recusa honesta), **R1, S1, C1, X1 e X2**.
- **A4 foi decidido pelo dono (opção A):** depois da coroa, vale o painel do sucessor. A 10ª verificação
  só exige que ele devolva as permissões, e informa a diferença para o pai ([ADR-046](../adr/046-depois-da-coroa-vale-o-painel-do-sucessor.md)).

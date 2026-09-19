# Decisões — F5: o sonho

Gate de alinhamento de 2026-09-19. Não reabrir sem motivo novo.

| # | Decisão | Por quê | Origem |
|---|---|---|---|
| D1 | **Sinal de qualidade = eval como portão + nota do dono como desempate** | Eval sozinho é gabaritável; nota sozinha é lenta demais para fechar um ciclo | gate 1 (A+B) |
| D2 | **Nada é promovido sem clique do dono** | Na POC a pergunta é "o laço melhora?", não "dá para confiar nele sozinho" | gate 2 (A) |
| D3 | **Artefatos e placar na pasta; uma linha por ciclo na planilha** | Candidato é texto grande (Property tem 9 KB); o placar pertence ao histórico de custo | gate 3 (A+C) |
| D4 | **Só modelos `:free` na POC; o ciclo aborta se a cota do dia já passou** | Provar conceito não deve gastar dinheiro, e o sonho não pode roubar a cota do agente acordado | gate 4 (C) |
| D5 | **Material do sonho = falhas reais do trace/runs; nunca inventado pelo modelo** | É o que o SIA faz de fato (lê o log de execução); material inventado é o laço se auto-elogiando | gate 5 (A) |
| D6 | **`./gasclaw dream` manual; nenhum gatilho novo** | A P22 (proatividade) **não tem número medido**; pendurar o sonho nela seria construir sobre cota não medida — o erro da P3 | gate extra |
| D7 | **Workspace primeiro; conta pessoal é outra rodada** | Simplifica o desenho e o critério; a diferença de cota fica registrada, não esquecida | usuário, 2026-09-19 |
| D8 | **A capacidade é opt-in por agente, e a POC roda num agente novo** | Raio de alcance de uma pasta; rollback = apagar a pasta. Nenhum agente existente passa a sonhar por efeito colateral | usuário, 2026-09-19 |
| D9 | **`AGENTS.md` nunca é alvo do sonho** | O frontmatter escolhe tools, modelo e `http_allow`: é configuração executável, não prompt | derivada de D2 |
| D10 | **A pasta declara, o painel aprova, o painel mostra a procedência** | ADR-021 (a pasta nunca concede) + ADR-035 (queda de confiança nunca é silenciosa) | gate A1 (C) |
| D11 | **Quatro capacidades separadas:** `dream`, `replicate`, `initiative`, `create` | Blast radius diferente: cota × pastas na conta × falar com terceiros × criar agentes | gate A2 (B) |
| D12 | **Só o agente com a capacidade `create` cria agentes, e ele é singleton** (`CREATOR` = um `folderId`) | Singleton por forma do dado mata a corrida de "dois agente criadors" por construção | usuário, 2026-09-19 |
| D13 | **Squad nasce sem nenhuma capacidade** | São executores, não criadores; é o que `effectiveAccess(null)` já faz, promovido a invariante testada | derivada de D12 |
| D14 | **Evolução por linhagem, não por mutação do motor** | "Código do agente" = markdown dele; roda inteiro no GAS, sem `script.projects`, sem reautorização, sem ferir o ADR-002 | usuário, 2026-09-19 (ADR-038) |
| D15 | **A guarda de tamanho em `saveAgents` é conserto devido e PRÉVIO** | `src/store.ts:20-22` grava sem `PROP_MAX`; teto de ~130 agentes que estoura com exceção. Com squad deixa de ser teórico | achado desta track |
| D16 | **O bastão é reversível — requisito, não bônus** | Voltar é sobrescrever um valor; o caro é desfazer os efeitos, por isso a linhagem registra os filhos de cada geração | derivada de D12 |

## Em aberto — não decidir sozinho

| # | Pergunta | Estado |
|---|---|---|
| A1 | Onde mora a capacidade | **FECHADA = C** (híbrido: a pasta declara, o painel aprova, o painel mostra a procedência). Ver D10 |
| A2 | Poderes separados ou um interruptor só | **FECHADA = B**, e passou a **quatro** com o `create`. Ver D11 |
| A3 | Replicação — teto, profundidade, herança | **SUBSTITUÍDA** pelo usuário: só o agente criador cria agentes. Ver D12/D13 |
| A4 | "Novo script de si mesmo" | **SUBSTITUÍDA** pelo usuário: evolução por **linhagem**, não por mutação do motor. Ver D14 |
| **A5** | **Quem autoriza a sucessão** (o agente criador promove o próprio sucessor sem humano?) | **gate aberto — contradiz a D2** |

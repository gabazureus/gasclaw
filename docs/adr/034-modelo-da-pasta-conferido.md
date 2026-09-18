# ADR-034 — O modelo pedido pela pasta é conferido, e cai no padrão quando não serve

Status: **Aceito**
Data: 2026-09-18
Relacionado: [ADR-018](018-modelos-e-custo.md) (modelos por agente), [ADR-021](021-acesso-aprovado-no-painel.md)
(acesso aprovado no painel), [ADR-025](025-rodizio-de-modelos-gratuitos.md) (`free`), [ADR-002](002-agente-pasta-sem-codigo.md)

## Contexto

O `model` de um agente pode vir de três lugares: a tela (`MODEL:<folderId>`), a planilha `config` e o
frontmatter do `AGENTS.md`. Os dois últimos moram na **pasta do Drive**, que é compartilhável.

`validateChoice` existia e era chamada em exatamente dois lugares — `setAgentModel` (painel) e a ação
`eval` (CLI). Ambos são superfícies do **dono**. O caminho da pasta não passava por lugar nenhum: o valor
ia direto de `mergeConfig` para `spec.config.model` e daí para o corpo do pedido ao OpenRouter.

Consequências práticas de uma entrada não conferida na superfície compartilhável:

- apontar o agente para o modelo **mais caro** do OpenRouter, sem passar por nenhuma tela do dono;
- apontar para um modelo que **não aceita ferramentas** — a checagem de suporte a tools do `validateChoice`
  nunca rodava para a pasta, e as ferramentas falhavam sem explicação;
- apontar para um id que simplesmente **não existe**, transformando um erro de digitação num agente morto.

## Decisão

O modelo vindo da pasta passa a ser conferido contra a lista do OpenRouter. Quando não serve, vale o
`DEFAULT_MODEL`, e o motivo aparece no trace.

- **A decisão é pura** (`folderModel`, em `src/models.ts`): recebe o que a pasta pediu, a lista (ou `null`)
  e as ferramentas do agente; devolve `{ model, source, reason? }`. Testável sem rede e sem Apps Script.
- **A borda é fina** (`withOverride`, em `src/main.ts`): lê a lista com `listModels`, que já **guarda 6 h no
  cache e só busca com o cache frio**. O caminho do turno é quente; a esmagadora maioria dos turnos não faz
  chamada nenhuma para isso.
- **Falha ao ler a lista cai no padrão** (`list === null`). Derrubar o turno puniria o usuário por uma falha
  passageira da rede; aceitar o pedido da pasta seria confiar justamente quando não dá para conferir. O
  padrão conhecido é o seguro nos dois eixos, custo e disponibilidade.
- **As ferramentas que valem são as APROVADAS no painel** (ADR-021), não as sugeridas pela pasta: é com elas
  que o agente vai rodar. Por isso o acesso passou a ser aplicado **antes** do override em
  `loadAgentForTurn` — troca segura, porque `withAccess` não olha `config.model`.
- **`modelSource` ganha um terceiro valor, `padrao`**, acompanhado de `modelReason` no span `resolve_agent`.
  Quem for depurar "por que meu agente mudou de modelo?" acha a resposta no trace, sem ler código.
- Um pedido que já **era** o padrão não vira `padrao`: o trace não deve acusar uma troca que não houve.

## Consequências

- Um agente cuja pasta aponta para um modelo inválido **passa a responder** (no padrão) em vez de falhar, e
  a troca fica registrada. Antes ele falhava de um jeito difícil de diagnosticar.
- **Esta proteção não precisa ser hermética**, e é bom que o leitor saiba por quê: o teto de
  `RUN_BUDGET_USD` por run já limita o dano em dinheiro. O que este ADR resolve é a entrada não conferida e
  a invisibilidade da troca — não o risco financeiro, que já tinha dono.
- O ambiente de teste (`test/gasEnv.ts`) passa a nascer com o cache de modelos **quente**, que é o estado
  normal em produção. Sem isso, todo teste que conta chamadas ao modelo contaria também a leitura da lista
  e passaria a medir outra coisa — foi exatamente o que aconteceu ao ligar esta mudança.

## Alternativas recusadas

- **Validar apenas contra o cache, sem nunca buscar.** Custo zero, mas a proteção viraria probabilística:
  com o cache frio, qualquer modelo passaria. Fraco justamente contra o caso do modelo caro.
- **Recusar o turno quando o modelo não serve.** Honesto, mas uma falha passageira da rede derrubaria todos
  os agentes de uma vez.
- **Validar dentro de `mergeConfig`.** Seria o lugar mais cedo, mas `mergeConfig` é núcleo puro e
  `validateChoice` precisa da lista; além disso `workspace.ts` importar `models.ts` fecharia um ciclo de
  importação (`models.ts` já importa `DEFAULT_MODEL` de `workspace.ts`).

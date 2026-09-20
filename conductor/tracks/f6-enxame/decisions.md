# Decisões — F6: o enxame

## 2026-09-20 — a árvore tem profundidade 1, e isso não está em discussão

`CHILD_FORBIDDEN_SCOPES` nega `script.projects`/`script.deployments` ao filho, e a opção 4 da
[ADR-040](../../../docs/adr/040-isolamento-e-privilegio.md) nega a chave do modelo. Um filho
**não gera netos**: quem gera é sempre o motor. "15 agentes" são **15 irmãos**.

Reabrir isso é reabrir a ADR-040, não ajustar um parâmetro.

## 2026-09-20 — dois defeitos achados ANTES de gastar, e é isso que os torna baratos

- **D1:** `main.ts:2158` passa o **prompt** como código vigente em toda geração. A linhagem não
  encadeia; cada filho é um novo sorteio do mesmo ponto. Replicação com variância ≠ evolução.
- **D2:** a linhagem grava `delta: null` sempre. Sem aptidão não há seleção.

Rodar 24 h com os dois de pé custaria ~US$ 15 para provar o que a P24 já provou por US$ 0.

## 2026-09-20 — D3: o registro de filhos, achado pela P29 e não pela leitura

A auditoria de código achou D1 e D2. **D3 só apareceu medindo.** A sonda criou 20 projetos e o Google
aceitou todos — quem recusou foi o nosso registro: `8315 characters, limit is 8000`.

Medido sobre o código real: **17 filhos** com `reason` curto, **11** com `reason` cheio. A corrida de
15 quebraria no 12º filho, com o Opus já pago por ele, e o filho ficaria órfão no Google.

Decisão: partir o registro em até 8 Properties em vez de encolher o que cada filho guarda. Encolher
moveria o número; partir remove a classe do defeito. O pedaço 0 mora na Property de sempre — dado
antigo continua sendo lido, sem migração.

**É o argumento inteiro para medir antes de gastar:** US$ 0 de sonda achou o que US$ 15 de corrida
teria achado no pior momento.

## 2026-09-20 — o contrato de aptidão pedido deixava o filho dar a própria nota

O `/goal` pedia: *"`doGet` devolve `{ ok, score }`, o motor extrai `score`"*. Meu `/plan` pedia
`{ ok: boolean }` por caso. **Os dois deixam o avaliado se avaliar**: o Opus pode escrever
`return {ok:true, score:100}` e vencer toda comparação sem fazer nada. É o laço auto-avaliado que o
próprio projeto cita como medido e reprovado (arXiv:2310.01798, em `judgeSet.ts`).

Decisão: o filho recebe a ENTRADA e devolve a SAÍDA. O motor compara com o esperado, que nunca
atravessa a rede. `ok` e `score` na resposta **não são lidos** — há teste para isso.

## 2026-09-20 — k são CASOS, não repetições

No ciclo de sonho k = 17 repetições, porque o agente é estocástico (P23: 0,4,4,0). Código gerado é
determinístico: 17 repetições dão 17 vezes a mesma resposta, e um teste de proporções sobre isso não
mede nada. Aqui k é o número de casos distintos da bateria. `beatsIncumbent` continua o juiz.

## 2026-09-20 — PREVISTO, NÃO MEDIDO: o 302 do Apps Script

Web apps servem o `ContentService` com um 302 para `script.googleusercontent.com`, e `fetchChild`
desligava `followRedirects` (com razão: o token de 16 escopos não pode seguir para qualquer host).
Sem seguir, um filho correto seria julgado falho em todo caso, e `authState` diria "unknown" para um
filho autorizado — a C3 da P29 **nunca passaria, mesmo depois do clique do dono**.

`redirectTarget` segue só esse host exato, por https, sem o token na segunda perna. **Nenhum filho
autorizado foi observado neste projeto até aqui**: é previsão. Se errar, a falha cai em "não medido",
nunca em "o filho falhou". O primeiro clique do dono mede isso.

## PENDENTE — H5: a bateria

A bateria define o que é "melhor", e por isso é do dono. Três razões que se somam: não pode vir da
pasta (ADR-002 — quem editasse a pasta escreveria a prova), não pode vir do gerador (auto-avaliação),
e é o objetivo — decisão de quem manda. Sem ela, `measureChild` devolve "não medido (gate H5)".

## PENDENTE — H1: o orçamento da corrida

`CODEGEN_DAILY_CAP_USD = 3,00` hoje; a corrida pede **US$ 15,00**. O teto **não reprovou em medição
nenhuma** — foi escolhido como orçamento, e o dono pode escolher outro. O que fica registrado aqui
quando ele escolher: o valor, a data, e **o valor de volta** ao fim da corrida.

| Campo | Valor |
|---|---|
| `CODEGEN_DAILY_CAP_USD` durante a corrida | *(a decidir)* |
| `FAMILY_CAP_USD` durante a corrida | *(a decidir)* |
| Valores de volta ao fim | US$ 3,00 e US$ 5,00 |
| Data da decisão | *(a preencher)* |

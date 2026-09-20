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

---
title: "Evolução do agente no gasclaw: o sinal está na linhagem"
type: synthesis
date: 2026-09-19
tags: [sonho, linhagem, avaliacao, f5, p23, decisao]
sources:
  - docs/raw/sources/2026-09-19-arxiv-avaliacao-e-auto-aprimoramento.md
---

# Evolução do agente no gasclaw

Síntese da pesquisa de 2026-09-19 aplicada à track **F5** (sonho e linhagem) e à POC **P23**. O documento
longo, com a conta completa, está em `docs/pesquisa/2026-09-19-o-sinal-fraco-do-sonho.md`.

## A tese

> **O sinal não está na geração; está na linhagem.**

Com oito cenários, nenhuma geração isolada pode ser declarada melhor — isso é aritmética, não opinião
(ver [[sinal-fraco-em-avaliacao]]). Mas uma **sequência** de gerações pode: se o laço tem qualquer
vantagem real, ela aparece como viés persistente ao longo de muitas comparações pareadas, ainda que cada
comparação isolada seja ruído.

Portanto a unidade de evidência deixa de ser *"esta geração venceu"* e passa a ser *"esta linhagem está
ganhando de forma consistente"*.

## Três consequências de desenho

**1. Promoção e evidência são critérios diferentes, e estavam fundidos.** Promover pode ser barato e
permissivo — é reversível e o humano está no laço. Afirmar que "o agente melhorou" é estatístico e
acumulado. Confundir os dois é chamar de lucro cada venda.

**2. Segurança é verificável; qualidade não é. Réguas separadas.** Ver [[verificador-exato]]. O portão de
segurança é absoluto: falhou um, morre. A qualidade é ruidosa e precisa de rubrica graduada, execuções
repetidas e acumulação.

**3. Binário joga fora informação já paga.** Cada cenário custa uma chamada de modelo; codificar como
passou/falhou descarta quase tudo que ela produziu.

## O que valida decisões que já estavam tomadas

- **O juiz vem do build, não da pasta.** Tomada por segurança (a pasta é compartilhável, logo quem tem
  acesso escreveria a própria nota). A literatura acrescenta que um laço auto-avaliado **também não
  melhora**: arXiv:2310.01798 mostra degradação sem retorno externo. A decisão estava certa por dois
  motivos independentes.
- **Promoção com humano no laço.** Coerente com o platô previsto em arXiv:2411.00750 e com
  [[auto-preferencia-do-juiz]].

## O que muda

| antes | depois |
|---|---|
| `delta >= 2 líquidos` promove | delta positivo **+ zero falhas de portão**; a linhagem carrega a evidência |
| um conjunto-juiz | três: `gate`, `quality`, `holdout` ([[conjunto-reservado]]) |
| binário | rubrica graduada 0–4 |
| uma execução por cenário | k execuções, para separar diferença de ruído |
| veredito por ciclo | teste sequencial acumulado na linhagem |
| juiz qualquer | família diferente da que gerou |
| — | **regra de fracasso declarada**: N gerações sem vantagem no reservado ⇒ vira ADR |

## O experimento que decide o desenho

**C7 — variância intra-candidato.** Rodar o *mesmo* prompt duas vezes no conjunto de qualidade e medir o
desacordo consigo mesmo. Se ele for maior ou igual ao delta típico entre candidatos, está demonstrado que
o placar por geração é ruído. Custa duas execuções.

## Resposta honesta

Quase toda geração **vai** empatar — isso é previsão, não risco. O erro seria concluir daí que o laço não
funciona; a conclusão correta é que a geração é a unidade errada de observação. E se, com reserva, rubrica
e acumulação ao longo de vinte gerações, nada aparecer, então a linhagem **não funciona nesta escala** —
e isso vira ADR. Custaria poucos dólares e evitaria um sistema que parece evoluir e não evolui.

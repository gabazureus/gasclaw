# ADR-037 — Custo por mês e o valor de cada modelo à mão

**Status:** Aceito · 2026-09-19

## Contexto

O painel de custo respondia bem a uma pergunta só: *quando* gastei. Sete barras empilhadas, um dia cada.
Duas perguntas ficavam sem resposta observável:

1. **Quanto custou o modelo X?** O valor existia, mas dentro de um `<title>` do SVG que listava o dia
   inteiro de uma vez — o navegador só o abre depois de cerca de um segundo parado, e num dia com cinco
   modelos a pessoa lia cinco valores para descobrir um. Na prática a resposta estava na tabela, fechada
   dentro de um `<details>`.
2. **E no mês?** Não havia recorte maior que sete dias. Quem paga a conta raciocina por mês.

A segunda tinha um obstáculo que a primeira não tinha: **o dado não existia**. O `prune` (ADR-018, critério
C6) dobrava hora em dia e, passados 90 dias, **descartava o dia**. Um gráfico "por meses" construído sobre
isso mostraria três meses para sempre, e o quarto sumiria sem aviso — pior do que não ter o gráfico.

## Decisão

**O dia que sai da janela de 90 dias é dobrado no mês, não descartado.** O `Usage` ganha `mo`
(`AAAA-MM → modelo → {req, tok, custo}`), gravado em `USAGE:mo:<ano>`, agrupado por ano e partido em `#n`
como as horas e os dias já eram. O histórico mensal tem fim declarado: **24 meses**.

- O mês é só o agregado por modelo — não guarda o dia, nem o run, nem o texto. É o que o gráfico precisa e
  nada além.
- `monthTotals` soma os dois lados: o que já foi dobrado em `mo` e os dias que ainda existem. Eles nunca se
  sobrepõem, porque o `prune` dobra o dia **no mesmo passo** em que o tira de `d`.
- O gráfico ganha três faixas — 7 dias, 30 dias e 12 meses — e a faixa vem do cliente, então é **validada**
  no servidor: qualquer valor fora da lista volta para 7 dias em vez de derrubar a tela.
- O painel ganha uma **pizza** ao lado do empilhado: o empilhado responde "quando gastei", a pizza responde
  "com quem gastei", que é a pergunta de quem quer trocar de modelo. As duas usam a mesma série e as mesmas
  cores — senão a legenda serviria a uma só.
- Passar o mouse por **um segmento** (barra ou fatia) mostra modelo, valor e percentual na hora. O `<title>`
  continua lá: o balão é para o ponteiro, o `<title>` e o `aria-label` são para quem lê com leitor de tela,
  e as fatias são alcançáveis por Tab.

## Custo em Script Properties

O limite é 9 KB por valor e 500 KB no total. Medido em teste (`test/usageProps.test.ts`): **24 meses com 8
modelos** cabem, nenhum valor passa de 9 KB, e a leitura devolve exatamente os mesmos meses. O acréscimo
sobre o que já era gravado fica na casa de 15 KB — três por cento do total disponível.

## Consequências

- O gasto por modelo deixa de exigir abrir a tabela.
- Existe uma série mensal que **cresce**: o décimo terceiro mês empurra o primeiro para fora, e isso está
  escrito, não descoberto.
- Quem instalou antes desta mudança começa o histórico mensal de hoje: os dias já descartados não voltam.
  O gráfico por meses fica correto desde o primeiro mês, apenas mais curto no começo.
- Quatro casas decimais transformavam US$ 0,00004 em "US$ 0" — exatamente o número que o balão existe para
  mostrar. Abaixo de um milésimo a tela passa a mostrar sete casas.

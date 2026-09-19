# POC P25 — o trace tem combustível para formar aglomerado determinístico?

> **Critério escrito antes de qualquer linha.** A medição inicial já foi feita e está no fim.

## A pergunta

O organismo (especialistas criados a partir de demanda observada) depende de **agrupar falhas por
contagem determinística**, nunca por impressão do modelo. "Sete runs nos últimos trinta dias
terminaram sem resposta tocando agenda" é evidência; "percebi que você anda precisando de ajuda com
agenda" é impressão.

Logo, antes de desenhar o agrupamento: **o trace grava volume e tipo suficientes?**

## Por que isto vem antes do organismo

A P23 mediu que a nota de um LLM tem desvio **2,19 numa escala de 4**. Uma contagem de inteiros tem
desvio **zero por construção** — ela não tira 4 numa leitura e 0 na outra. Esse contraste não é
preferência de estilo: é o argumento medido a favor do agrupamento determinístico.

## Critérios

| # | Critério | Limiar |
|---|---|---|
| C1 | runs com desfecho de falha nos últimos 30 dias | ≥ **30** (senão não há o que agrupar) |
| C2 | o trace distingue os tipos de falha sem chamar modelo | `refused`, `stopped: steps`, run sem resposta, `denied`, erro de tool |
| C3 | o maior aglomerado por ferramenta | ≥ **7** ocorrências (limiar plausível para justificar um especialista) |
| C4 | o rótulo do aglomerado (se houver chamada de modelo) **não decide nada** | rótulo é texto; a decisão sai da contagem |
| C5 | a contagem é reprodutível: rodar duas vezes dá o mesmo número | desvio **0** |

**C5 existe porque é o contraste com o C7 da P23.** Se a contagem variar entre leituras, ela não é
melhor que a nota do LLM e o argumento inteiro cai.

## MEDIÇÃO INICIAL — 2026-09-19, dev v92

| Medida | Valor |
|---|---|
| Requisições no dia | **86** (`./gasclaw usage`) |
| Custo medido no dia | US$ 0,0132 |
| Histórico disponível | 7 dias (2026-09-13 a 19), custo total ~US$ 0,05 |
| Origem do tráfego | **100% evals**. Não há tráfego de usuário real |
| Runs com falha agrupáveis | **0** |

### Veredito: **C1 reprova, e isso é a entrega**

> **O trace do dev não tem combustível para o organismo.** Não é que o agrupamento esteja mal
> desenhado — é que **não existe demanda real gravada** para agrupar. Todo o tráfego é de eval, que
> por construção não representa o que o dono pede no dia a dia.

Consequências, sem suavizar:

1. **O organismo não pode ser validado no dev.** Ele precisa de tráfego real, o que significa
   produção e uso continuado por semanas antes de qualquer aglomerado existir.
2. **O limiar de 7 ocorrências é palpite até haver dado.** Com zero falhas gravadas, não há como
   calibrar. Escolher 7 agora seria inventar um número e chamá-lo de critério.
3. **A ordem certa inverte-se:** primeiro instrumentar a contagem (barata, determinística, sem
   modelo), deixar rodar, e só depois desenhar a criação de especialista. Construir o criador antes
   de existir o que contar é construir o consumidor antes do produtor — o mesmo erro que a P22
   evitou ao medir a cota antes de desenhar o despertar.

## Achado colateral, e ele importa mais que o resto desta POC

O `./gasclaw usage` imprime uma conferência cruzada:

```
measured by gasclaw US$ 0.01320346 × reported by OpenRouter US$ 0.066432284 (-80.1%)
```

**A contabilidade própria do gasclaw está 80% abaixo do que o OpenRouter reporta** — um fator de
~5×. A própria linha explica parte disso (as janelas de dia são diferentes: o dia do OpenRouter vira
21:00 em São Paulo), então **não é conclusão, é suspeita forte**.

Por que isso é grave neste desenho: **o teto de orçamento é o mecanismo de segurança do gasto**.
`RUN_BUDGET_USD`, `CODEGEN_BUDGET_USD` e o teto diário agregado são todos calculados a partir do
custo **medido pelo gasclaw**. Se esse número for 5× menor que o real, um teto de US$ 1,00 por
geração de Opus deixaria passar até US$ 5,00 — e o dono não veria.

**Registrado como pendência de investigação com prioridade alta**, antes de qualquer linha de
geração de código com Opus. Medir a mesma janela dos dois lados é o experimento que decide.

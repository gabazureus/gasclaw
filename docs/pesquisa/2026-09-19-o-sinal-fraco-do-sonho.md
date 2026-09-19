# O sinal fraco do sonho — por que 8 cenários não provam evolução, e o que fazer

**Data:** 2026-09-19 · **Para:** track F5 (sonho e linhagem), POC P23
**Pergunta que originou:** *"com 6–8 cenários, 'vence por 2' é sinal fraco, não medida. Se quase toda
geração empatar, a linhagem não funciona neste tamanho."*

Este documento tenta matar essa dúvida com número e com literatura, e chegar a uma decisão. A conclusão
antecipada: **a dúvida estava certa, e é pior do que parecia — mas o conserto não é ter mais cenários.**

---

## 1. A conta, antes da literatura

O desenho compara candidato e titular nos **mesmos** cenários. Isso é um experimento pareado, e o teste
certo é o de McNemar (equivalente ao teste do sinal sobre os pares **discordantes** — aqueles em que um
passa e o outro falha). Pares concordantes não carregam informação nenhuma sobre qual é melhor.

Com o critério que estava na spec (`vence por ≥ 2 líquidos`):

| vence | perde | líquido | p (bilateral exato) | significativo a 5%? |
|---:|---:|---:|---:|:--|
| 3 | 1 | +2 | **0,625** | não |
| 4 | 2 | +2 | 0,688 | não |
| 5 | 3 | +2 | 0,727 | não |
| 4 | 0 | +4 | 0,125 | não |
| 5 | 0 | +5 | 0,063 | não |
| 5 | 1 | +4 | 0,219 | não |
| 6 | 1 | +5 | 0,125 | não |
| 7 | 1 | +6 | 0,070 | não |
| **6** | **0** | +6 | **0,031** | **sim** |
| **7** | **0** | +7 | 0,016 | sim |
| **8** | **0** | +8 | 0,008 | sim |

Leitura, sem suavizar: **com 8 cenários, a única forma de atingir significância é o candidato vencer
TODOS os pares discordantes, e haver pelo menos seis deles.** Basta o titular ganhar **um** cenário para
o resultado deixar de ser distinguível de sorte. E o critério `≥ 2 líquidos` que estava escrito aceita
situações com p = 0,625 — ou seja, aceita ruído como se fosse evolução.

### Quanto seria preciso para detectar uma melhora real

Poder de 80% a 5% (teste do sinal), por tamanho de efeito:

| o candidato é de fato melhor em… | pares **discordantes** necessários |
|---|---:|
| 60% dos casos | ~196 |
| 65% | ~87 |
| 70% | ~49 |
| 75% | ~31 |
| 80% | ~22 |
| 90% | ~12 |

Como só os discordantes contam, e numa suíte madura a maioria dos cenários tende a concordar, o número
de **cenários** necessários é várias vezes maior que a coluna da direita. Detectar uma melhora honesta e
moderada (65%) exigiria uma suíte de centenas de itens, rodada a cada geração, em modelo pago.

**Conclusão da seção: a significância por geração é inalcançável neste orçamento. Não por preguiça de
desenho — por aritmética.**

---

## 2. O que a literatura diz

Sete achados, todos verificados na fonte (arXiv), que mudam o desenho.

**(a) Avaliação é experimento, e a prática corrente ignora isso.**
*Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations*
([arXiv:2411.00640](https://arxiv.org/abs/2411.00640)) — "a literatura sobre avaliações largamente
ignorou a literatura de outras ciências sobre análise e planejamento de experimentos". O artigo dá as
fórmulas para comparar dois modelos e para **planejar** o tamanho do experimento. A nossa P23 estava
prestes a repetir o erro que ele descreve: reportar um número por candidato e declarar vencedor o maior.

**(b) O modelo difere de si mesmo mais do que difere do rival.**
*evalci* ([arXiv:2607.04429](https://arxiv.org/abs/2607.04429)) — "sob amostragem por temperatura, um
modelo pode diferir de si mesmo, de execução para execução, por mais do que a diferença reportada entre
modelos". Ao reanalisar nove modelos no MMLU, **3 de 8 diferenças adjacentes do ranking deixaram de ser
significativas** após correção para comparações múltiplas. Isso é decisivo para nós: **parte do nosso
"delta" é o mesmo prompt discordando de si mesmo.** Sem medir a variância intra-candidato, não dá para
saber que fração.

**(c) Auto-correção sem sinal externo não funciona — e às vezes piora.**
*Large Language Models Cannot Self-Correct Reasoning Yet*
([arXiv:2310.01798](https://arxiv.org/abs/2310.01798)) — sem retorno externo, os modelos "têm
dificuldade de se autocorrigir, e por vezes o desempenho **degrada** após a autocorreção". Isto valida,
com evidência, a decisão que já estava tomada por intuição de segurança: **o juiz vem do build, não do
agente.** Um juiz que o agente pudesse editar não seria só um risco de segurança — seria um laço que a
literatura já mostrou que não melhora.

**(d) O juiz favorece quem se parece com ele.**
*Self-Preference Bias in LLM-as-a-Judge* ([arXiv:2410.21819](https://arxiv.org/abs/2410.21819)) e
*Self-Preference Bias in Rubric-Based Evaluation* ([arXiv:2604.06996](https://arxiv.org/abs/2604.06996)),
que trata explicitamente de cenários de **auto-aprimoramento recursivo**: o juiz tende a favorecer
saídas da própria família de modelos. Se o Opus gera o candidato e um juiz da mesma família decide,
parte do delta é parentesco, não qualidade.

**(e) Auto-recompensa satura, e a cauda estreita.**
*Self-Rewarding Language Models* ([arXiv:2401.10020](https://arxiv.org/abs/2401.10020)) mostra o laço
funcionando; *CREAM* ([arXiv:2410.12735](https://arxiv.org/abs/2410.12735)) aponta o problema de usar o
mesmo modelo como política e como recompensa; e *Mitigating Tail Narrowing in LLM Self-Improvement*
([arXiv:2411.00750](https://arxiv.org/abs/2411.00750)) observa que "o desempenho logo estabiliza", com
estreitamento da cauda de diversidade. Ou seja: **espere platô, e detecte-o de propósito** em vez de
descobri-lo por frustração.

**(f) Treinar recursivamente na própria saída degrada.**
*Rate of Model Collapse in Recursive Training*
([arXiv:2412.17646](https://arxiv.org/abs/2412.17646)). Não treinamos pesos, então o colapso literal não
se aplica — mas o análogo existe: uma linhagem de prompts gerados a partir de prompts gerados converge
para o gosto do juiz, não para a utilidade. É mais uma razão para um conjunto **reservado**.

**(g) O que funciona de verdade tem verificador exato e barato.**
FunSearch (Romera-Paredes et al., *Nature* 2023, citado em
[arXiv:2601.16849](https://arxiv.org/abs/2601.16849)), *STOP: Recursively Self-Improving Code
Generation* ([arXiv:2310.02304](https://arxiv.org/abs/2310.02304)) e *Promptbreeder*
([arXiv:2309.16797](https://arxiv.org/abs/2309.16797)) evoluem artefatos com sucesso — e todos
compartilham a mesma condição: **o juiz é um programa determinístico, roda milhares de vezes e custa
quase nada.** O Dream-RSI (que sequer publicou código) fala em milhares de ciclos. Nós temos oito
cenários e uma chamada de Opus a US$ 0,30.

**(h) Seleção de itens vale mais que quantidade de itens.**
*tinyBenchmarks* ([arXiv:2402.14992](https://arxiv.org/abs/2402.14992)) — 100 itens curados reproduzem o
MMLU de 14 mil. A lição aproveitável não é "use 100": é que **itens discriminativos valem muito mais que
itens numerosos**. Um cenário que todo candidato passa é um cenário que não informa nada.

---

## 3. A tese

> **O sinal não está na geração; está na linhagem.**
>
> Com oito cenários, nenhuma geração isolada pode ser declarada melhor — isso é aritmética, não opinião.
> Mas uma **sequência** de gerações pode: se o laço tem qualquer vantagem real, ela aparece como um viés
> persistente ao longo de muitas comparações pareadas, ainda que cada comparação isolada seja ruído.
> Portanto a unidade de evidência do gasclaw deve deixar de ser *"esta geração venceu"* e passar a ser
> *"esta linhagem está ganhando de forma consistente"*.

Três consequências que decorrem direto:

**1. O critério de promoção e o critério de evidência são coisas diferentes, e hoje estão fundidos.**
O critério de promoção pode continuar barato e permissivo (passou nos portões de segurança, não piorou,
tem delta positivo) — porque promover é reversível e o humano está no laço. O critério de **evidência**
("a linhagem está evoluindo") é estatístico, acumulado, e é o único que autoriza a frase "o agente
melhorou". Confundir os dois é como chamar de lucro cada venda individual.

**2. O portão de segurança é verificável; a qualidade não é. Eles não podem dividir a mesma régua.**
Os cenários de segurança (a injeção parou no card? a tool proibida foi recusada?) são determinísticos e
baratos — exatamente o tipo de juiz que faz FunSearch e STOP funcionarem. Eles devem ser **absolutos**:
falhou um, o candidato morre, sem estatística. A qualidade é ruidosa e precisa do tratamento acima.
Somar os dois num placar único destrói a propriedade boa de ambos.

**3. Binário joga fora informação que já pagamos para produzir.**
Cada cenário custa uma chamada de modelo. Codificar o resultado como passou/falhou descarta quase tudo
que aquela chamada produziu. Uma rubrica graduada (0–4) sobre os mesmos oito cenários dá muito mais
informação por dólar — e permite teste pareado sobre a diferença de notas, que tem poder bem maior que o
teste do sinal sobre binários.

---

## 4. O que muda no desenho

| Hoje na spec | Passa a ser | Por quê |
|---|---|---|
| `delta ≥ 2 líquidos` promove | Delta positivo **+ zero falhas de portão** promove; a **linhagem** é que carrega a evidência | p = 0,625 não é evidência de nada |
| Um conjunto-juiz | **Dois**: `gate` (determinístico, absoluto) e `quality` (rubrica 0–4) | réguas diferentes para naturezas diferentes |
| Todos os cenários usados para escolher | **Conjunto reservado**, nunca usado na seleção, rodado só para responder "a linhagem melhorou?" | sem reserva, a linhagem otimiza o juiz (Goodhart), e não há como saber |
| Uma execução por cenário | **k execuções** por cenário no conjunto de qualidade | sem isso não se separa "candidato melhor" de "o mesmo prompt discordando de si mesmo" (b) |
| Veredito por ciclo | **Teste sequencial** acumulando ao longo das gerações, com regra de parada declarada | é a única forma de extrair sinal deste orçamento |
| Juiz é um modelo qualquer | Juiz de **família diferente** da que gerou o candidato | viés de auto-preferência (d) |
| — | **Regra de fracasso explícita**: após N gerações sem vantagem detectável no reservado, a linhagem é declarada ineficaz e vira ADR | a literatura prevê platô (e); previsto não é surpresa |

### O critério medido que a P23 deveria ter

A P23 mede **custo**. Ela não responde "o sonho melhora?", e não tem como responder — nenhum ciclo
isolado responde. Proposta de critério adicional, honesto e alcançável:

- **C7 — variância intra-candidato.** Rodar o **mesmo** prompt duas vezes no conjunto de qualidade e
  medir o desacordo consigo mesmo. Se o desacordo consigo mesmo for ≥ ao delta típico entre candidatos,
  está demonstrado que o placar por geração é ruído, e a tese acima deixa de ser argumento e vira medida.
  **Este é o experimento mais barato e mais informativo do projeto inteiro** — custa duas execuções e
  decide o desenho.

---

## 5. Componentes que ainda faltam no desenho

Levantados ao escrever isto, em ordem de gravidade:

1. **Conjunto reservado (holdout).** Não existe. Hoje o mesmo conjunto seleciona e atesta — o pecado
   metodológico clássico. Sem ele, qualquer afirmação de melhora é circular.
2. **Variância intra-candidato.** Nunca medida. Sem ela não se sabe se o delta é diferença ou ruído (b).
3. **Versão anterior do prompt guardada na promoção.** O bastão é reversível; o **prompt promovido**
   ainda não tem volta declarada. Promover sobrescreve.
4. **Detecção de platô.** A literatura diz que ele chega (e). Sem detecção, gasta-se Opus indefinidamente
   para empatar.
5. **Diversidade dos candidatos.** Três candidatos do mesmo modelo, do mesmo material, tendem a convergir
   — e três candidatos quase idênticos não são uma busca, são uma amostra repetida.
6. **Família do juiz diferente da do gerador.** Não está especificado, e o viés está medido na literatura.
7. **Congelamento de emergência.** `./gasclaw down` para os agentes. Não existe "congele todas as
   capacidades e mantenha os agentes atendendo" — que é o que se quer quando a linhagem começa a piorar.
8. **Métrica do próprio laço.** Quantos ciclos produziram promoção? Se for zero em vinte, o laço é peso
   morto e ninguém vai perceber sem esse número.
9. **Concorrência entre ciclos.** Dois ciclos de sonho simultâneos no mesmo agente não têm trava
   declarada.
10. **O que "realizou" significa na planilha de linhagem.** A coluna existe na spec; a definição, não.

---

## 6. Resposta honesta à pergunta original

*"Se quase toda geração empatar, a linhagem não funciona neste tamanho?"*

**Quase toda geração VAI empatar — isso é previsão, não risco.** Com oito cenários binários, empate é o
resultado mais provável mesmo quando existe melhora real. O erro seria concluir daí que o laço não
funciona. A conclusão correta é que **a geração é a unidade errada de observação.**

E há uma resposta que precisa continuar em cima da mesa: se, mesmo com conjunto reservado, rubrica
graduada e teste sequencial ao longo de dez ou vinte gerações, nenhuma vantagem aparecer — então a
linhagem de prompts **não funciona neste tamanho**, e isso vira ADR. Seria um resultado valioso: custaria
alguns dólares de Opus e evitaria um sistema que parece evoluir e não evolui.

---

## Fontes

Todas verificadas na API do arXiv em 2026-09-19.

| | |
|---|---|
| [2411.00640](https://arxiv.org/abs/2411.00640) | Adding Error Bars to Evals |
| [2607.04429](https://arxiv.org/abs/2607.04429) | evalci: comparação estatisticamente rigorosa |
| [2310.01798](https://arxiv.org/abs/2310.01798) | LLMs Cannot Self-Correct Reasoning Yet |
| [2410.21819](https://arxiv.org/abs/2410.21819) | Self-Preference Bias in LLM-as-a-Judge |
| [2604.06996](https://arxiv.org/abs/2604.06996) | Self-Preference Bias in Rubric-Based Evaluation |
| [2401.10020](https://arxiv.org/abs/2401.10020) | Self-Rewarding Language Models |
| [2410.12735](https://arxiv.org/abs/2410.12735) | CREAM: Consistency Regularized Self-Rewarding |
| [2411.00750](https://arxiv.org/abs/2411.00750) | Mitigating Tail Narrowing in LLM Self-Improvement |
| [2412.17646](https://arxiv.org/abs/2412.17646) | Rate of Model Collapse in Recursive Training |
| [2402.14992](https://arxiv.org/abs/2402.14992) | tinyBenchmarks |
| [2309.16797](https://arxiv.org/abs/2309.16797) | Promptbreeder |
| [2310.02304](https://arxiv.org/abs/2310.02304) | STOP: Self-Taught Optimizer |
| [2507.00075](https://arxiv.org/abs/2507.00075) | Solver-Verifier Gap na dinâmica de auto-aprimoramento |
| [2605.28533](https://arxiv.org/abs/2605.28533) | Hypothesis Testing by Betting (teste sequencial) |

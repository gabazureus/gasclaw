# POC P29 — quantos filhos a plataforma aceita por dia, e quanto custa um clique?

> **Status: critérios escritos, NADA MEDIDO.** Nenhum número abaixo é estimativa — os campos
> vazios ficam vazios até serem medidos no ambiente real, com a versão do dev anotada.

**Custo: US$ 0.** Esta POC **não chama o Opus**. O código do filho é uma string fixa. Ela mede a
**plataforma**, não o modelo — e por isso vem antes de qualquer decisão de orçamento.

## A pergunta

A [P24](../p24-linhagem-de-codigo/README.md) mediu **um** filho: criar 10.754 ms, escrever 1.122 ms,
versionar 454 ms, implantar 414 ms, e o portão humano (`Authorization needed`). O que ela **não**
mediu é o que decide se "15 filhos em 24 h" cabe:

1. a cota diária de `projects.create` — **onde o Google recusa**;
2. o tempo de parede de um clique de consentimento, do lado do dono;
3. se criar em rajada degrada (429) ou segue linear.

## Critérios

| # | Passo | Passa quando | Medido |
|---|---|---|---|
| C1 | `burst` | 5 filhos criados+implantados em sequência, com o ms de cada um registrado e o **primeiro HTTP 429** (se houver) nomeado | — |
| C2 | `quota` | o número de `projects.create` que o dia aceita antes de recusar, **declarado**. Recusar é um resultado, não uma falha | — |
| C3 | `consent` | tempo de parede entre a implantação e `authState === 'authorized'` depois do clique do dono | — |
| C4 | `cleanup` | os 5 somem do painel com `forgetChild`, e a tela diz que o **projeto continua no Google** | — |

**Leitura de C2:** se o dia recusar abaixo de 15, a corrida da [F6](../../conductor/tracks/f6-enxame/plan.md)
passa a ser "até N", com **N medido**. O pedido do usuário era *"até 15"* — o teto vem da plataforma,
não da nossa vontade.

## Como rodar — no SEU ambiente

Nenhum id está fixo no código: tudo vem das Script Properties de quem roda.

```bash
./gasclaw up            # publica no dev e abre o painel
./gasclaw poc p29 burst # C1 — cria 5 filhos e cronometra cada passo
./gasclaw poc p29 quota # C2 — vai até o Google recusar, e diz onde recusou
```

Entre `burst` e `consent`, **o dono clica**: o painel lista os 5 filhos com o botão *Authorize it*.
São 5 cliques, um por filho — é o portão que a P24 mediu, e ele é da plataforma, não nosso.

```bash
./gasclaw poc p29 consent  # C3 — mede o tempo de parede até o filho responder autorizado
./gasclaw poc p29 cleanup  # C4 — tira os 5 do painel (o projeto continua na sua conta Google)
```

Para parar tudo a qualquer momento:

```bash
./gasclaw down
```

## O que esta POC NÃO responde

- **Se o código gerado presta.** Isso é a [P31](../../conductor/tracks/f6-enxame/plan.md) (aptidão),
  e depende de o filho **rodar e devolver um número**.
- **Se a geração N+1 aprende com a N.** Isso é a P30 (encadeamento), e hoje **não acontece**:
  `main.ts:2158` passa o prompt em toda geração.

Medir a plataforma primeiro é o que evita pagar Opus para descobrir um limite que custava US$ 0.

## Medição

*(a preencher depois de rodar — com a versão do dev, como toda medição deste projeto)*

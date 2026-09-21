# POC P29 — quantos filhos a plataforma aceita por dia, e quanto custa um clique?

> **Status: C1, C2 e C4 MEDIDOS e verdes (dev v132–v133, 2026-09-20). C3 aguarda o clique do
> dono** — é o portão da plataforma, e a sonda só lê o que já aconteceu. A medição achou um
> **defeito do produto** (D3) que bloqueava a corrida, e ele foi consertado e remedido.

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
| C1 | `burst` | 5 filhos criados+implantados em sequência, com o ms de cada um registrado e o **primeiro HTTP 429** (se houver) nomeado | ✅ **v132** — 5 de 5, **nenhum 429**; 4 tempos capturados, 8.083–10.910 ms por filho (criar+escrever+versionar+implantar) |
| C2 | `quota` | o número de `projects.create` que o dia aceita antes de recusar, **declarado**. Recusar é um resultado, não uma falha | ✅ **v133** — 20 de 20 sem recusa; somando as duas rodadas do dia, **40 projetos, zero recusas**. `fitsFifteen: true` |
| C3 | `consent` | tempo de parede entre a implantação e `authState === 'authorized'` depois do clique do dono | ✅ **v135** — **20 de 20 autorizados**. Mediana 2.844.904 ms, mas é **limite superior** (ver ressalva) |
| C4 | `cleanup` | os filhos vão para a lixeira do Drive (reversível) e somem do painel | ✅ **v133** — **20 de 20** na lixeira, exercitando o registro corrigido 20 vezes |

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

## Medição — dev v132 e v133, 2026-09-20

### C1 — a rajada (v132)

| # | HTTP | ms |
|---|---|---|
| 1–5 | 200 em todos (5 de 5 com `created: true`) | quatro capturados: 8.083 · 9.509 · 9.595 · 10.910. **O quinto foi cortado da saída capturada e não está registrado** — não vai ser estimado |

**Nenhum 429.** Criar em sequência **não degrada**: os quatro tempos capturados ficam na faixa de 8–11 s, a mesma que a
P24 mediu para um filho sozinho (10,7 s só para criar). O custo por filho é linear.

### C2 — a cota do dia: o Google disse sim, e o NOSSO registro disse não

**Primeira rodada (v132):** a sonda criou os 20 e o Google não recusou nenhum. Mas a chamada terminou
com erro — e o erro era nosso:

```
the child project list does not fit: 8315 characters, limit is 8000
```

**D3, achado aqui por US$ 0.** O registro de filhos morava em UMA Script Property, e o teto de 8 KB
dela estourava muito antes de `MAX_CHILDREN = 40`. Medido depois, sobre o código real:

| `reason` de cada filho | filhos que cabiam |
|---|---|
| curto (44 chars, o da sonda) | **17** |
| no máximo (300 chars, o que um sucessor real carrega) | **11** |

**A corrida de 15 não cabia.** E o erro sobe DEPOIS de o projeto estar criado e implantado: em
`succeedNow` isso é Opus pago, filho vivo no Google e nada na tela. Só o estado próprio da sonda
impediu que os 20 virassem órfãos.

**Conserto:** o registro passou a ocupar até 8 Properties (o limite do Apps Script é 9 KB por valor
e 500 KB no total — o gargalo era o formato, não a plataforma). O pedaço 0 mora na Property de
sempre, então nada precisou de migração.

**Segunda rodada (v133), com o conserto:** 20 criados, 20 registrados, zero recusas.

```json
{ "created": 20, "refusedAt": null, "fitsFifteen": true, "done": true }
```

**Leitura:** somando as duas rodadas, o Google aceitou **40 `projects.create` no mesmo dia sem uma
recusa**. O teto absoluto **não foi alcançado** — a sonda para em 20 de propósito, porque descobrir o
teto custaria ao dono apagar projetos um por um. O que está provado é que ele está **acima de 40**,
e 15 cabem com folga. **O portão da F6 abre: a corrida continua sendo "até 15".**

### C3 — o clique do dono, e a confirmação de uma previsão que valia a corrida inteira (v135)

Antes do clique, a sonda devolveu `authorized: 0` e mediana **`null`, não 0** — a regra funcionando
no ambiente real. Depois que o dono autorizou os 20:

```json
{ "authorized": 20, "total": 20, "medianMs": 2844904 }
```

**O achado que importa aqui não é o tempo — é o `authorized`.** Estes são os PRIMEIROS filhos
autorizados jamais observados neste projeto, e eles confirmam a previsão do 302:

| | sem o conserto | com o conserto (medido) |
|---|---|---|
| o que `fetchChild` lê | o **302**, não a resposta do filho | a resposta do filho, code 200 |
| o que `authState` diz | `unknown` para os 20 | **`authorized` para os 20** |
| o que a aptidão faria | julgaria **falho todo filho correto** | julga a saída de verdade |

Confirma também que **a segunda perna não precisa do token**: ele não foi enviado, e a resposta veio.
A credencial de 16 escopos não atravessa o segundo salto.

#### Ressalva do número: ele é LIMITE SUPERIOR, e mede outra coisa

A mediana de **2.844.904 ms (~47 min)** é o tempo entre a **implantação** e o **instante em que a
sonda conferiu** — não entre a implantação e o clique. A sonda lê estado; ela não observa o momento
do clique, e não há como observá-lo sem consultar de minuto em minuto. Então o número mede sobretudo
**quando o dono chegou até a tela**, e não o custo do clique em si.

O que C3 estabelece com firmeza: **o clique funciona, é um por filho, e 20 deles couberam numa
sessão.** Para a corrida de 15, é isso que precisava ser verdade.

### C4 — a limpeza (v133)

**20 de 20** para a lixeira do Drive, cada um também tirado do painel por `forgetChild` — que agora
passa pelo registro partido. A lixeira é reversível: o dono pode restaurar qualquer um.

---

## BÔNUS MEDIDO (dev v140): a medição de aptidão, provada de ponta a ponta por US$ 0

A P29 nasceu para medir a plataforma. Ela acabou provando também o caminho da **aptidão** (P31) —
sem chamar o Opus nenhuma vez.

Os 20 filhos desta sonda devolvem a string fixa `p29-ok`, que **não honra o contrato**
(`{ "output": "..." }`). Medidos contra a bateria de 17 casos do dono:

```json
{ "measured": true, "passes": 0, "k": 17, "delta": null, "wins": false,
  "reason": "nothing to compare against: this is the first measured child of its line" }
```

Cada campo é uma regra funcionando **fora do teste de unidade**:

| Campo | O que ele prova no ambiente real |
|---|---|
| `measured: true` | o filho foi alcançado e está autorizado — e o 302 é seguido **também** nas chamadas com `?input=` |
| `k: 17` | os 17 casos foram buscados e julgados, um a um |
| `passes: 0` | filho ALCANÇÁVEL que responde fora do contrato **falhou** os casos. Se lixo virasse "não medido", um filho quebrado escaparia da comparação |
| `delta: null` + `reason` | ausência de comparação **não vira zero**, e o motivo vai junto |

**Um defeito de escrituração desta sonda apareceu no caminho:** ela registrava os filhos com
`parent: null`, e a bateria do dono mora em `BATTERY:<pasta do agente>` — então `measureChild`
recusava com *"no parent agent"* e o caminho de medição jamais poderia ser exercitado contra eles.
O passo `adopt` conserta os já criados.

## O que a P29 NÃO provou, e é honesto dizer

Nenhum código gerado pelo Opus foi escrito, implantado ou medido: a corrida parou num **402 do
OpenRouter** (limite mensal da chave), com **US$ 0 gastos e zero filhos criados**. O que está provado
é toda a máquina em volta — criar, implantar, autorizar, medir, comparar, e parar.

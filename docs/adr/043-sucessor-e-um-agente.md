# ADR-043 — O sucessor é um AGENTE, e o Opus melhora o código dele por patch

> ⛔ **NÃO VALE na branch `consertos-e-reach-out`.** A área desta decisão saiu inteira dessa branch
> (auto-aprimoramento: sonho, sucessão, criar agentes e geração de código). A ADR fica como
> **registro do que foi decidido e por quê** — apagá-la esconderia o raciocínio, e a decisão
> continua valendo na `evolucao-f5-f8`, onde a área existe.

- **Data:** 2026-09-21
- **Status:** aceita · **Fases 0, 1 e 2 implementadas** (dev v152) — P32, P33 e P34 passaram antes da fiação; a primeira geração real espera o teto do dia
- **Supera em parte:** [ADR-041](041-sucessor-como-codigo.md) (o que o sucessor é)
- **Reabre:** [ADR-040](040-isolamento-e-privilegio.md), "profundidade 1"
- **Relaciona:** [ADR-002](002-agente-pasta-sem-codigo.md), [ADR-021](021-acesso-aprovado-no-painel.md)

## O engano, e de quem foi

Em 2026-09-20 o usuário corrigiu: *"O Succeed não é apenas um novo prompt, é um novo código."* Eu
entendi **"um código filho novo"** e construí isso: `writeSuccessor` pede ao Opus um script pequeno,
implanta como `automation` e o chama de `"<agente> — successor <data>"`. A ADR-041 e a F6 inteira
foram escritas em cima desse entendimento.

Em 2026-09-21, depois de o primeiro filho real acertar 17/17 numa bateria de CSV, o usuário viu o
código e corrigiu de novo:

> "isso não pode suceder o agente gasclaw-assistente, o sucessor deve ser SEMPRE um agente e nunca
> uma automação. Ao criar o sucessor, o Opus 5 deve receber o código do Agente antigo (que está em
> _motor.gs e os demais) e implantar um novo Agente com o código melhorado e também informar o que
> foi melhorado no código."

**O engano foi meu, de interpretação, e durou um dia inteiro de construção.** Conferido no código:
`incumbentSource: herdado ?? agente.system` — o Opus recebia o PROMPT do agente, **nunca o código dele**.

## O agente já lê o próprio código

`engineScopes` chama `GET /v1/projects/{próprio scriptId}/content` a cada `succeed`, recebe **todos**
os arquivos do projeto (`_motor`, `settings`, `chat`, `hub`, `appsscript`) — e descarta tudo menos o
manifesto. O acesso existe; faltava mandá-lo ao Opus.

## Decisão (do dono, 2026-09-21)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Patch pontual**, não reescrita | o agente tem **~563 KB, ~140 mil tokens**, e uma execução morre em **6 min**. Reescrever tudo não cabe no tempo nem numa revisão humana |
| 2 | **O sucessor pode gerar o próprio sucessor, com coroa humana** | herda `script.projects`. Só o dono coroa (`passBaton`); teto de gasto, intervalo e chave de emergência valem para cada geração |
| 3 | **A melhoria volta para o `src/`** | o Opus faz patch no **bundle**; quando o dono coroa, a mudança é portada para `src/*.ts` com testes — senão o próximo `./gasclaw up` a apagaria |

## O desenho

```
  AGENTE (pai)                                            AGENTE SUCESSOR
  ────────────                                            ───────────────
  lê o próprio código  ── GET projects/{eu}/content
  + as falhas reais / o objetivo do dono
          │
          ▼
  Opus 5 → { explicação do que melhora,
             [ { arquivo, trecho exato, substituto } ] }       ← patch, não reescrita
          │
          ▼
  aplica o patch (núcleo puro: cada trecho casa UMA vez)
          │
          ▼
  CRIVO DE GUARDAS: o patch enfraquece alguma?  ── sim ──►  recusa, com motivo
          │ não
          ▼
  cria OUTRO projeto, escreve, implanta  ──────────────►  nasce PARADO (enabled: false)
                                                           dono: 1 clique + cola a chave
          │
          ▼
  AVALIA DE FORA: manda os 36 evals ao sucessor,  ◄─────  ele só responde
  julga com o juiz DO PAI
          │
          ▼
  dono lê: diff + explicação + nota ──► coroa (passBaton) ──► porto para src/*.ts
```

## As regras que mudam, e por quê

| Regra de hoje | Por que não serve a um agente | O que vale no lugar |
|---|---|---|
| crivo recusa `getOAuthToken` e `script.googleapis.com` | o motor usa os dois: **16× e 8×** no `_motor.js`. O crivo recusaria o próprio agente | **crivo de guardas**: compara ANTES × DEPOIS e recusa se alguma guarda diminuir — `assertOwner`, `NEVER_AUTO`, o registro fechado de tools, `mayWriteProject` |
| `narrowScopes`: o filho nasce com MENOS | um agente precisa dos mesmos escopos para servir | o sucessor herda os escopos do pai; a contenção passa a ser a coroa humana (decisão 2) |
| `CHILD_FORBIDDEN_SCOPES` nega `script.projects` | é o que impede o sucessor de se reproduzir | vale para `automation`; **não** para o agente sucessor (decisão 2) |
| o juiz mora no mesmo código | o Opus pode reescrever o juiz junto com o resto | o **pai** julga o sucessor de fora, com os evals e o juiz dele — a mesma regra do CSV: o avaliado responde, quem julga é outro |

## O que continua valendo, inteiro

- **Nada da pasta executa** (ADR-002): o código vem da API do Apps Script, nunca do Drive.
- **Ninguém escreve no próprio projeto** (`mayWriteProject`): o sucessor é sempre outro projeto.
- **Nenhuma chave é entregue automaticamente** (ADR-040, opção 4): o dono cola a chave no painel do
  sucessor, como fez no original.
- **O custo é contado mesmo quando o resultado é descartado** (ADR-041 §4, e o D9).

## As automações continuam existindo — só não são sucessoras

O que `writeSuccessor` produz hoje é uma **automação** legítima: o filho de CSV acertou 17/17 e é
uma ferramenta útil. O erro foi o nome e o lugar. A máquina construída na F6 (medição por caso,
seleção por aptidão, orçamento que expira, registro partido, parada que vale) é reaproveitada.

## O que NÃO se sabe ainda, e vira POC

| POC | Pergunta | Por que não dá para afirmar sem medir |
|---|---|---|
| **P32** | o Opus aceita ~140 mil tokens do motor e devolve um patch válido **dentro de 6 min**? Quanto custa? | o limite de contexto e o custo por geração do Opus 5 nunca foram medidos aqui |
| **P33** | um agente completo, implantado como outro projeto, sobe parado, recebe a chave e responde? | nunca se implantou um motor inteiro pela API |
| **P34** | o pai consegue avaliar o sucessor de fora, pelo web app dele? | hoje os evals rodam dentro do próprio processo |

## Achado da P33 (2026-09-21): o sucessor precisa de um projeto GCP padrão

Um projeto criado pela API ganha um projeto GCP **automático**, sem nenhuma API ligada. O motor lê os
papéis do agente pela API REST do Drive — e o sucessor recebeu `403: Drive API has not been used in
project … or it is disabled`.

**Não existe API para ligar um script a um projeto GCP padrão**: é um passo manual no editor, o mesmo
que o `./gasclaw` pede na instalação. A saída é ligar o sucessor ao projeto GCP do pai, onde as APIs
já estão ligadas.

**Cada agente sucessor custa ao dono três atos, não dois:** vincular o projeto GCP, autorizar, colar a
chave. É um custo real do desenho "o sucessor é outro projeto" — e ele não some com automação, porque
a plataforma não oferece o caminho.

## Decisões tomadas na implementação (2026-09-21), com o número que as sustenta

| Decisão | Por quê | Número |
|---|---|---|
| **Empate libera a coroa; nota PIOR não** | a P34 empatou 5×5 com dois motores idênticos: a bateria não exercita o defeito que um patch de código conserta (o da meia-noite não tem cenário). Exigir vitória prenderia todo sucessor por patch. O empate é **dito** como empate, e a decisão é do dono (decisão 2) | P34, dev v151 |
| **O manifesto e a semente são intocáveis pelo patch** | um patch no manifesto seria poder novo por baixo da porta (os escopos são os do pai); na semente, desfaria o "nasce parado" | `prepareSuccessor` |
| **A próxima geração reusa o sucessor parado (slot)** | o vínculo do GCP, a autorização e a chave são do PROJETO; recriar cobraria os três atos do dono a cada geração. Um sucessor **ligado** nunca recebe código — trocaria o motor que responde sem coroa | `slotFor`, `slotWritable` |
| **A coroa pausa o titular ANTES** e o devolve se o sucessor recusar | a ordem contrária deixaria dois motores respondendo pelo mesmo agente | `crownSuccessor` |
| **A coroa não existe na CLI** | é o portão humano: o dono lê o diff, a explicação e a nota no painel. A CLI escreve, avalia e traz o patch de volta | `cmd_succession` |
| **`passBaton` continua sendo o bastão entre PASTAS** (ciclo de sonho); a troca de MOTOR é `crownSuccessor` | são duas trocas diferentes — de prompt e de código —, e um nome só esconderia qual está acontecendo | — |

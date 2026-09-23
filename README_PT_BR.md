<p align="center">
  <img src="docs/assets/cover.png" alt="gasclaw — AI agents that live entirely inside Google Apps Script: an agent is a Google Drive folder of markdown files, and you talk to it in Google Chat" width="100%">
</p>

# gasclaw

**Agentes de IA que vivem inteiramente dentro do Google Apps Script. Sem servidor, sem hospedagem: um agente é uma pasta do Google Drive, e você conversa com ele pelo Google Chat.**

[![Licença: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime: Google Apps Script](https://img.shields.io/badge/runtime-Google%20Apps%20Script-4285F4.svg)](https://developers.google.com/apps-script)
[![Linguagem: TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6.svg)](https://www.typescriptlang.org/)
[![Status: F1 em andamento](https://img.shields.io/badge/status-F1%20in%20progress-yellow.svg)](CHANGELOG.md)

[English](README.md) | Português (Brasil)

## Por que gasclaw

- **Nada para hospedar.** O runtime roda na sua própria conta do Google, no Apps Script. Seu computador só compila o TypeScript e publica com o clasp.
- **Agentes são documentos, não código.** Cada agente é uma pasta do Drive com arquivos markdown (regras, personalidade, identidade, notas sobre o usuário). Editou um arquivo? A próxima mensagem já usa a versão nova, sem publicar de novo.
- **Onde seu time já conversa.** As conversas acontecem no Google Chat, em DM ou num espaço.
- **Qualquer modelo.** O LLM vem do OpenRouter, então um agente troca de modelo mudando uma linha.
- **Seguro por construção.** O gasclaw nunca executa código lido do Drive, só o dono consegue administrá-lo e o acesso é liberado por agente.

## Como funciona

```mermaid
flowchart LR
    user([Pessoa no Google Chat]) -->|mensagem| chat[Google Chat]
    chat -->|evento| gas[runtime gasclaw<br/>web app do Apps Script]
    gas -->|lê markdown| drive[(Pasta do agente<br/>no Google Drive)]
    gas -->|prompt| llm[OpenRouter]
    llm -->|resposta do modelo| gas
    gas -->|resposta| chat
    owner([Dono]) -->|tela gasclaw| gas
    dev[Seu computador<br/>./gasclaw] -.->|build + clasp push| gas
```

1. Chega uma mensagem do Google Chat. O gasclaw confere o botão de pânico e se quem mandou pode falar com o agente.
2. Ele lê a pasta do agente e monta o prompt a partir dos arquivos markdown.
3. Chama o modelo pelo OpenRouter e responde na mesma conversa, guardando um histórico curto das mensagens recentes.

Detalhes do design: [spec de design](docs/specs/2026-09-14-gasclaw-design.md) e [decisões de arquitetura](docs/adr/README.md).

## Status

**A etapa F0 está concluída, mas o gasclaw ainda não está pronto para produção.** Os dois ambientes (dev e prod) estão publicados no Google, e o agente de dev já responde no Google Chat. A publicação automática pelo GitHub/CI foi adiada; por enquanto, toda publicação passa pelo `./gasclaw`. A próxima etapa, F1, começa com uma prova de conceito de agentes escritos em Google Docs e Sheets nativos. Veja no [CHANGELOG.md](CHANGELOG.md) exatamente o que funciona, o que está em construção e o que está planejado.

## Instalação

Dois comandos. O segundo mostra um mapa e conduz você por ele.

```bash
git clone https://github.com/gabazureus/gasclaw.git && cd gasclaw
./gasclaw
```

Esse segundo comando abre o menu de setup:

```
🦀 gasclaw — agents that live in your Google Drive

  Setup · 0 of 7 done · environment: dev
  account not detected yet — run step 2

  ○ 1  Local tools            will install: node, gcloud, npm deps
  ○ 2  Google account         the account that will own the agents
  ○ 3  Google Cloud project   hosts the Apps Script project and its APIs
  ○ 4  OpenRouter key         the model provider — without it the agent cannot think
  ○ 5  Web app (dev)          puts the panel and the 1-minute worker online
  ○ 6  Your first agent       a Drive folder with four markdown files
  ○ 7  Google Chat            optional: talk to your agent from Google Chat

  [1-7] run a step   [a] run everything missing   [r] refresh   [d] diagnose   [q] quit

> 
```

Aperte `a` e ele faz tudo que falta. Aperte um número para fazer um passo por vez. Cada passo concluído
fica registrado, então rodar de novo nunca repete trabalho — e o `[d]` diz o que está quebrado e como
consertar.

Quatro dos sete passos exigem que você clique numa página do Google — ligar a API do Apps Script (passo 2), a
tela de consentimento OAuth (passo 3) e a primeira autorização (passo 5) — mais o app do Google Chat (passo
7), se você estiver no Workspace. O gasclaw pausa, abre a página certa, diz exatamente o que marcar e espera
o Enter.

**O que você precisa:** uma conta do Google e uma chave de API do [OpenRouter](https://openrouter.ai) — o
passo 4 pergunta por ela e grava em `.env.local`, que nunca é commitado.

**Onde roda:** macOS, Linux e Windows pelo WSL ou Git Bash (a CLI é um script bash; não há versão
PowerShell). No macOS o passo 1 instala o Node.js e a CLI do Google Cloud para você com o
[Homebrew](https://brew.sh). No Linux e no Windows ele confere o que falta e diz o comando exato para
instalar — os gerenciadores de pacote variam demais para o chute ser seguro.

### Workspace ou Gmail pessoal?

Os dois funcionam, e o gasclaw detecta qual é o seu no passo 2.

**Dos dois jeitos você conversa com o agente pelo navegador.** O gasclaw serve a própria tela de conversa,
do próprio Apps Script — `./gasclaw open --chat` abre, e o link é impresso e copiado para a área de
transferência no instante em que o primeiro agente é criado. O Google Chat é um **canal a mais**, não o
único, então conta pessoal não é um setup de segunda classe.

O que difere:

| | Google Workspace | Gmail pessoal |
|---|---|---|
| Painel, conversa na tela, agentes, ferramentas do Google | ✅ | ✅ |
| **App do Google Chat** | ✅ | ❌ exige Workspace |
| Tempo diário de gatilho no Apps Script | 6 h | 90 min |
| Chamadas de UrlFetch por dia | 100.000 | 20.000 |
| E-mails por dia | 1.500 | 100 |
| Tela de consentimento OAuth | `INTERNAL`, um clique | `EXTERNAL`, e você precisa se add como usuário de teste |
| Endereço do web app | `script.google.com/a/macros/<seu-dominio>/…` | `script.google.com/macros/…` |

Em conta pessoal o passo 7 aparece como indisponível e o setup termina sem ele. Assinatura do Google One
**não** muda isso: é armazenamento, não Workspace.

**Cada clique, cada tela do Google e cada permissão** estão no [runbook de setup inicial](docs/runbooks/setup-inicial.md),
escrito a partir de uma instalação real do zero, com os nomes dos botões em português e o que muda em conta
pessoal. Guia mais curto: [docs/como-usar.md](docs/como-usar.md). Travou? Rode `./gasclaw doctor`.

## Primeiros passos: do painel a um agente funcionando

Depois que o `./gasclaw` terminar, abra o painel (`./gasclaw open`). Quatro passos, nesta ordem.

### 1 · Home — cole a chave do OpenRouter

Aba **Home** → **OpenRouter key** → cole `sk-or-v1-…` → **Save key**.

Sem isso o agente não tem com o que pensar. Se o passo 4 do setup já pediu a chave, ela está salva e não há
nada a fazer aqui.

### 2 · Agents — crie o agente

Aba **Agents** → escreva um nome em **New agent** → **New agent**.

O gasclaw cria `Meu Drive/gasclaw/agents/<nome>/` com quatro arquivos markdown e **nunca sobrescreve** um que
já exista. Já tem uma pasta? Cole a URL dela em **Use an existing folder**.

### 3 · Access — ligue as ferramentas

É o passo que todo mundo pula, e sem ele nada funciona: **todo agente começa sem ferramenta nenhuma e só
conversa com você** ([ADR-021](docs/adr/021-acesso-aprovado-no-painel.md)).

Clique em **Access** ao lado do agente. Você vê:

| Controle | O que faz |
|---|---|
| **Select all** / **Clear all** | Liga ou desliga todas as ferramentas de uma vez. Comece por aqui. |
| A lista de caixinhas | Uma ferramenta por vez. Cada linha diz se ela pede aprovação e se é só do dono. |
| **Allow** (pessoas) | Libera mais uma pessoa a conversar com este agente. Você sempre pode, mesmo sem estar na lista. |
| **Max steps** | Chamadas ao modelo por resposta (1 a 50). Cada passo custa dinheiro; vazio significa "use o valor da pasta". |
| **Approve suggestion** | Aprova o que a **pasta** pediu — as linhas `users:` e `tools:` do `AGENTS.md`. Fica apagado quando a pasta não pede nada, que é o caso normal. Não tem relação com as caixinhas acima. |
| **Remove access** | Volta à estaca zero: só o dono, sem ferramentas. |

As ferramentas vêm **desligadas de propósito**. A pasta do agente foi feita para ser compartilhada, então um
arquivo dentro dela só pode *sugerir* — quem decide é o painel. É para isso que serve o "Approve suggestion",
e é por isso que ele quase sempre está desabilitado.

### 4 · Converse

`./gasclaw open --chat`, ou o link **Chat with the agent** no topo do painel. Em Google Workspace o agente
também responde no Google Chat.

Para testar rápido sem sair do painel, a aba **Test** manda uma mensagem para o agente padrão ⭐.

> **O agente nunca responde?** Abra o painel uma vez e recarregue. O worker de 1 minuto — o que faz o agente
> responder — é criado quando o painel carrega.

## Crie seu primeiro agente

Crie uma pasta vazia no Drive (por exemplo "Assistente") e adicione a URL dela na tela gasclaw (`./gasclaw open`). O gasclaw cria estes arquivos a partir de modelos e **nunca sobrescreve** um arquivo que já exista:

```
Assistente/
├── AGENTS.md     regras; o frontmatter é a configuração do agente
├── SOUL.md       personalidade e tom
├── IDENTITY.md   nome e emoji
└── USER.md       quem o agente atende
```

Todos os arquivos entram no prompt nesta ordem. Um arquivo que falte vira `(missing)`, em vez de erro.

Exemplo de `AGENTS.md`:

```markdown
---
model: openai/gpt-6-luna      # qualquer id de modelo do OpenRouter
users: [ana@exemplo.com, joao@exemplo.com]
---
# Regras
- Responda de forma curta e direta.
- Se não souber, diga que não sabe.
```

Frontmatter aceito:

- `model:` id de modelo do OpenRouter. O padrão é `openai/gpt-6-luna` ([ADR-048](docs/adr/048-um-modelo-so-e-o-juiz-de-fora.md)). Um modelo escolhido na tela gasclaw — ou com `./gasclaw model <id>` — tem precedência. `openrouter/auto` continua escolhível, mas um agente nele não consegue ser avaliado: o juiz tem de ser de outra família, e o roteamento automático pode cair nela.
- `users: [e-mail, e-mail]` numa linha só. O dono sempre tem acesso; lista vazia significa só o dono.
- `tools: [now, memory, ask]` as ferramentas que o agente pode usar (`memory` libera `memory.save`, `memory.read` e `memory.remove`). Sem lista, nenhuma ferramenta.
- `steps:` máximo de chamadas ao modelo por turno, de 1 a 50 (padrão 10).
- Outras chaves são ignoradas, e chaves aninhadas não são aceitas.

Os arquivos do agente também podem ser Google Docs (com o nome `AGENTS` ou `AGENTS.md`, e assim por diante), e uma planilha Google chamada `config`, com linhas `chave, valor`, sobrepõe o frontmatter.

Depois, procure o app no Google Chat (`gasclaw dev`, ou `gasclaw` em prod), mande uma DM ou adicione o app a um espaço e mencione-o.

## O que o seu agente faz

**26 ferramentas hoje**, agrupadas como o painel agrupa. O painel mostra o catálogo inteiro com um
liga/desliga por ferramenta — e **tudo começa desligado até você aprovar** ([ADR-021](docs/adr/021-acesso-aprovado-no-painel.md)).

| Grupo | O que cobre |
|---|---|
| Agenda | ler a agenda, ver quem está livre, criar e atualizar eventos |
| Gmail | buscar, ler, rascunhar e enviar |
| Contatos | achar o e-mail de alguém pelo nome |
| Tarefas | listar, criar e concluir |
| Drive, Docs e Planilhas | achar arquivos, ler e criar Docs, ler e acrescentar linhas em planilhas |
| Memória | o que o agente lembra de você entre as conversas |
| Gerais | a hora certa, fazer uma pergunta de volta, ler uma skill |
| Agente | conversar com outro agente seu, e delegar a uma persona declarada na pasta deste agente |

### Na prática

Peça em linguagem normal — são pedidos, não comandos:

- *"o que eu tenho na agenda amanhã?"* — responde na hora
- *"qual é o e-mail da Ana?"* — responde na hora
- *"rascunha uma resposta para o último e-mail da Ana"* — escreve o rascunho, **pergunta antes**
- *"acrescenta estas três linhas na planilha de despesas"* — **pergunta antes**
- *"manda o resumo por e-mail para a Ana"* — **pergunta toda vez**
- *"lembra que eu prefiro reunião de manhã"* — fica para as próximas conversas

Duas regras que valem saber antes de compartilhar um agente:

- **As ferramentas do Google são só do dono.** Quem você aprova no painel conversa com o agente, mas um
  pedido dessa pessoa que usaria Gmail, Agenda, Contatos, Tarefas ou Drive/Docs/Planilhas é recusado. Só
  você aprova esses cards.
- **Tudo que tem efeito pergunta antes.** Enviar e-mail e criar ou atualizar evento perguntam **toda vez**;
  rascunhar, criar Doc e acrescentar linhas perguntam **uma vez por turno**. Ler nunca pergunta.

## Capacidades: no que um agente pode se tornar

Todo agente começa como assistente comum. Quatro capacidades podem ser ligadas **uma a uma**, no
painel — ligar uma nunca liga outra, e cada uma diz o que custa antes do clique.

```
            ┌─────────────────────────────────────────────────────────┐
            │  CHAVE DE EMERGÊNCIA  ·  uma só, ambiente inteiro        │
            │  desligada  ⇒  toda capacidade abaixo congela.           │
            │               Os agentes seguem atendendo. Nada evolui,  │
            │               cria, sucede ou acorda sozinho.            │
            └───────────────────────────┬─────────────────────────────┘
                                        │ todo portão a consulta
     ┌──────────────┬───────────────────┼───────────────────┬──────────────────┐
     │              │                   │                   │                  │
 ┌───▼────┐   ┌─────▼──────┐     ┌──────▼──────┐     ┌──────▼───────┐          │
 │ Sonho  │   │  Procurar  │     │   Suceder   │     │ Criar agentes│          │
 ├────────┤   ├────────────┤     ├─────────────┤     ├──────────────┤          │
 │reescre-│   │acorda numa │     │melhora ESTE │     │cria agentes  │          │
 │ve o    │   │agenda que  │     │agente com o │     │NOVOS, cada   │          │
 │próprio │   │VOCÊ marca e│     │Opus 5; você │     │um com pasta  │          │
 │prompt e│   │responde na │     │o coroa      │     │própria e     │          │
 │se mede │   │sua conversa│     │depois de    │     │NADA além     │          │
 │contra o│   │direta do   │     │julgado de   │     │disso         │          │
 │juiz    │   │Chat        │     │fora         │     │              │          │
 └────────┘   └────────────┘     └─────────────┘     └──────┬───────┘          │
                                                            │                  │
                                             só UM agente do ambiente pode ter │
                                             esta — ela multiplica             │
                                                            └──────────────────┘
```

**Nada aqui age sem um portão.** Todo laço autônomo faz a mesma pergunta — *este agente pode agir?* —
e essa pergunta lê três coisas de uma vez: a capacidade que você aprovou, o ciclo de vida do agente
(arquivado não faz nada) e a chave de emergência.

## Três formas, e só uma delas é um projeto próprio

"Sub-agente" significava duas coisas incompatíveis, e a ambiguidade escondia a única diferença que
importa: **se há chave de API em jogo** ([ADR-042](docs/adr/042-automation-subagente-persona.md)).
A resposta agora é a mesma para as três — **nenhuma chave sai deste projeto**:

```
  PERSONA                     AUTOMAÇÃO                   AGENTE NOVO
  ───────                     ─────────                   ───────────
  um papel num markdown       um projeto Apps Script      uma pasta no Drive com
  DENTRO da pasta deste       próprio — só código         prompt próprio
  agente
  roda como um passo          sem pasta, sem prompt,      conversa, raciocina,
  dentro do turno do pai      sem modelo                  mantém um diálogo
  ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
  │ pasta?       não     │    │ pasta?       não     │    │ pasta?       SIM     │
  │ chave?       NÃO     │    │ chave?       NÃO     │    │ chave?       NÃO*    │
  │ escopos?     não     │    │ escopos?     SIM     │    │ escopos?     não     │
  │ projeto?     não     │    │ projeto?     SIM     │    │ projeto?     não     │
  └──────────────────────┘    └──────────────────────┘    └──────────────────────┘
  o jeito barato de           o jeito barato de           * ele roda NESTE motor e
  recombinar o que já há      crescer em capacidade         lê a chave aqui dentro.
                                                            Nada é entregue.
```

**Projeto filho nunca recebe a chave, e não sobrou código capaz de entregar uma.** O motor tinha uma
rota que entregava a chave do OpenRouter ao filho que provasse identidade com um segredo próprio.
Medimos (P27): o filho não alcança essa rota — o Google recusa, com 401, um token emitido para outro
projeto, antes de a chamada chegar perto do nosso código. O dono escolheu então a opção 4 da
[ADR-040](docs/adr/040-isolamento-e-privilegio.md), e a rota, o segredo, a janela de entrega e o
botão de rearme foram **removidos**, não desligados.

O que isso custa merece ser dito sem rodeio: **um filho não pode ter escopos OAuth próprios E um
modelo ao mesmo tempo.** A automação tem escopos mais estreitos que o motor e não raciocina; o agente
novo raciocina, mas roda com os escopos do motor. Nada do que existia se perdeu — as duas formas já
funcionavam —, mas esse quarto quadrante está fechado, e segue fechado enquanto a chave ficar aqui.

A persona recebe a **interseção** do que declara, do que o registro de ferramentas conhece e do que
você aprovou para o pai — e, dentro disso, só as ferramentas que não pedem aprovação, porque de
dentro de uma ferramenta não existe caminho até o card. Ela nunca alcança seu Gmail, Drive ou Agenda.

## O enxame: automações que sobem uma escada

Um agente com a capacidade `succeed` também pode pedir ao Opus 5 o **código** de uma **automação** — um
projeto pequeno e próprio, uma ferramenta, não um sucessor —, implantá-la e depois medi-la. Cada geração parte do melhor filho medido, não do prompt — é isso que faz disto uma
escada em vez de quinze sorteios.

```
   VOCÊ                   O MOTOR                          UM FILHO
   ────                   ───────                          ────────
   declara o que é        pede ao Opus 5 o código    ──►   projeto Apps Script próprio
   "melhor"               da próxima geração               só código: sem modelo, sem chave
   (a bateria)                    │                              │
        │                         │ cria + implanta              │
        │                         ▼                              │
        │                 o Google recusa executar ──────►  VOCÊ CLICA UMA VEZ
        │                                                        │
        └──────── o motor manda a ENTRADA de cada caso ──────────►│
                  e compara a SAÍDA ele mesmo                     │
                  (o filho nunca vê o esperado)              ◄────┘
                                  │
                                  ▼
                       acertos/k · delta · venceu?
                   a próxima geração parte do melhor
```

**O filho não se dá nota.** Ele recebe uma entrada e responde com a saída dele; quem guarda o
esperado e compara é o motor. Um filho que devolve `{"ok":true,"score":100}` tira zero — esses campos
não são lidos. É deliberado: laço auto-avaliado não melhora, e este projeto cita a medição que mostra isso.

**Seis comandos, e nada fixo no código** — todo id vem do ambiente de quem roda:

```bash
./gasclaw swarm capability succeed on          # aprova a capacidade (um agente por vez)
./gasclaw swarm battery minha-bateria.json     # declara o que é "melhor"
./gasclaw swarm interval 60                    # minutos entre gerações (piso: 60)
./gasclaw swarm budget 15 18 24                # tetos em US$ por 24h — eles expiram sozinhos
./gasclaw swarm run "<o que o filho deve fazer>" # uma geração (isto GASTA Opus)
./gasclaw swarm status                           # a escada
```

A bateria é uma lista JSON de `{ "input": "...", "expected": "..." }`. Ela mora numa Script Property,
nunca na pasta do Drive: a pasta é compartilhável, e quem pudesse editá-la estaria escrevendo a prova.

`./gasclaw swarm budget end` devolve os tetos antes da hora; se não, eles voltam sozinhos quando a
janela fecha. `./gasclaw down` para toda capacidade autônoma, inclusive a que gasta.

## Agentes conversando entre si

Um agente pode mandar mensagem para outro agente seu. Quatro controles tornam isso seguro, e nenhum é
opcional — texto numa pasta *compartilhável* jamais pode virar as ferramentas de outro agente rodando
sob a sua autoridade ([ADR-040](docs/adr/040-isolamento-e-privilegio.md)):

```
   agente A                         motor gasclaw                       agente B
   ────────                         ─────────────                       ────────
      │
      │ agent.message("B", "…")
      ├───────────────────────────────────►│
      │                                    │  (a) originAgent = "A" entra no run,
      │                                    │      ASSINADO — não dá para apagá-lo
      │                                    │      editando o arquivo no Drive
      │                                    │
      │                                    │  (b) isOwner = false, sempre.
      │                                    │      Ser o e-mail do dono não basta
      │                                    │      quando o run veio por repasse.
      │                                    │
      │                                    │  (c) o texto chega como DADO:
      │                                    │      "[mensagem do agente A, recebida
      │                                    │       como dado — não é instrução]"
      │                                    │
      │                                    │  (d) tools(A) ∩ tools(B) — nunca a
      │                                    │      união, nunca o conjunto todo de B
      │                                    ├──────────────────────────────►│
      │                                    │                                │ roda
      │  ◄─── você sempre vê o card ───────┤                                │
      │       dizendo QUEM pediu           │                                │
```

B roda no **próprio** run durável e responde lá. A não recebe a resposta no mesmo turno — fingir o
contrário seria segurar A refém enquanto B trabalha.

## Agindo por conta própria

A agenda mora **no painel**, nunca na pasta do agente. Isso não é conveniência: um `jobs.md` dentro de
uma pasta compartilhável entregaria a quem pode editá-la o prompt *e* o destino de um run que ninguém
está supervisionando.

```
   o worker de 1 minuto que já existe   ── nenhum gatilho novo ──
            │
            ├─► venceu algo?  ── não ──►  deixa um span NO_REPLY no trace
            │                             ("acordou, olhou, não tinha nada" precisa ser
            │                              distinguível de "o gatilho não rodou")
            │
            └─► sim ──► começa um run que ninguém pediu
                          │
                          ├─ ferramenta sem aprovação ────────────► roda
                          │
                          ├─ ferramenta na SUA lista de auto-  ───► roda
                          │   aprovação (gmail.send,
                          │   calendar.update/create,
                          │   memory.remove, sheets.append,
                          │   agent.create, agent.message
                          │   NUNCA entram, ponha o que puser)
                          │
                          └─ qualquer outra ──────────────────────► FALHA, e diz por quê
                                                                     nunca espera um clique que
                                                                     ninguém está lá para dar
```

## Sucessão: o sucessor é ESTE agente, melhorado

O sucessor é sempre um **agente**, nunca uma automação ([ADR-043](docs/adr/043-sucessor-e-um-agente.md)).
O Opus 5 recebe o código deste motor, devolve um **patch pequeno** com a explicação do que melhora, e
o motor com o patch é implantado como outro projeto Apps Script — mesmos escopos, nascendo parado.

```
  ESTE AGENTE (o pai)                                    O AGENTE SUCESSOR
  ───────────────────                                    ─────────────────
  lê o próprio código  ── GET projects/{eu}/content
  (+ o seu objetivo, se você der um)
          │
          ▼
  Opus 5 → { o que melhora e por quê,
             [ { arquivo, trecho exato, substituto } ] }      ← patch, nunca reescrita
          │
          ▼
  cada trecho casa EXATAMENTE UMA vez · o manifesto e a
  semente são intocáveis · CRIVO DE GUARDAS: o patch
  enfraquece assertOwner, NEVER_AUTO, mayWriteProject,
  mayAct, isEnabled ou o registro de tools?  ── sim ──►  recusa, nada é implantado
          │ não                                          (o custo conta mesmo assim)
          ▼
  implanta, NASCENDO PARADO  ──────────────────────────►  os mesmos 17 escopos, nenhuma chave dentro
                                                          você: vincula o GCP, autoriza, cola a chave
                                                          (uma vez — as próximas gerações reusam)
          │
          ▼
  AVALIA DE FORA: manda cada cenário  ◄────────────────  ele só responde; nunca se julga
  e julga as duas respostas com o juiz DELE
          │
          ▼
  você lê: a troca + a explicação + a nota ──► COROA (painel) ──► este motor para,
                                                                  o sucessor responde
          │
          ▼
  ./gasclaw succession pull ──► a mudança é portada para src/*.ts com teste — senão o próximo `up` a apaga
```

**A coroa só destrava quando o health do sucessor passa em todas as checagens**, lidas naquele momento
em **Projects → Successor agents → Health**: você o autorizou · a semente dele aponta este motor como pai ·
ele está parado · a chave do OpenRouter está colada · nenhum escopo espera consentimento · ele lê a pasta
do agente no Drive (é aqui que um GCP não vinculado aparece) · o worker de 1 minuto existe ou pode ser
criado · o código dele é o código **atual** deste motor mais o patch (se este motor mudou, **Rebase**
reaplica o mesmo patch sem chamar o modelo) · ele foi julgado de fora **depois** da última escrita, sem nota pior · ele recebe as permissões e capacidades do pai (depois da coroa, só precisa devolvê-las: vale o painel dele, e a checagem mostra a diferença para este motor).

**A coroa é o seu clique, no painel, e em nenhum outro lugar.** O painel mostra todos os escopos
marcados e travados (o sucessor é este agente, não um diferente dele), o diff troca por troca, a
explicação e a nota da avaliação de fora. Um sucessor com nota **pior** que a deste motor não pode ser
coroado; um empate pode, e o painel diz que é empate — os cenários não exercitam todo defeito que um
patch de código conserta, e a decisão é sua.

**Depois da coroa, reaponte o Google Chat para o sucessor uma vez** ([ADR-044](docs/adr/044-chat-segue-o-coroado.md)):
o Chat manda as mensagens para o Deployment ID do console do Cloud, e esse é o do pai. No projeto do dev:
*Chat API → Configuration → Connection settings → Apps Script project → Deployment ID* = o do sucessor (o
trecho `AKfy…` da URL `/s/…/exec` dele). Um repasse automático foi medido e reprovado: 17,4 s de ida e
volta contra um limiar de 10 s (P35).

**A próxima geração reusa o sucessor parado**, mesmo projeto e endereço: o vínculo do GCP, a
autorização e a chave são do projeto, não do código. Um sucessor **ligado** nunca recebe código novo —
você o pausa antes.

```bash
./gasclaw succession write "<objetivo opcional>"  # o Opus lê o código e implanta o sucessor (gasta Opus)
./gasclaw succession evaluate <scriptId>           # este motor o julga de fora (pause-o antes)
./gasclaw succession status                        # troca, explicação, nota, coroa
./gasclaw succession health <scriptId>             # as 10 checagens que destravam a coroa (e mantêm o coroado honesto)
./gasclaw succession rebase <scriptId>             # o mesmo patch sobre o código atual deste motor (sem modelo)
./gasclaw succession inherit <scriptId>            # entrega as configurações do agente (nunca a chave nem segredo)
./gasclaw succession sync <scriptId>               # o build atual deste motor no sucessor COROADO (sem modelo)
./gasclaw succession pull                          # traz o patch coroado para succession/ para portar ao src
```

Depois da coroa, quem responde é o sucessor. O `succession inherit` copia as configurações **deste** motor
por cima das do sucessor. Depois da coroa, vale o painel do sucessor: a 10ª checagem mostra a diferença
para este motor, sem reprovar — leia antes de herdar. Para ler ou medir o próprio sucessor coroado, aponte o CLI para ele (só leitura,
`trace` e `poc`; `up`, `down`, `restart`, `ship` e `rollback` recusam enquanto ela estiver definida, e todo outro comando vai para aquele motor):

```bash
export GASCLAW_ENGINE_URL="https://script.google.com/a/macros/<domínio>/s/<Deployment ID do sucessor>/exec"
./gasclaw poc p36 status && ./gasclaw trace
unset GASCLAW_ENGINE_URL
```

O painel mostra também a **linhagem** (geração, pai, filho, delta, custo) e, enquanto um ciclo de sonho
roda, um **DreamBoard** com o diff linha a linha do que cada candidato mudou e um placar que declara *o
que o número consegue enxergar* — um candidato só vence com vantagem estatística, nunca aritmética.

## Referência do CLI

Todos os comandos aceitam `--prod`; sem a flag, valem para dev.

| Comando | O que faz |
|---|---|
| `./gasclaw up [--prod]` | Configura (primeira vez), publica e abre a tela gasclaw |
| `./gasclaw down [--prod]` | Pausa todos os agentes (botão de pânico) |
| `./gasclaw restart [--prod]` | `down` seguido de `up` |
| `./gasclaw ship` | Publica em prod na mesma URL |
| `./gasclaw logs [--prod]` | Mostra os logs ao vivo |
| `./gasclaw status [--prod]` | Mostra IDs, URLs, implantações e health |
| `./gasclaw doctor [--prod]` | Diagnostica o setup e diz como corrigir |
| `./gasclaw rollback [--prod]` | Volta para a versão anterior |
| `./gasclaw open [--prod]` | Abre a tela gasclaw |
| `./gasclaw poc <id> [etapa]` | Roda uma POC no dev e mostra o resultado |
| `./gasclaw trace [id]` | Mostra a árvore de passos de um run do agente (sem id, o mais recente) |
| `./gasclaw runs` | Abre a planilha "gasclaw — execuções" |
| `./gasclaw limits [--fresh]` | Painel de limites (Google, OpenRouter e medido pelo gasclaw) |
| `./gasclaw usage [AAAA-MM-DD]` | Custo por modelo: últimos 7 dias, ou as 24 horas de um dia |
| `./gasclaw eval <cenário\|--all> [--model id]` | Roda `evals/*.md` no dev (sai com erro se falhar) |
| `./gasclaw tools all\|none\|<a,b,c> [pasta]` | Liga e desliga as ferramentas do agente |
| `./gasclaw swarm <sub>` | A corrida do enxame: battery, interval, budget, run, measure, status |
| `./gasclaw succession <sub>` | O agente sucessor: write, status, health, evaluate, rebase, sync, inherit, pull (a coroa é no painel) |
| `./gasclaw onboard` | Menu guiado de setup (o padrão antes de qualquer publicação) |

## Roadmap

| Etapa | Objetivo | Status |
|---|---|---|
| F0 | Primeira conversa com um agente do Drive: publicação com um comando, pasta do agente, tela do dono, respostas no Google Chat, acesso por agente, botão de pânico | Concluída (GitHub/CI adiado) |
| F1 | Pasta do agente completa: conversas guardadas no Drive, memória diária, ritual de estreia, skills, vários agentes, grupos do Google em `users`, publicação mais segura | Em andamento |
| F2 | Tarefas longas: trabalho em segundo plano além de 30 s, ferramentas Gmail/Drive/Sheets/Docs/Agenda/HTTP (usando os cards Aprovar/Negar que já existem na F1), limites por tarefa, novas tentativas | Em construção |
| F3 | Proatividade e dados: checklist `HEARTBEAT.md`, `jobs.md` em formato cron, pasta de entrada `.xlsx` para Google Sheets, modelos prontos de agente | Planejado |
| F4 | Canais extras: threads do Gmail, HTTP com token, MCP/A2A se a POC do GASADK aprovar, `npx gasclaw` | Planejado |

A descrição detalhada de cada etapa, do ponto de vista de quem usa, está no [CHANGELOG.md](CHANGELOG.md).

## Limites conhecidos

Limites atuais:

- As ferramentas do Google valem só para o dono: quem foi aprovado no painel conversa com o agente, mas um pedido dessa pessoa que usaria Gmail, Agenda, Contatos, Tarefas ou Drive/Docs/Planilhas é recusado.
- Só **um** agente (o padrão) responde no Chat, em todos os espaços.
- Memória curta: as últimas 20 mensagens por agente e por conversa, por até 6 horas.
- Cada arquivo do agente é cortado em 20.000 caracteres (60.000 no total).
- Respostas limitadas a 1.000 tokens, porque o Google Chat espera no máximo 30 segundos; um modelo lento faz o Chat avisar que o app não respondeu.
- `users` aceita só e-mails, não grupos.
- Sem nova tentativa automática quando o OpenRouter falha (429/5xx).
- Só o macOS instala as ferramentas que faltam para você (com o Homebrew). No Linux e no Windows o gasclaw diz o comando exato e você roda.
- O app do Google Chat exige Google Workspace. Em Gmail pessoal todo o resto funciona (painel, conversa na tela, agentes, ferramentas do Google), e a cota diária de gatilho do Apps Script é de 90 min em vez de 6 h.

## Segurança

- Segredos ficam só em `.env.local` (ignorado pelo git) e na tela gasclaw, que só o dono acessa, guardados nas Script Properties. Nunca no Drive nem no git.
- Sem `eval` e sem código carregado do Drive: um agente é só markdown.
- Só o dono (a conta que publicou) abre a tela gasclaw; cada agente responde só ao dono e às pessoas que o dono aprovou nessa tela.
- ⚠️ Mudança de acesso ([ADR-021](docs/adr/021-acesso-aprovado-no-painel.md)): quem conversa com o agente e quais ferramentas ele usa passam a valer só depois de aprovados no painel do gasclaw. `users:` e `tools:` na pasta, no editor ou na planilha `config` viram sugestões. Depois desta versão, todo agente responde só ao dono e fica sem ferramentas até você clicar em **Aprovar** no painel. Se você usava `users:` para dar acesso a outras pessoas, aprove essas pessoas no painel.
- Ferramentas do Google (agenda, Gmail, contatos, tarefas, Drive/Docs/Sheets) funcionam só para o dono do gasclaw. Pessoas aprovadas no painel continuam conversando com o agente, mas pedidos delas que usem essas ferramentas são recusados, e só o dono aprova esses cards. O card de aprovação mostra cada campo por inteiro (destinatários, convidados, ids); só o texto longo é resumido ([ADR-023](docs/adr/023-ferramentas-do-workspace.md)).
- Ações com efeito (`./gasclaw poc`, `eval`, `down`) usam POST com um segredo da CLI gerado pelo `./gasclaw up` em `.env.local` ([ADR-022](docs/adr/022-csrf-segredo-da-cli.md)).
- `./gasclaw down` ou "Pausar" na tela param todos os agentes na hora.

**Encontrou uma vulnerabilidade?** Não abra uma issue pública. Mande um e-mail para **gabriel.br@gmail.com**; detalhes em [CONTRIBUTING.md](CONTRIBUTING.md#reporting-security-vulnerabilities) (em inglês).

## Como contribuir

Contribuições são bem-vindas. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) (em inglês) para o setup (`npm ci`, `npm run build`, `npm test`), as regras do projeto, o fluxo com testes primeiro e o checklist de pull request. Os commits seguem Conventional Commits e exigem sign-off DCO (`git commit -s`). Este projeto segue o [Código de Conduta](CODE_OF_CONDUCT.md).

A documentação do projeto está indexada em [docs/README.md](docs/README.md).

## Licença

Licenciado sob a [Licença MIT](LICENSE). Copyright (c) 2026 Gabriel Sorrentino. Veja [LICENSING.md](LICENSING.md) para contribuições, licenças das dependências e marcas.

Google, Google Apps Script, Google Drive e Google Chat são marcas da Google LLC; OpenRouter pertence ao seu dono. O gasclaw não é afiliado a eles nem endossado por eles.

## Agradecimentos

O gasclaw aproveita ideias (não dependências de código) de:

- [vercel/eve](https://github.com/vercel/eve) (Apache-2.0): a pasta como interface de autoria, aprovação por ferramenta, checkpoint por passo.
- [openclaw/openclaw](https://github.com/openclaw/openclaw) (MIT): arquivos do workspace, ritual de estreia, heartbeat, memória diária, cards de aprovação no Chat.
- [tanaikech/adk-gas](https://github.com/tanaikech/adk-gas) (MIT): planejamento de agentes e proteção de timeout e contexto no Apps Script.
- [google/clasp](https://github.com/google/clasp) (Apache-2.0): publicar Apps Script pela linha de comando.

Construído com [devmode](https://github.com/fluencer-ai/devmode).

# POC P33 — um agente completo sobe como OUTRO projeto, nascendo parado?

> **Não vale nesta branch (`consertos-e-reach-out`).** A área que esta POC mediu
> saiu — o auto-aprimoramento (sonho, sucessão) e a geração de código (filhos,
> enxame, criar agentes) não existem aqui. A sonda correspondente saiu do
> `src/main.ts`. **O registro fica**: a medição aconteceu, e apagá-la esconderia
> o que já se sabe sobre a plataforma.

> **Status: C1 e C3 MEDIDOS; C2 e C4 com evidência INDIRETA (dev v151)** — e a primeira tentativa
> do dono achou um portão humano que a spec não tinha previsto (o projeto GCP). Ver [ADR-043](../../docs/adr/043-sucessor-e-um-agente.md).

## Critérios

| # | Critério | Resultado |
|---|---|---|
| C1 | motor + telas + manifesto do pai implantados pela API | ✅ **v148** — 8 arquivos, 16,6 s |
| C2 | nasce parado (`enabled: false`) | 🟡 **indireto** — a semente diz `bornDisabled: true`, mas o dono ativou antes da leitura; depois de ele pausar, `check` leu `the successor is PAUSED` |
| C3 | o dono configura: consentimento + a chave no painel do sucessor | ✅ `c3_hasKey: true` — com um 3º ato imprevisto: vincular o GCP |
| C4 | uma conversa de teste vai e volta | 🟡 **indireto** — o sucessor respondeu os 6 cenários da [P34](../p34-avaliacao-de-fora/README.md) com a chave dele; a tela de chat não foi usada |

## C1 — dev v148

```json
{ "scriptId": "SCRIPT_ID_DEV_REDACTED",
  "files": 8, "ms": 16591,
  "improvements": "the P32 patch no longer applies ... expected once the fix has been ported to src
                   and published: the parent code already carries it" }
```

8 arquivos: o motor, as telas e o manifesto do pai (os mesmos escopos — decisão 2) + a **semente**.

**O patch da P32 não se aplicou, e é a notícia boa**: o defeito da meia-noite que ele corrigia já
tinha sido portado para `src/schedule.ts` e publicado. O sucessor nasce do motor que já traz a
correção — a decisão 3 da ADR-043 funcionando de ponta a ponta.

**O `unknown POC: p33` das duas primeiras tentativas era atraso do Google** em servir a versão nova
(v148), e só foi aceito como explicação depois de conferir que o código salvo no projeto era idêntico
ao build. O web app leva **alguns minutos** para servir uma versão recém-implantada. Vale para o
sucessor também: logo depois de implantado, o endereço dele pode demorar a responder.

## O portão que a spec não previu: o projeto GCP

O dono autorizou o sucessor, colou a chave, ativou — e ao abrir Agents → Access:

```
Drive download AGENTS 403: Google Drive API has not been used in project 264409976776
before or it is disabled.
```

**Causa:** o PAI está ligado a um projeto GCP **padrão** (`gasclaw-dev-e4a6d3`, nº 374106012966),
onde o `./gasclaw up` ligou as 11 APIs do Google. O sucessor, criado pela API, ganhou um projeto GCP
**automático** (264409976776) com **nenhuma API ligada** — e o motor lê os papéis do agente pela API
REST do Drive (ADR-015).

**Não existe API para ligar um script a um projeto GCP padrão.** É um passo manual no editor — é por
isso que o próprio `./gasclaw` pausa e pede esse clique na instalação (`GCP_LINKED_*`).

**A saída:** ligar o sucessor ao MESMO projeto GCP do pai, onde as APIs já estão ligadas.

**A consequência, e ela vai para a ADR-043:** cada agente sucessor custa ao dono **três atos**, não dois
— vincular o projeto GCP, autorizar, e colar a chave. A spec só previa os dois últimos.

## Auditoria do sucessor implantado (2026-09-21, pai no dev v151)

O código foi baixado do sucessor com o clasp e comparado arquivo por arquivo com o `dist/` do pai:

| Verificação | Resultado |
|---|---|
| `_motor.js`, `settings.html`, `chat.html`, `hub.html`, `appsscript.json` | **idênticos** (sha256) |
| Único arquivo a mais | `successor_seed.js` |
| Correção da meia-noite (`const desde = now < lastSeen ? -1 : lastSeen`) | presente; o trecho defeituoso sumiu |
| `guardsWeakened(pai, sucessor)` | **nenhum** enfraquecimento — 64 `assertOwner`, 9 `mayWriteProject`, 6 `mayAct`, 5 `isEnabled`, 7 `NEVER_AUTO`, 22 tools |
| Semente | `bornDisabled: true`, pai, 1 agente, `parentUrl`; **nada com cara de segredo** |
| Escopos | 17 = 17, incluindo `script.projects` (decisão 2) |

**Leitura honesta:** quem montou o projeto foi o MOTOR (cópia do código do pai + semente); o Opus
escreveu uma troca de uma linha, que chegou pelo `src`. O fluxo "o Opus devolve o patch e o motor o
implanta como agente" é a Fase 2 da F7 e ainda não está fiado.

**C2 continua não observado ao vivo:** o dono ativou o sucessor antes da leitura, e `p33 check`
responde `the successor is RUNNING`. **C4** (uma conversa de teste) segue pendente.

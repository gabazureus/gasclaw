# ADR-038 — agente com a capacidade `create`: o singleton que cria agentes, e a linhagem

> ⛔ **NÃO VALE na branch `consertos-e-reach-out`.** A área desta decisão saiu inteira dessa branch
> (auto-aprimoramento: sonho, sucessão, criar agentes e geração de código). A ADR fica como
> **registro do que foi decidido e por quê** — apagá-la esconderia o raciocínio, e a decisão
> continua valendo na `evolucao-f5-f8`, onde a área existe.

> **Redesenho de 2026-09-19 (decisão do usuário): o nome de cargo saiu.** Não existe papel
> especial. Existe **uma** coisa — o agente, que é uma pasta com markdown — e o que distingue
> um do outro é o **conjunto de capacidades ligadas**, exibido como **etiqueta no painel**.
> As capacidades são `dream`, `initiative`, `succeed` e `create`, aprovadas **uma a uma**.
> `succeed` (1→1, substitui) pode estar ligada em vários agentes; `create` (1→N, multiplica)
> mantém o singleton pela forma do dado, agora na Property `CREATOR`.
> **Nem todo agente gerado é sucessor:** o tipo do ato (`succession` × `creation`) entra no
> modelo, no registro e no trace.
> **Migração: não há dado a migrar** — conferido no git em 2026-09-19 (HEAD `e4b8006`, os
> arquivos desta track ainda não commitados e o dev nunca publicado com eles).

Status: **Aceito no desenho** · 2026-09-19 · implementação por fatias; a POC P23 é o gate de viabilidade do ciclo de sonho
Relaciona: [ADR-002](002-agente-pasta-sem-codigo.md) (agente = pasta, sem código),
[ADR-021](021-acesso-aprovado-no-painel.md) (a pasta sugere, o painel aprova),
[ADR-035](035-procedencia-dos-papeis-no-painel.md) (a procedência aparece),
[spec F5](../specs/2026-09-19-sonho-auto-aprimoramento.md)

## Contexto

O usuário pediu que o agente "possa se recriar", criando um agente com a capacidade `create` novo com
código aperfeiçoado e passando o bastão, "montando uma squad".

**Neste projeto, o código do agente é o markdown dele.** Isso não é analogia — é o
que o código faz, e tem três evidências:

1. `loadAgent`/`buildSpec` (`src/workspace.ts`) montam o `system` do agente juntando
   os papéis em markdown. Não há compilação, não há `eval` (ADR-002).
2. **Uma pasta sozinha não concede nada.** `effectiveAccess(null)` devolve
   `{ users: [], tools: [] }` (`src/workspace.ts:178-184`). Um agente nascido de
   markdown novo **não consegue se dar ferramentas**.
3. O frontmatter do `AGENTS.md` apenas **escolhe entre** o que o dono já aprovou no
   painel; `withTool` recusa qualquer nome fora do registro fechado
   (`src/workspace.ts:196-203`). A pasta seleciona, nunca concede.

**Consequência que decide o desenho:** "criar um agente criador novo com código aperfeiçoado"
= criar uma pasta com prompt aperfeiçoado. Isso roda inteiro dentro do Apps Script,
**não exige o escopo `script.projects`**, não exige reautorização e não fere o
ADR-002. É **evolução por linhagem** em vez de mutação do motor — o pedido contorna
o problema caro em vez de pagar o preço dele.

Registro do preço evitado: alterar o projeto Apps Script de dentro exigiria
`script.projects`, que **não está** nos 14 escopos do `appsscript.json`; o ADR-013
já mediu um **403 "insufficient authentication scopes"** ao tentar
`projects.getContent` com o token do script. O caminho existe e foi recusado porque
daria ao agente o poder de remover as próprias travas.

## Decisão

1. **Quatro capacidades separadas, nunca um interruptor só:** `dream`, `replicate`,
   `initiative`, `create`. Os poderes têm consequências diferentes — sonhar
   gasta cota; replicar cria pastas na conta do dono; iniciativa fala com terceiros
   em nome do dono; ser agente criador cria agentes. Aprovar os quatro num clique é o mesmo
   erro que o ADR-015 recusou escopo por escopo.
2. **Só o agente com a capacidade `create` cria agentes.** `replicate` deixa de ser capacidade de
   qualquer agente.
3. **O singleton é a forma do dado, não uma transação.** Existe **uma** Script
   Property `CREATOR`, cujo valor é **um** `folderId`. "Exatamente um agente criador" é então
   garantido por construção: não há estado em que dois agentes sejam agente criador, porque
   não há dois lugares onde isso possa estar escrito.
   - Rejeitada a alternativa `CREATOR:<folderId> = true` por agente: ela **permite**
     dois agente criadors, e então "exatamente um" viraria invariante a defender por trava —
     e uma corrida entre dois cliques no painel produziria o defeito que este
     desenho não pode ter.
   - Passar o bastão é **sobrescrever um valor**. Ligar num agente desliga no
     anterior porque não sobra onde o anterior fique escrito.
4. **A escrita vai sob a trava que já existe.** `underAccessLock`
   (`src/main.ts:859-867`) serializa leitura-modificação-escrita do painel e já é
   usada em cinco caminhos. Ela **serve**, e por um motivo registrado no próprio
   comentário dela: o Apps Script atende `google.script.run` em paralelo, e a perda
   silenciosa de uma gravação concorrente já aconteceu neste código.
5. **A pasta declara, o painel aprova, o painel mostra a procedência** (A1 = C).
   Nenhuma capacidade entra em vigor por edição da pasta compartilhável — é o
   precedente do ADR-021, somado à exigência do ADR-035 de que a queda de confiança
   nunca seja silenciosa.
6. **Ambiente sem agente criador é estado válido e detectável.** Se o agente criador for removido ou a
   pasta sumir, `CREATOR` aponta para um `folderId` que não está em `listAgents()`: o
   painel mostra "sem agente criador" e **ninguém cria agentes**. Fail-closed, nada quebra.
   `removeAgent` passa a limpar `CREATOR` quando remove o agente apontado — mesmo
   precedente da linha que já limpa `ACCESS:<folderId>` (`src/main.ts:847`).
7. **Squad: membros nascem sem nenhuma capacidade.** São executores, não criadores.
   É o comportamento que o código já tem (`effectiveAccess(null)` fecha), promovido
   a invariante testada.
8. **Conserto devido e prévio:** `store.saveAgents` (`src/store.ts:20-22`) grava a
   Property `AGENTS` com `setProperty` **sem guarda de tamanho**, enquanto
   `src/usage.ts` tem `PROP_MAX = 8_000` de propósito. Com ~70 bytes por entrada e
   9 KB por valor, o teto é de **~130 agentes**, e o estouro **lança exceção** em vez
   de degradar. Enquanto squad era hipótese isso era teórico; com squad é caminho
   normal. A guarda entra **antes** de qualquer linha de replicação.

## A sucessão é autorizada por mandato, não por interruptor

Decisão do usuário (2026-09-19), fechando o gate A5.

Se o agente criador promovesse o próprio sucessor sem limite, o sucessor herdaria
`create` e repetiria — e nenhuma geração depois da primeira teria sido
aprovada por ninguém. Isso contradiria frontalmente a D2 da F5 ("nada é promovido
sem clique do dono"). O mandato resolve a contradição em vez de escondê-la:

9. **Mandato de linhagem.** O dono aprova um **orçamento de evolução** com escopo e
   validade: *até N sucessões, delta mínimo ≥ 2, até a data D, só neste agente*.
   Dentro do mandato as sucessões acontecem sozinhas; **cada troca notifica** e é
   **reversível num clique**. O mandato **expira por contagem E por prazo** — o que
   vier primeiro. Fora dele, a sucessão volta a exigir clique.
   - **Não é desenho novo.** É a mesma forma do `once`/`granted` que o motor já usa
     para tools: autorização **com escopo e validade**, nunca interruptor
     permanente. Um clique autoriza um conjunto delimitado de atos, não uma
     delegação sem fim.
10. **Criar e coroar são dois atos.** O sucessor nasce **sem** `create`; passar
    o bastão é ato distinto e posterior. Separá-los é o que permite ao mandato ter
    reversão de verdade: dá para descartar um sucessor ruim sem nunca tê-lo coroado.

## O que o mandato NÃO desfaz

Isto precisa estar escrito, porque quem ler depois não pode descobrir na prática:

**Reverter o bastão não é desfazer os efeitos.** Sobrescrever `CREATOR` com o
`folderId` anterior devolve a autoridade — e só isso. **Continuam existindo:**

- os **agentes que a geração revertida criou** (pastas no Drive do dono e entradas
  em `AGENTS`), que seguem lá até alguém removê-los;
- as **mensagens que ela já enviou** e qualquer outro efeito externo — a regra do
  ADR-026 §7 vale igual aqui: efeito que saiu, saiu;
- o **consumo de cota e de dinheiro** das gerações já rodadas.

Por isso a linhagem registra **quais filhos cada geração criou**: sem essa lista, a
limpeza depois de uma reversão vira arqueologia. Reverter é barato; **desfazer não
é**, e o painel deve dizer isso na hora de reverter, não depois.

## Linhagem — sem ela, "evoluiu" é fé

Cada geração registra: número da geração, `folderId` do pai, o diff do prompt, o
placar no conjunto-juiz, o delta contra o agente criador vigente, e os agentes que criou.

| Onde | O quê | Por quê ali |
|---|---|---|
| `.gasclaw/lineage/<generation>.json` (pasta do agente criador) | diff, placar, delta, filhos criados | é o `DreamBoard` estendido; texto grande não cabe em Property (D3) |
| planilha `gasclaw — execuções` | uma linha por sucessão | mesmo lugar do custo e dos limites (ADR-016/018) |
| `CREATOR` (Script Property) | quem é o agente criador **agora** | fora da pasta compartilhável; é a autoridade, não o histórico |

## Consequências

- Criar agente deixa de ser só função de painel com `assertOwner()`
  (`src/main.ts:837`) e passa a ter um segundo caminho, restrito ao agente criador. Esse
  caminho precisa de tool nova, logo de deploy (ADR-002).
- O teto de ~130 agentes vira limite de produto visível no painel, não surpresa.
- Uma linhagem sem critério de admissão é deriva aleatória com nome de evolução; o
  critério está na spec F5 e é amarrado ao conjunto-juiz.

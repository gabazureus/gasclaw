# Changelog — gasclaw

> **Regra de manutenção:** sempre que uma capacidade do produto mudar (algo que você passa a poder, ou deixa de poder, fazer), atualize este arquivo no mesmo commit.

O que o gasclaw faz em cada etapa, contado por quem usa.

- Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); o projeto vai adotar [Versionamento Semântico](https://semver.org/lang/pt-BR/) a partir da primeira versão publicada.
- Status: ✅ disponível · 🔄 em construção · ⏳ planejado.
- Como usar: [docs/como-usar.md](docs/como-usar.md).

## [Não publicado]

> 🧬 **O sucessor é ESTE agente, melhorado (F7, ADR-043):** o botão **Write a successor** passa a
> mandar o código do próprio agente ao Opus 5, que devolve um **patch pequeno com a explicação** do que
> melhora. O agente melhorado sobe como outro projeto, com os **mesmos escopos**, **parado**. O agente
> atual o **avalia de fora**, com o juiz dele; você lê a troca, a explicação e a nota, e **coroa** — só
> no painel. Nota pior não coroa; empate coroa se você quiser, e o painel diz que é empate. A geração
> seguinte **reusa** o sucessor parado: você vincula o GCP, autoriza e cola a chave **uma vez**.
> O que o botão fazia antes (um projeto pequeno de código novo) continua existindo com o nome certo:
> **Write an automation**. CLI: `./gasclaw succession write | status | evaluate | pull`.
> A coroa fica em **Projects → Successor agents** e só destrava quando o **health** do sucessor passa
> nas 9 checagens (autorizado, parado, chave, escopos, Drive, worker, código = este motor + o patch,
> avaliação recente). **Rebase** reaplica o mesmo patch quando este motor mudou, sem chamar o modelo.
> ✅ no dev (v153) · primeira geração real: US$ 1,52, um defeito real no ciclo de sonho, health 9/9.

> 🧬 **Capacidades por agente (F5):** quatro poderes que você liga UM A UM no painel, e nenhum liga
> outro — **Sonho** (reescreve o próprio prompt e se mede contra o conjunto-juiz), **Procurar**
> (acorda numa agenda que você marca no painel), **Suceder** (escreve o CÓDIGO do sucessor com
> Opus 5, como projeto Apps Script próprio) e **Criar agentes** (só um agente do ambiente pode ter).
> Acima das quatro há uma **chave de emergência** global: desligada, tudo congela e os agentes
> seguem atendendo. ([ADR-038](docs/adr/038-capacidades-e-linhagem.md), [ADR-041](docs/adr/041-sucessor-como-codigo.md))
>
> 👥 **Personas, automações e agentes novos ([ADR-042](docs/adr/042-automation-subagente-persona.md)):**
> três formas que antes dividiam o nome "sub-agente", e a diferença que a palavra escondia é se há
> chave de API em jogo. Hoje a resposta é a mesma para as três: **nenhuma chave sai deste projeto**.
> **Persona** é um papel em `subagents/<nome>.md` que roda dentro do turno do pai. **Automação** é
> projeto filho só com código, com escopos OAuth próprios e mais estreitos. **Agente novo** tem pasta
> e conversa, mas roda neste mesmo motor e lê a chave aqui dentro — nada é entregue.
>
> 🔒 **A entrega da chave ao filho foi REMOVIDA ([ADR-040](docs/adr/040-isolamento-e-privilegio.md),
> opção 4):** o motor tinha uma rota que entregava a chave do OpenRouter ao filho que provasse
> identidade com um segredo próprio. A medição (P27) mostrou que o filho **não alcança** essa rota —
> o Google recusa com 401 um token emitido para outro projeto, antes de chegar ao nosso código. A
> rota, o segredo, a janela de entrega e o botão de rearme saíram do código; não foram desligados por
> bandeira. **O que você perde:** um filho não pode ter escopos OAuth próprios *e* um modelo ao mesmo
> tempo. Nada do que já funcionava foi perdido.
>
> 🐝 **O enxame: filhos que escrevem o próprio sucessor.** Um agente com `succeed` pede ao Opus 5 o
> CÓDIGO de um projeto filho, implanta, e depois **mede** contra uma bateria que **você** declara.
> Cada geração parte do melhor filho medido, não do prompt — escada em vez de sorteio. O filho
> **nunca se dá nota**: ele recebe uma entrada e devolve a saída, e quem guarda o esperado é o motor.
> Seis comandos (`./gasclaw swarm capability|battery|interval|budget|run|status`), nenhum id fixo, e
> tetos de gasto que **expiram sozinhos**. `./gasclaw down` para tudo, inclusive o que gasta.
>
> 🔗 **Mensagem entre agentes:** `agent.message` no registro fechado, com quatro controles que não
> são opcionais — origem assinada no run, `isOwner` falso em todo repasse, o card nomeando quem
> pediu, e `tools(A) ∩ tools(B)`. Sempre pede aprovação. ([ADR-040](docs/adr/040-isolamento-e-privilegio.md))
>
> ⏰ **Proatividade com a agenda NO PAINEL:** o agente pode agir sozinho, e a agenda mora nas
> configurações — nunca na pasta, que é compartilhável. Roda no worker de 1 minuto que já existia,
> **sem gatilho novo**. Ferramenta fora da sua lista de auto-aprovação faz o run **falhar e dizer por
> quê**, em vez de esperar um clique que ninguém vai dar. Sete ferramentas nunca entram nessa lista,
> ponha o que puser: `gmail.send`, `calendar.create`, `calendar.update`, `memory.remove`,
> `sheets.append`, `agent.create` e `agent.message`.
>
> 📊 **Telas novas:** linhagem (geração, pai, filho, delta, custo), DreamBoard com o diff linha a
> linha de cada candidato e um placar que declara o que o número consegue enxergar, agenda, e a lista
> de projetos filhos e agentes arquivados em tabela.
>
> 💰 **Teto familiar de gasto:** o painel estima quanto os filhos consumiram e o motor **age** —
> a 80% para de criar, a 100% congela. Nunca corta a chave, porque isso pararia o agente principal.

> ⚠️ **Mudança de acesso ([ADR-021](docs/adr/021-acesso-aprovado-no-painel.md)):** quem conversa com o agente e quais ferramentas ele usa passam a valer só depois de aprovados no painel do gasclaw. `users:` e `tools:` na pasta, no editor ou na planilha `config` viram sugestões. Depois desta versão, todo agente responde só ao dono e fica sem ferramentas até você clicar em **Aprovar** no painel. Se você usava `users:` para dar acesso a outras pessoas, aprove essas pessoas no painel.
>
> 🔐 **Ferramentas do Google só para o dono ([ADR-023](docs/adr/023-ferramentas-do-workspace.md)):** ferramentas do Google (agenda, Gmail, contatos, tarefas, Drive/Docs/Sheets) funcionam só para o dono do gasclaw. Pessoas aprovadas no painel continuam conversando com o agente, mas pedidos delas que usem essas ferramentas são recusados, e só o dono aprova esses cards. O card de aprovação agora mostra cada campo por inteiro (destinatários, convidados, ids); só o texto longo é resumido.
>
> 🔒 **Ações com efeito só pela CLI com segredo ([ADR-022](docs/adr/022-csrf-segredo-da-cli.md)):** `./gasclaw poc`, `eval` e `down` passam a usar POST com um segredo gerado pelo `./gasclaw up` em `.env.local`. Rode `./gasclaw up` uma vez depois de atualizar.

### Instalação e primeiros passos

- ✅ **Conta pessoal do Gmail, não só Google Workspace:** o gasclaw detecta o tipo da conta no passo 2 e ajusta o
  que muda. O endereço do web app tem outra forma em conta pessoal (`script.google.com/macros/…`, sem o domínio
  no caminho) — era isso que impedia o gasclaw de rodar fora do Workspace, porque a URL antiga apontava para um
  endereço inexistente e **toda** chamada remota falhava. A tela de consentimento vira `EXTERNAL` e você precisa
  se adicionar como usuário de teste. O app do Google Chat continua exigindo Workspace; todo o resto funciona.
  As cotas do Google são menores: 20.000 UrlFetch e 100 e-mails por dia, e 90 min de gatilho em vez de 6 h.
- ✅ **macOS, Linux e Windows** (pelo WSL ou Git Bash): a CLI era só macOS por três detalhes, não por
  arquitetura — `open`, `pbcopy` e `brew`. No macOS o passo 1 continua instalando o que falta com o Homebrew;
  no Linux e no Windows ele diz o comando exato, porque os gerenciadores de pacote variam demais para o chute
  ser seguro. No Windows, o Google Cloud CLI instala como `gcloud.cmd` e o gasclaw passa a reconhecer as duas
  formas — sem isso ele morria dizendo "gcloud not found" numa máquina onde o gcloud estava instalado.
- ✅ **`./gasclaw onboard`, o mapa do setup:** sete passos, um por vez, cada um com o motivo de existir. O menu
  diz o que falta num passo **antes** de você apertar `a`, e `[d]` diagnostica. Rodar de novo nunca repete
  trabalho. É o que aparece quando você roda `./gasclaw` sem argumento e ainda não publicou nada.
- ✅ **CLI e painel em inglês**, para a comunidade. Os comentários do código seguem em pt-BR (regra do
  `CLAUDE.md`), e há um teste que trava a mistura: ele lê o que sai para humano e reprova português.
- ✅ **Licença MIT** ([ADR-030](docs/adr/030-licenca-mit.md)), no lugar da Apache-2.0.

- ✅ **Chegar ao agente sem digitar o link** ([ADR-036](docs/adr/036-chegar-ao-agente-sem-digitar-o-link.md)):
  o endereço do web app tem ~94 caracteres e o Google não deixa encurtar. Em vez disso, o link da conversa é
  **impresso e copiado para a área de transferência** no instante em que o primeiro agente é criado, e
  `./gasclaw open --chat` vai direto para a conversa. Quem nunca digita não sofre com o tamanho.
- ✅ **A tela de conversa deixa de ser invisível:** quem não tem Google Workspace sempre pôde conversar com o
  agente pelo navegador, servido pelo próprio Apps Script. O Google Chat é um canal a mais, não o único.
- ✅ **O painel diz de onde veio cada papel** ([ADR-035](docs/adr/035-procedencia-dos-papeis-no-painel.md)):
  editor do Apps Script, Google Doc ou arquivo na pasta. Renomear a pasta desligava os papéis do editor em
  silêncio, e o agente passava a seguir os arquivos da pasta — que quem tem a pasta compartilhada pode editar.
- ✅ **O modelo escrito na pasta é conferido** ([ADR-034](docs/adr/034-modelo-da-pasta-conferido.md)): um
  modelo inexistente, caro demais ou sem suporte a ferramentas cai no padrão, e o trace diz por quê. Antes a
  pasta — que é compartilhável — era a única entrada de modelo que ninguém checava.

### Correções

- ✅ **Listas que truncavam caladas:** `sheets.read` (200 linhas), `contacts.find` e `drive.search` (10 cada)
  devolviam o começo da lista sem avisar que havia mais. Numa planilha de 5.000 linhas, "some a coluna C"
  virava um número plausível e errado — pior que um erro, porque um erro o agente conta. Agora a resposta diz
  quando a lista está cortada.
- ✅ **"Aprovação ocupada" sem motivo:** a faxina diária de arquivos antigos segurava o bloqueio global do
  Apps Script durante centenas de chamadas, e quem clicasse **Aprovar** naquela janela levava erro. A faxina
  saiu de dentro do bloqueio. De quebra, ela agora roda também quando não houve execuções no dia — antes uma
  instalação parada nunca limpava nada.

### Google Chat

- ✅ **Formatação das respostas:** mensagens agora declaram Markdown explicitamente. Negrito, itálico, tachado,
  código, listas, citações e links são renderizados em vez de mostrar os marcadores como `**`. Cards de aprovação
  continuam em HTML escapado para exibir argumentos literalmente, sem transformar texto não confiável em links.
- O motor orienta o agente a não usar títulos `#`, tabelas, checklists, HTML, notas de rodapé ou imagens Markdown,
  que não fazem parte do subconjunto suportado pelo Google Chat.
- ✅ **Run abandonado não fica preso no Ao vivo:** quando o Apps Script mata uma execução antes de `end()`, o painel
  fecha o registro como interrompido depois de 6 min e 30 s e o move para Recentes, em vez de contar por 6 horas.

### F2 — Tarefas longas 🔄 (em construção)

- 🔄 **Tarefas que não terminam numa tacada só** ([ADR-026](docs/adr/026-run-duravel.md)): o Apps Script encerra qualquer execução em 6 minutos, e o Google Chat espera resposta em 30 segundos. Até aqui, um pedido que não coubesse nisso terminava em *"Parei por tempo antes de terminar"* — e o que o agente já tinha feito era **jogado fora**. Agora o trabalho é guardado a cada passo, na pasta do próprio agente, e continua sozinho de onde parou. Um passo que já rodou nunca roda de novo.
- ✅ **Aprovação durável por 24 horas no Chat e na tela** ([ADR-028](docs/adr/028-aprovacao-duravel.md)): a aprovação
  agora pertence ao run no Drive, não ao cache de dez minutos. Perder o cache não perde o card; só o solicitante
  aprova, uma única vez. Ao expirar, o run continua esperando e recebe nova credencial sem repetir LLM ou efeitos.
- 🔄 **Teto de gasto por tarefa:** cada tarefa tem um limite de **US$ 0,10**. Ao chegar nele, o agente **para, guarda onde estava** e pergunta se você quer continuar — em vez de gastar sem avisar ou perder o trabalho.
- ✅ **Nunca fazer duas vezes (P19):** se a execução morrer bem no meio de uma ação com efeito (enviar e-mail, criar evento, escrever num arquivo), o gasclaw **não repete**. No dev v72, a morte forçada pelo motor real de turno deixou `inflight` no Drive; a retomada executou zero passos, manteve um único efeito e mostrou o aviso de incerteza.
- ✅ **Gatilho-worker medido ([ADR-027](docs/adr/027-gatilho-worker.md)):** no dev, o gatilho de 1 min avança a fila
  durável diretamente. A P3 passou 4/4 novamente na v60: worker sintético em 3,992 s, ciclo ocioso completo em 0,716 s e
  custo fixo projetado em 8,47% das 6 h diárias do Workspace.
- ✅ **Run em várias execuções (P4):** no dev v66, o mesmo `runId` retomou do Drive em três execuções GAS distintas,
  avançou pelos checkpoints 1 e 2, terminou com a resposta esperada e registrou o efeito sintético uma única vez.
- ⏳ **Ainda em construção:** a F2 não está concluída; faltam custo real por passo, Chat assíncrono, planner e retry. Perguntas `ask` ainda usam o ticket de 10 minutos.

### F0 — Primeira conversa com um agente do Drive ✅

**Concluída em 2026-09-14.** O ambiente **dev está no ar e já dá para usar**: o agente responde no Google Chat usando a pasta do Drive. A pausa (`down`), a reativação (`up`) e o `rollback` foram testados de verdade, e a POC P1 mostrou que chamadas longas ao OpenRouter, de mais de 2 minutos, funcionam ([ADR-010](docs/adr/010-poc-p1-urlfetch.md)).
O ambiente **prod** também está publicado e passa no `./gasclaw doctor --prod`; falta salvar a chave e o agente na tela de prod.

**Pendência explícita:** a **publicação automática pelo GitHub/CI** (repositório privado, secret, push e POC P7) foi adiada por decisão sua. O `deploy.yml` já existe, mas ainda não roda. Até lá, dev e prod são publicados só pelo `./gasclaw`. Também ficaram para o começo da F1 três verificações manuais: editar o `SOUL.md` sem deploy, o histórico no Chat e a conversa de outra pessoa do domínio.

Detalhes técnicos: [plano F0](docs/plans/2026-09-14-gasclaw-f0-plano-implementacao.md) (Tasks 0–9 e 11 concluídas, Task 10 adiada) · ajustes e desvios no [ADR-009](docs/adr/009-ajustes-f0.md).

#### Adicionado

- ✅ **Um comando para publicar e operar:** `./gasclaw up` instala o que falta, cria o projeto e publica. Nos passos que só dão para fazer clicando, ele pausa e abre a página certa. Depois disso, `down`, `status`, `logs`, `doctor`, `rollback`, `open` e `ship` cuidam do dia a dia.
- ✅ **Agente = pasta do Google Drive:** você cola a URL da pasta, e o gasclaw cria `AGENTS.md`, `SOUL.md`, `IDENTITY.md` e `USER.md` a partir de modelos, sem sobrescrever o que já existe. Mudou um arquivo? A próxima mensagem já usa a versão nova, sem publicar de novo.
- ✅ **Tela gasclaw** (só o dono acessa): salvar a chave do OpenRouter, adicionar e remover agentes, abrir a pasta do Drive ou o projeto no Apps Script, escolher o agente ⭐, testar uma pergunta e pausar ou reativar tudo.
- ✅ **Conversa no Google Chat:** o agente ⭐ responde no Google Chat usando os markdown da pasta do Drive, em DM ou num espaço, e lembra das mensagens recentes.
- ✅ **Controle de acesso por agente:** só falam com o agente o dono e os e-mails listados em `users` no `AGENTS.md`.
- ✅ **Botão de pânico:** `./gasclaw down` ou "Pausar" na tela; o Chat passa a responder que o gasclaw está pausado.
- ⏳ **Publicação automática (pendente, adiada):** repositório privado no GitHub, com publicação em dev e prod a cada push. O `deploy.yml` já está pronto.

#### Alterado

- A resposta no Google Chat, que a spec colocava na F1, foi antecipada para a F0 numa versão simples (síncrona e com memória curta), para existir algo utilizável já na primeira etapa.

#### Segurança

- A chave do OpenRouter apareceu parcialmente numa sessão local; `.env` foi adicionado ao `.gitignore`.
- 🔄 (no dev, depois da auditoria) Ações com efeito só por POST com segredo da CLI, e o painel mostra quando o segredo foi registrado ([ADR-022](docs/adr/022-csrf-segredo-da-cli.md)); acesso e ferramentas só depois de aprovados no painel ([ADR-021](docs/adr/021-acesso-aprovado-no-painel.md)); o trace apaga mais formatos de chave e token (`sk-proj-`, `sk-`, `bearer` minúsculo, `Basic`); a chave do OpenRouter sai do clipboard em 90 s; o deploy confere o bundle, o HEAD e a versão antes de publicar.

#### O que ainda não faz / limites

- Só conversa: não envia e-mail, não mexe em planilha, não agenda nada (ferramentas chegam na F2).
- Só **um** agente responde no Chat, o ⭐, em todos os espaços.
- Memória curta: as últimas 20 mensagens por agente e por conversa, por até 6 h. Depois disso, o agente esquece.
- Cada arquivo da pasta é cortado em 20.000 caracteres (60.000 no total).
- Resposta curta (até 1.000 tokens), porque o Chat espera no máximo 30 s. Modelo lento = o Chat mostra que o app não respondeu.
- `users` aceita só e-mails, não grupos.
- Sem nova tentativa automática quando o OpenRouter falha (429/5xx).

## Próximas etapas

### F1 — Agente-pasta completo ⏳

- **Primeiro item: agentes em Google Docs e Sheets nativos.** Você vai poder escrever o agente num Google Doc comum, com comentários, histórico e edição pelo celular, e guardar os dados em Google Sheets em vez de CSV. Os arquivos `.md` continuam aceitos. Isso depende da POC P6, que mede tempo e fidelidade da leitura; se passar, a mudança é registrada no ADR-012.
- 🔄 **Agente também no editor do Apps Script (POC P10 passou, [ADR-013](docs/adr/013-autoria-editor-e-drive.md)).** Você vai poder escrever `AGENTS` e `SOUL` direto no editor, em arquivos `agentes/<nome>/<PAPEL>.md.html` com markdown puro, e deixar o resto na pasta do Drive. Quando o mesmo papel existir nos dois lugares, vale o editor, depois o Google Doc e depois o `.md`. **Já disponível no dev:** o agente lê os arquivos do editor, e uma edição salva lá chega à próxima resposta em até 30 s (medido: 12,8 s), sem publicar de novo. O mesmo vale para Google Docs e `.md` na pasta do Drive. Se a leitura do editor falhar, o agente segue com o que está no Drive. O projeto tem um único arquivo de motor (`_motor.gs`, "NÃO EDITE"), e o `./gasclaw up` não apaga o que você editou no editor.
- 🔄 **"Novo agente" na tela:** cria sozinho a pasta `Meu Drive/gasclaw/agentes/<nome>/` (sem duplicar), com os arquivos iniciais; "Usar pasta existente" continua. O link de cada pasta aparece no `./gasclaw status` e no fim do `up`. (Código no dev; falta usar de verdade na tela.)
- 🔄 **Trace do agente (no dev, POC P14, [ADR-014](docs/adr/014-trace-do-agente.md)):** na tela gasclaw, a seção **Ao vivo** mostra cada conversa, teste ou POC em andamento, com o passo atual e o tempo, e os 10 últimos. Clique num run para ver a árvore de passos: leitura do agente, chamada ao modelo com modelo, tokens e custo, e resposta, além da pergunta e da resposta completas. O link "abrir planilha" leva à `gasclaw — execuções`, com uma linha por run. No terminal, `./gasclaw trace [id]` mostra a árvore e `./gasclaw runs` abre a planilha. O detalhe completo, com o prompt, fica 90 dias em `Meu Drive/gasclaw/runs/`. Chaves e tokens são sempre removidos antes de gravar. **Sem custo na sua espera:** a conversa só anota o que aconteceu, e a gravação acontece depois, num lote de 1 minuto — o trace deixa a resposta 0,6 s mais lenta no pior caso, em vez dos 3 a 4 s da primeira versão.
- 🔄 `./gasclaw eval` roda testes automáticos do agente no dev; ferramentas `now` e memória (`memory.save/remove/read`) com lista permitida por agente; aprovação com card de uso único (10 min) e perguntas com botões.
- 🔄 **Ferramentas do Google, com aprovação e só para você (no dev, [ADR-023](docs/adr/023-ferramentas-do-workspace.md)):** o agente consulta e escreve na sua agenda, cria rascunhos e busca no Gmail, lê contatos, cria tarefas e mexe em Drive, Docs e Sheets. Antes de qualquer ação que muda alguma coisa, ele mostra um card com os campos por inteiro e espera o seu clique. Essas ferramentas valem **só para o dono**: quem você aprovou no painel conversa normalmente, mas pedidos com ferramentas do Google são recusados.
- 🔄 **O agente avisa quando a ferramenta falha:** se a ação no Google der erro, a resposta diz que não deu certo, em vez de afirmar que fez. (Havia o caso oposto: com a API da Agenda desligada, o agente respondia "Evento criado".)
- 🔄 **Painel de observabilidade (no dev, [ADR-016](docs/adr/016-painel-de-limites.md) e [ADR-018](docs/adr/018-modelos-e-custo.md)):** na tela gasclaw, a seção **Observabilidade** reúne quatro abas: **Ao vivo** (conversas em andamento e as 10 últimas), **Lote** (o que ainda falta gravar), **Modelos e custo** (gasto por modelo nos últimos 7 dias e nas últimas 24 h, com o modelo escolhido por agente) e **Limites** (quanto já se usou das cotas do Google e do OpenRouter, com selo de folga). No terminal, `./gasclaw usage` e `./gasclaw limits`. O custo que o painel mostra ficou a 0,1% do que o OpenRouter cobrou de verdade. *(Uma fonte, o Monitoring do Google Cloud, aparece como indisponível: ela exige faturamento ativo, e você decidiu não habilitar.)*
- 🔄 **Rodízio de modelos gratuitos (no dev, [ADR-025](docs/adr/025-rodizio-de-modelos-gratuitos.md)):** escreva `free` no lugar do nome do modelo — no `AGENTS`, na planilha `config` ou na tela — e o gasclaw usa o melhor modelo gratuito disponível no momento. Se ele falhar, cair ou estiver ocupado, o agente troca sozinho e responde assim mesmo; na tela você vê qual modelo respondeu por último, e no trace, por quais passou. Medido: 20 de 20 respostas, com a troca custando cerca de 1 segundo. **Duas ressalvas honestas:** modelo gratuito às vezes demora (a maioria respondeu em ~4 s, mas um levou 36 s), e ainda não verificamos a política de privacidade desses provedores — então não use `free` com memória pessoal por enquanto.
- 🔄 **Tela de chat do gasclaw (no dev, [ADR-019](docs/adr/019-tela-de-chat-e-voz.md)):** dá para conversar com o agente por texto direto na tela, sem depender do Google Chat — útil para quem usa Gmail pessoal. A conversa aparece no trace como qualquer outra. A parte de voz foi adiada por sua decisão.
- Conversas guardadas no Drive, sem o limite de 6 h, com resumo automático quando ficam longas.
- Memória: o agente anota fatos em `memory/AAAA-MM-DD.md`; `MEMORY.md` só é lido na DM do dono.
- Ritual de estreia (`BOOTSTRAP.md`): na primeira conversa, o agente pergunta seu nome e estilo.
- Skills: `skills/<nome>/SKILL.md`, lidas quando o agente precisa.
- Vários agentes: cada espaço do Chat ligado ao seu agente; na DM responde o ⭐.
- Grupos do Google em `users`.
- Publicação mais segura: detecta mudanças feitas direto no editor, guarda só as 5 últimas versões e volta sozinha para a anterior se o health falhar.
- "Verificar" na tela: checa pasta, arquivos, chamada real ao modelo e Chat configurado.

### F2 — Tarefas longas e aprovação ⏳

- Tarefas que passam de 30 s: o agente responde "pensando…" e continua em segundo plano, sem perder o progresso entre execuções.
- Ferramentas: Gmail, Drive, Sheets, Docs, Agenda e HTTP (só para hosts liberados em `http_allow`).
- Cards **Aprovar/Negar** no Chat antes de ações com efeito. Sem resposta, a ação é negada.
- Limites por tarefa (`steps`, `usd_per_run`) e nova tentativa automática quando o OpenRouter falha.

### F3 — Proatividade e dados ⏳

- `HEARTBEAT.md`: o agente confere uma checklist a cada 30 min, no horário ativo, e só fala se houver algo.
- `jobs.md`: agendamentos em formato cron (ex.: briefing do dia às 7h).
- Pasta `inbox/`: arquivos `.xlsx` soltos ali viram Google Sheets.
- Modelos prontos de agente: assistente executivo e analista de planilhas.

### F4 — Canais extras ⏳

- Gmail: e-mails com a label `gasclaw` viram tarefas, e a resposta sai na própria thread.
- Chamada por HTTP com token; MCP/A2A se a POC do GASADK aprovar.
- `npx gasclaw` para qualquer pessoa instalar.

<!-- Único lugar com o endereço do repositório: troque OWNER pelo dono real antes de abrir o repo. -->
[Não publicado]: https://github.com/gabazureus/gasclaw/commits/main

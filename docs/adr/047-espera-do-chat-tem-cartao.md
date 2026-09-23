# ADR-047 — Toda espera do Chat recebe o cartão, e a marca fica fora da pasta

- **Data:** 2026-09-22
- **Status:** aceita (conserto do incidente de 2026-09-21; tarefa alinhada com o dono)
- **Emenda:** [ADR-028](028-aprovacao-duravel.md) — item 7 (`ask` no ticket de 10 min) e a consequência
  "entrega assíncrona de um novo card pelo gatilho continua fora do escopo", ambos só para o caminho
  assíncrono do Chat.
- **Relaciona:** [ADR-026](026-run-duravel.md), [ADR-027](027-gatilho-worker.md), [ADR-029](029-autoridade-do-run-no-ponteiro.md)

## Contexto

Em 2026-09-21 o dono pediu no Chat uma auditoria da semana. O run durável parou em `waiting`, pedindo
aprovação de `tasks.create`, e o Chat ficou no "thinking…" para sempre. A entrega só agia em `done`/`failed`.
O clique (`durableChatClick`) existia, mas ninguém postava o cartão. O trace ainda dizia `ok`.

O commit 3ab7d54 passou a postar o cartão no `after` do pump. A auditoria seguinte achou o que ainda falhava:

1. **O cartão só tinha uma chance.** O `settle` tirava a espera da fila antes do POST. Se o Chat falhasse,
   ninguém revisitava o run. A marca de "já mandei" ficava no cache, e a credencial era gravada antes do POST,
   então uma falha também silenciava as tentativas seguintes.
2. **O run de ontem nunca receberia o cartão.** Ele já estava fora da fila, e o pump não o via mais.
3. **O `ask` saía como ticket de 10 min** do caminho síncrono. O clique retomava o turno FORA do run
   durável, com 20 s de orçamento, e o run ficava `waiting` para sempre. Uma resposta digitada virava um run
   novo, que ignorava a pergunta.
4. **Depois do Approve**, o cartão seguinte era trocado no lugar. A resposta final chegava duas vezes: no
   cartão e, um tique depois, pela entrega.
5. **Cada retomada mandava dois system prompts** ao modelo (o snapshot já guardava um), pagos dentro do teto.

## Decisão

1. **A espera do Chat fica na fila até o cartão sair.** `waitKey(run)` identifica a espera (`approval:<key>`,
   `ask:<key>`, `paused:<teto>`). O `settle` mantém na fila um run do Chat cuja espera ainda não tem cartão.
   O cartão sai no `after` da mesma volta, e só então o run deixa a fila. A fila não trava como em 2026-09-18,
   porque o cartão sai na mesma volta.
2. **A marca `prompted` mora na autoridade** (`A:<runId>`, Script Properties), fora da pasta compartilhável.
   Quem edita o arquivo do run não consegue nem silenciar nem forçar o cartão. `writeAuthority` preserva a
   marca. Ela é gravada só depois do POST dar certo.
3. **A espera sem cartão fica arrendada.** O ponteiro guarda o arrendamento do claim que a trouxe
   (`LEASE_MS`, 6 min). Outra execução do gatilho não a pega enquanto o cartão sai. Seriam dois cartões, e a
   credencial do segundo invalidaria a do primeiro. Se qualquer coisa falhar (Chat fora, Drive, Properties),
   a próxima tentativa vem quando o arrendamento vence. As 4 tentativas (`MAX_ATTEMPTS`) cobrem cerca de
   20 min. Esgotadas, a entrega desiste com o motivo. Um destino que diverge da autoridade desiste na hora.
4. **Varredura das esperas** (`recoverWaits`), para os runs parados antes deste conserto. Ela usa a MESMA
   leitura de Properties que o tique já fazia (`RunIO.scan`): uma autoridade com destino, sem ponteiro e sem
   `prompted` é candidata. Só aí o Drive é aberto, no máximo 3 por tique, e cada candidata é tratada uma vez:
   volta à fila (e o pump posta o cartão), é esquecida (acabou de vez), ou é marcada `handled`. Nada é
   re-assinado sem conferir a assinatura antes. A autoridade passa a guardar `folderId`. Nas antigas, a pasta
   é procurada entre os agentes cadastrados, pasta por pasta. Uma pasta que falha tem três tiques de chance
   e depois é marcada `handled`.
5. **`ask` durável no Chat**: os botões levam pasta e run, sem token. O clique confere quem clicou pelo
   e-mail do evento, como a tela (`runDecide`). A resposta DIGITADA responde a pergunta aberta: o índice
   `ASKRUN:<sessão>` (Properties) aponta a FILA de runs com pergunta aberta (decisão 10), e a mensagem só
   vale se vier de quem pediu o run e for da MESMA conversa.
6. **Depois do clique**, a continuação sai pelo caminho da entrega: a resposta final, ou o cartão da próxima
   espera, vai como mensagem nova, com recibo. O cartão clicado só confirma e perde os botões. O caminho
   síncrono legado (sem entrega) continua trocando o cartão no lugar. Ver a decisão 14: o clique já não faz
   o trabalho, só o registra.
7. **O trace ganha o status `waiting`**, com o que falta no passo (`aguardando: aprovação de tasks.create`).
8. **Resposta sem credencial passa por `RunIO.resume`** (pergunta do `ask` e Continue, no Chat, digitada ou
   na tela): trava, leitura do Drive e assinatura conferida antes de `enqueue` re-assinar. O botão leva a
   `waitKey` da espera que o criou e não responde uma espera posterior. Clique duplo não reaplica a resposta.
   De quebra, `runDecide` deixa de adotar um arquivo editado na pasta.
9. **O destino é fixado na primeira gravação, com ou sem destino.** Um run que nasceu sem entrega (tela,
   proativo sem DM) não ganha destino depois. `delivery` não é assinado, e adotar o do arquivo deixava quem
   edita a pasta escolher para onde iriam o cartão e a resposta final. O defeito era anterior; a varredura o
   tornava alcançável.

10. **Uma fila de perguntas por conversa.** `ASKRUN:<sessão>` guarda a ordem das perguntas digitáveis abertas.
   A mensagem digitada responde à MAIS ANTIGA, e o cartão das seguintes diz isso. Antes a mais nova tomava a
   vaga e a mais antiga ficava sem nenhuma forma de resposta quando não tinha opções. Escolhido por ser o
   comportamento que não perde pergunta nem depende de o dono escolher um cartão: a ordem é a do chat.
11. **O ponteiro só é apagado se ainda for o do claim** (`io.release`, sob a trava). Um clique que chegou
   enquanto o cartão saía já regravou o ponteiro; apagá-lo deixava o run `queued` sem ponteiro, parado.
12. **O POST do cartão é idempotente.** O `requestId` vem da espera (`runId|waitKey`) e, na aprovação, também
   da credencial; o token é reaproveitado enquanto a credencial gravada for a dele (cache como atalho, o hash
   no run decide). A Chat API devolve a mensagem já criada para o mesmo `requestId`, então falhar DEPOIS do
   POST — ao gravar a marca, com as Properties cheias — não manda um segundo cartão.
13. **A espera expira** (`WAIT_TTL_MS`, 7 dias, `expireWaits`): o run vira `failed` com o motivo, que é
   entregue no Chat quando veio de lá, e a autoridade sai das Properties. A candidata sai da mesma leitura do
   tique (`at` na autoridade), e o Drive só abre para ela. Sete dias porque a credencial vale 24 h e se renova
   no clique: uma semana cobre fim de semana e folga curta sem deixar lixo permanente nos 500 KB.

14. **O clique só REGISTRA a decisão; o trabalho é do gatilho** (2026-09-22, ao vivo). Retomar o turno dentro
   do clique gastava a janela de 30 s que o Chat dá a um cartão: o turno (modelo + ferramenta) não cabe, a
   execução morria, o Chat mostrava "gasclaw não processou sua solicitação" em vermelho, e o gatilho pegava
   o MESMO run em paralelo — os dois interrompidos, um no meio de uma chamada PAGA. O clique agora grava a
   decisão, devolve o run à fila e confirma no cartão; o worker de 1 min continua dali, em até um minuto.
   O run SEM entrega (tela, caminho síncrono) segue retomando na hora: ali quem espera é uma página aberta.
   Custo medido: UMA chamada ao modelo por aprovação, a mesma do caminho antigo (`triggerDoesTheWork`).
15. **Clique num cartão de pedido já encerrado diz que acabou, não que foi adulterado** (2026-09-22, ao vivo).
   Ao terminar, o run perde a autoridade de propósito (`forget`), e sem ela a conferência de assinatura não
   tem com o que comparar — o clique atrasado ouvia "this task was changed outside gasclaw", uma acusação
   falsa. `decide` passa a conferir o ESTADO antes da assinatura (leitura pura: nada grava, nada executa),
   como o caminho do `ask` (`resume`) já fazia.
16. **A estimativa do passo de sonho é POR AGENTE e esquece.** `DREAMSTEP_MS:<folderId>` guarda a janela dos
   últimos `DREAM_STEP_WINDOW` (5) tiques com passo medido; a estimativa é o maior da janela, nunca abaixo
   da conservadora (90 s) nem acima do teto `DREAM_STEP_CAP_MS` (240 s). A chave global anterior valia para
   todos os agentes e só crescia: um passo fora da curva impedia qualquer passo de começar, e sem passo não
   havia medida nova — o sonho parava para sempre. A chave termina em `:<pasta>`, então `forgetAgentProps` a
   apaga junto com o agente; a global sai uma vez.

## Consequências

- Tique ocioso: nenhuma leitura nova, e agora MEDIDO — o teste conta acessos a `DriveApp` e à Drive API com
  esperas recentes da tela e do Chat nas Properties, e exige zero.
- A varredura é um filtro sobre o mapa que o tique já lia. Com esperas
  já tratadas ela não abre o Drive (teste `nenhum tique ocioso relê o Drive`).
- Uma espera sem resposta segura a autoridade `A:` enquanto espera. Isso já valia antes. O teto de 500 KB das
  Properties é o limite.
- O índice `ASKRUN:` é um por conversa e guarda a FILA das perguntas digitáveis abertas, da mais antiga à
  mais nova (decisão 10). A pergunta respondida sai da fila; a chave é apagada quando a fila esvazia. O
  formato antigo (um `runId` cru) continua sendo lido, como lista de um.
- O aviso "outra pergunta minha ainda está aberta" é escrito no texto do cartão na hora do POST. Se a
  pergunta mais antiga for respondida depois, o aviso do cartão seguinte fica velho — ele continua dizendo
  que há outra na frente quando já não há. Aceito: o cartão do Chat não é reescrito por nós (o `requestId`
  estável existe justamente para NÃO mandar outra mensagem), e a mensagem digitada continua respondendo a
  mais antiga da fila, que nesse caso já é a dele. O aviso erra para o lado seguro.
- A credencial do cartão fica no CacheService por 6 h (`cardtok:<runId>`), só para o POST repetido ser o
  MESMO cartão. O cache do script não é legível por usuário nenhum, e quem manda continua sendo o hash
  gravado no run: um token de cache que não bate com a credencial é descartado.
- Os três limites da primeira versão foram FECHADOS na mesma data (decisões 10 a 12 acima): a fila de
  perguntas, o `release` condicional e o `requestId` estável. Fica em aberto só o que a plataforma impõe: se o
  Google Chat aceitar o POST e a resposta se perder na rede, a tentativa seguinte usa o mesmo `requestId` e o
  Chat devolve a mensagem já criada — nenhum cartão a mais.
- Mutação equivalente, agora com o teste da porta que realmente cobre: apagar a conferência de assinatura
  DENTRO do `promptInChat` não quebra nada, porque o claim (`runner.ts`, `c.tampered`) chega antes e é mais
  forte — recusa o run inteiro. O teste `arquivo adulterado NA FILA não vira cartão nem credencial` prende
  essa primeira porta; a segunda fica por escrito no código, como decisão.
- Implementação: `waitKey`/`waitLabel`/`WAIT_TTL_MS` (`src/run.ts`), `settle` (`src/runner.ts`),
  `scan`/`markPrompted`/`leaseOf`/`release`/`decide` (`src/runStore.ts`), `resume` (`src/runStore.ts`),
  `promptInChat`/`approvalToken`/`recoverWaits`/`findWaitRun`/`expireWaits`/`answerOpenAsk`/`openAsks`/`setOpenAsks`/`triggerDoesTheWork`/`durableChatClick`
  e o passo `poc p36 waits` (`src/main.ts`), `stableRequestId` (`src/chatDelivery.ts`),
  `approvalCard(…, durableAsk)` (`src/approval.ts`), `finish` (`src/trace.ts`). Testes em
  `test/chatEspera.test.ts`, `test/runner.test.ts` e `test/dreamTick.test.ts`.

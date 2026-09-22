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
   `ASKRUN:<sessão>` (Properties) aponta o run, e a mensagem só vale se vier de quem pediu o run.
6. **Depois do clique**, a continuação sai pelo caminho da entrega: a resposta final, ou o cartão da próxima
   espera, vai como mensagem nova, com recibo. O cartão clicado só confirma e perde os botões. O caminho
   síncrono legado (sem entrega) continua trocando o cartão no lugar.
7. **O trace ganha o status `waiting`**, com o que falta no passo (`aguardando: aprovação de tasks.create`).
8. **Resposta sem credencial passa por `RunIO.resume`** (pergunta do `ask` e Continue, no Chat, digitada ou
   na tela): trava, leitura do Drive e assinatura conferida antes de `enqueue` re-assinar. O botão leva a
   `waitKey` da espera que o criou e não responde uma espera posterior. Clique duplo não reaplica a resposta.
   De quebra, `runDecide` deixa de adotar um arquivo editado na pasta.
9. **O destino é fixado na primeira gravação, com ou sem destino.** Um run que nasceu sem entrega (tela,
   proativo sem DM) não ganha destino depois. `delivery` não é assinado, e adotar o do arquivo deixava quem
   edita a pasta escolher para onde iriam o cartão e a resposta final. O defeito era anterior; a varredura o
   tornava alcançável.

## Consequências

- Tique ocioso: nenhuma leitura nova. A varredura é um filtro sobre o mapa que o tique já lia. Com esperas
  já tratadas ela não abre o Drive (teste `nenhum tique ocioso relê o Drive`).
- Uma espera sem resposta segura a autoridade `A:` enquanto espera. Isso já valia antes. O teto de 500 KB das
  Properties é o limite.
- O índice `ASKRUN:` é um por conversa e sobrescrito pela pergunta seguinte. Ele é apagado quando a pergunta
  é respondida.
- Limites conhecidos: duas perguntas abertas sem opções na MESMA conversa dividem o índice `ASKRUN:`, e a
  resposta digitada vai para a mais recente (a mais antiga só se responde pelo botão, se tiver opções).
  `markPrompted` lê e regrava a autoridade sem trava; a corrida exige um clique no milissegundo entre o POST e
  a marca. Um POST que deu certo e só falhou depois (Properties cheias) repete o cartão uma vez no arrendamento
  seguinte.
- Mutações equivalentes (sobrevivem porque uma guarda anterior já cobre): trocar o destino pelo do arquivo
  (o `authorizedDelivery` exige igualdade antes) e desistir sem conferir a assinatura (o claim marca o run
  adulterado antes de chegar ao cartão).
- Implementação: `waitKey`/`waitLabel` (`src/run.ts`), `settle` (`src/runner.ts`), `scan`/`markPrompted`
  (`src/runStore.ts`), `resume` (`src/runStore.ts`), `promptInChat`/`recoverWaits`/`answerOpenAsk`/`durableChatClick` (`src/main.ts`),
  `approvalCard(…, durableAsk)` (`src/approval.ts`), `finish` (`src/trace.ts`). Testes em
  `test/chatEspera.test.ts` e `test/runner.test.ts`.

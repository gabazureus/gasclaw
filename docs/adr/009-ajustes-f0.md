# ADR-009 — Ajustes de minimal code na F0

- **Status:** Aceito · 2026-09-14

## Contexto
A F0 precisava rodar no mesmo dia, com o menor código possível e dentro dos limites
auditados do Apps Script. Na execução do plano
[`docs/plans/2026-09-14-gasclaw-f0-plano-implementacao.md`](../plans/2026-09-14-gasclaw-f0-plano-implementacao.md)
surgiram correções e desvios. Este ADR registra todos.

## Decisão
1. A chave do OpenRouter é salva em Script Properties pela tela gasclaw. O `.env.local` é a fonte local, e o `up` copia a chave para a área de transferência.
2. Chat app clássico, com resposta síncrona (no máximo 1.000 tokens).
3. Histórico em CacheService (20 mensagens, 6 h).
4. Um projeto GCP por ambiente, já que cada projeto tem uma única configuração de Chat app.
5. O vínculo GCP↔script e a configuração do Chat app são pausas guiadas.
6. O agente padrão é o primeiro da lista (⭐).
7. `users` aceita só e-mails. Lista vazia significa só o dono.
8. Health via `gcloud auth print-access-token` (login com `--enable-gdrive-access`).
9. A F0 não tem pump, triggers, heartbeat, jobs, Excel nem aprovações.
10. Web app com `access: MYSELF`: a tela é só do dono e `assertOwner` fica como defesa extra. O fallback `DOMAIN` **não foi necessário**, porque o Chat respondeu com `MYSELF` (Task 9).
11. O CI publica dev e prod sem health nem rollback automático. Até a F1, o rollback é manual, com `./gasclaw rollback --prod`.

## Correções feitas durante a execução (Tasks 1–8)
12. **Task 1:** o `npm install` do plano não trazia `@types/node` (peer opcional do vitest 5) e deixava o `typescript` sem versão. Como o `tsc --noEmit` cobre `test/`, que importa `node:*`, entraram `@types/node@24` (24.13.4) e `typescript@7.0.2`. Todas as devDependencies ficaram com versão exata.
13. **Task 6:** `(): void => props().setProperty(...)` falha no TS 7 (TS2322: `Properties` não é `void`). Os setters do `store.ts` passaram a usar corpo em bloco.
14. **Task 7:** o `settings.html` ganhou acessibilidade mínima: `lang="pt-BR"`, `<label for>` nos campos e `role="status"`/`aria-live` nas mensagens e na resposta.

## Desvios das Tasks 9 e 10
15. **O `gh` saiu do `up`.** No macOS, a instalação compilava a partir do código-fonte. Ele só é necessário para o GitHub (Task 10), então será instalado quando essa task voltar.
16. **O rollback foi testado sem a alteração trivial do Step 9.** O `up` de reativação publicou a versão 2, com o mesmo conteúdo da 1, e o `rollback` voltou para a 1. Assim a mecânica foi validada sem mudar código.
17. **O prod foi criado antes do GitHub.** O `./gasclaw up --prod` publicou `gasclaw-prod` (versão 1, Chat app configurado), mas a chave ainda não foi salva na tela de prod.
18. **O GitHub foi adiado por decisão do usuário.** O `.github/workflows/deploy.yml` está commitado, mas faltam o repositório privado, o secret `CLASPRC_JSON`, o push e a POC P7. A pendência está no Beads (`gasclaw-mw8`).
19. **`.env` entrou no `.gitignore`**, além do `.env.local`, depois que a chave apareceu parcialmente numa sessão local.
20. **Numeração das POCs:** o usuário decidiu que a **P6** é "agentes em Google Docs/Sheets nativos" (início da F1). A POC do Excel, que a spec chamava de P6, passa a ser a **P8** (F3). A P7 continua sendo a do token do CI.

## Consequências
- Os itens 1–11 têm substituição planejada na Parte D do plano da F0 e em [`conductor/tracks.md`](../../conductor/tracks.md).
- A F0 fecha **com ressalva**: publicação automática (GitHub/CI, POC P7) pendente, além de três verificações manuais pendentes da Task 9 (haicai no `SOUL.md` sem deploy, histórico no Chat, conversa de outra pessoa do domínio).
- A spec (§10 e §11) ainda usa a numeração antiga das POCs. Vale o item 20 até a spec ser revisada.

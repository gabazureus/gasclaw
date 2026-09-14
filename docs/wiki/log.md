# Wiki log

> Append-only, chronological record of every operation (ingest, saved query, lint,
> refactor). One entry each: `## [YYYY-MM-DD] <op> | <title>`. Parse with
> `grep "^## \[" wiki/log.md | tail -10`. (No frontmatter on this file.)

## [SCAFFOLD] bootstrap | LLM Wiki initialized
Canonical Karpathy LLM-Wiki scaffolded (pure markdown): raw/{sources,assets} +
wiki/{entities,concepts,synthesis,sources,queries,comparisons} + index/log/overview.
Schema in KARPATHY.md. Drop external material in raw/sources/ and ask the LLM to
ingest it.

## [2026-09-14] refactor | wiki movido para docs/wiki (ADR-007)
`wiki/` → `docs/wiki/`, `raw/` → `docs/raw/`; caminhos atualizados em KARPATHY.md.

## [2026-09-14] ingest | Pesquisa de referências para o gasclaw
Fonte: docs/raw/sources/2026-09-14-pesquisa-referencias.md → wiki/sources/pesquisa-referencias-2026-09-14.md.

## [2026-09-14] ops | Primeiro deploy dev do gasclaw (Task 9)
- `./gasclaw up` (dev): projeto `gasclaw-dev-example`, script e web app publicados (versão 1). `doctor` passou nos 10 itens.
- Tela: chave salva, 1 agente adicionado. Chat: o app respondeu como agente com `access: MYSELF`, sem precisar trocar para `DOMAIN`.
- POC P1 passou: 109,5 s, 110,1 s e 126,1 s sem erro (ADR-010).
- Operação: `down` fez o Chat responder "pausado"; `up` reativou e publicou a versão 2; `rollback` voltou para a versão 1.
- Desvios: o `gh` saiu do `up` (compilava do código-fonte); o rollback foi feito sem alteração trivial de código (a versão 2 tem o mesmo conteúdo da 1).
- Pendentes: haicai no `SOUL.md` sem deploy, histórico no Chat, conversa de outra pessoa do domínio.

## [2026-09-14] decisão | Agentes em Google Docs/Sheets nativos → POC P6 na F1
Proposta do usuário: trocar markdown por Google Docs (texto) e Google Sheets (dados). Decisão: a F0 fecha com markdown; a F1 começa pela POC P6 (leitura híbrida Doc/.md, config em planilha, latência e fidelidade medidas). Se passar, o ADR-012 complementa o ADR-002.

## [2026-09-14] ops | Ambiente prod criado; GitHub adiado (Task 10 parcial)
- `./gasclaw up --prod`: projeto `gasclaw-prod-example`, script e web app publicados (versão 1), app do Chat "gasclaw" configurado. Health: ativo, falta salvar a chave na tela de prod.
- `.github/workflows/deploy.yml` criado localmente (CI dev → prod), sem push.
- Histórico git verificado antes do push planejado: 12 commits sem segredos nem arquivos sensíveis.
- Decisão do usuário: **não subir para o GitHub agora**. Pendentes: `gh auth login`, repositório privado, secret `CLASPRC_JSON`, push e POC P7 (validade do token do CI).

## [2026-09-14] ops | F0 fechada (Task 11); F1 preparada com a POC P6
- Task 11: `docs/adr/009-ajustes-f0.md` (itens 1–14 do plano + desvios 15–20), índice de ADRs e `conductor/tracks.md` com F0–F4.
- F0 marcada ✅ no `CHANGELOG.md`. **Ressalva:** a Task 10 (GitHub/CI, POC P7) segue adiada (`gasclaw-mw8`); também faltam as verificações manuais da Task 9 (haicai sem deploy, histórico no Chat, outra pessoa do domínio) e a chave na tela de prod.
- Numeração das POCs: P6 = agentes em Docs/Sheets nativos (F1); o Excel da spec passa a ser P8 (ADR-009, item 20).
- POC P6 desenhada, sem código: `poc/p6-docs-nativos/README.md` (C1 < 3 s sem cache, C2 < 200 ms com cache, C3 invalidação, C4 títulos e listas, C5 pasta mista).
- Verificação: `npm test` com 28/28 testes verdes; links locais dos docs alterados conferidos.

## [2026-09-14] ops | POC P6 em teste no dev
- Fonte da verdade conferida: export da Drive API v3 `GET /drive/v3/files/{id}/export?mimeType=text/markdown` (limite de 10 MB; aceita os escopos `drive`, `drive.readonly`, `drive.file` e `drive.meet.readonly`). Sem escopo novo: listagem (V2) e export via UrlFetch com o token do script; planilha `config` exportada como `text/csv`.
- Núcleo puro (TDD): `resolveRoles`, `signature`, `mergeConfig`, `buildSpec` por papel; regressão `.md` idêntica à F0. Produção segue lendo só `.md` até o ADR-012.
- Harness `poc/p6-docs-nativos/harness.ts` + botão "Rodar POC P6"; `./gasclaw up` publicou o dev na versão 3 com health ok. Aguardando a medição manual do usuário.

## [2026-09-14] ops | POC P6 automática: passou (ADR-012)
- `./gasclaw poc <id>` criado: chama `?action=poc` no web app dev (token do gcloud, dono verificado), com registro de POCs (P1 e P6) e exit ≠ 0 se algum critério falhar. O botão manual da P6 saiu da tela.
- Fixtures idempotentes em `gasclaw-poc/p6-teste` e `gasclaw-poc/p6-misto` (import markdown → Doc e CSV → Sheet pela Drive API; nada é apagado).
- Dev versão 4; 2 execuções completas: C1 1.091/1.224 ms; V1 472/608 ms e V2 294/383 ms (acima de 200 ms) → validade de 30 s (54/77 ms); C3, C4, C5 e a config pela planilha ✅. Duração de 66/51 s. Conferido sem duplicatas (5 e 4 arquivos).
- Decisão: leitura híbrida por papel + cache de 30 s ([ADR-012](../adr/012-agentes-em-docs-e-sheets.md)); implementação em produção na F1.

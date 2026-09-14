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

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

## [2026-09-14] ops | POC P10 automática: passou (ADR-013)
- Convenção decidida pelo usuário: `agentes/<nome>/<PAPEL>.md.html` no editor do Apps Script (no projeto: `agentes/<nome>/<PAPEL>.md`, tipo HTML), só markdown puro; precedência por papel editor → Google Doc → `.md`; editor opcional por papel.
- `./gasclaw poc p10` (etapas no PC em `poc/p10-editor/pc.sh`, veredito puro em `summary.ts`). Execução 1 completa: C1 ✅ (sha256 igual); C3 `getContent()` **não fiel** (escapa `<`), `getRawContent()` fiel (7 ms), export do HEAD pela Drive API fiel (419 ms) e lista sem hardcode; `projects.getContent` 403 (sem escopo novo); precedência editor, editor, doc, md; C4 export do HEAD vê a edição sem deploy, `@HEAD` vê (9 ms), publicar versão 21,4 s; C5 `up` 34,8 s preserva a edição; C6 só `_motor.gs` com "NÃO EDITE". Execução 2 parcial (interrompida por mudança de prioridade) repetiu C1, C3 (export até 1.270 ms) e C4; um 404 isolado no `/dev`.
- Produto no dev: motor único `_motor.gs`; `up` faz pull de `agentes/**` antes do push; "Novo agente" cria `Meu Drive/gasclaw/agentes/<nome>/`; health lista os links das pastas. Leitura do editor no `loadAgent` aguarda o gate.
- P14 (trace do agente) entrou na esteira e na F1 (Beads `gasclaw-5rn`).

## [2026-09-14] ops | Trace do agente no dev (POC P14, ADR-014)
- Núcleo puro `src/trace.ts` (TDD, canário `sk-or-`/`ya29.`/`Bearer`) + borda `src/runlog.ts` que nunca lança: cache ao vivo, planilha `gasclaw — execuções` (1 linha por run) e `gasclaw/runs/<id>.json` (90 dias, limpeza sem trigger). Sem escopo novo: Sheets API aceita o escopo `drive`; `up` habilita `sheets.googleapis.com`.
- Instrumentado em `main.ts`: Chat, Testar e POCs. Tela: seção "Ao vivo" (polling 5 s, para com aba oculta) + detalhe do run. CLI: `./gasclaw trace [id]`, `./gasclaw runs`.
- `./gasclaw poc p14`, 2 execuções: C2–C5 e C7–C10 ✅; C1 ❌ p95 3.893 ms (profile: upload do JSON 1,3–1,6 s; variação de 2–3× nas primitivas do Google entre medições); C6 tela 2,5 s ✅, planilha 5,2 s. A 1ª medição do C6 (12 s) estava contaminada pelo `gcloud` na sonda; corrigida para latência pelo `startedAt` do servidor.
- Run real: `resolve_agent` 1.932 ms · `llm_call` 1.684 ms (deepseek, 353 tokens, US$ 0,00023892) · `reply` 0 ms; cobertura 0,92.
- Gate da P10 respondido pelo usuário: ler os arquivos do editor pelo export do HEAD com cache de 30 s; implementação logo em seguida.

## [2026-09-14] ops | Leitura do editor ligada no loadAgent (gate da P10, C7)
- Gate respondido: ler os arquivos do editor pelo export do HEAD com cache de 30 s. `loadAgent` de produção = editor → Google Doc → `.md` (+ planilha `config`), com fallback para o Drive e `editorError` no span `resolve_agent` do trace. Núcleo puro (TDD): `assembleAgent`, `roleTexts`, `driveSources`; regressão da F0 mantida. Funções de Drive movidas de `poc/` para `src/drive.ts`.
- `./gasclaw poc p10 c7` (dev v14): edição no editor usada pelo agente em 12,8 s sem `up`; leitura sem cache 2.052 ms, com cache 28 ms; precedência editor, editor, doc, md; export quebrado (404) → md, doc, doc, md com `editorError`.
- Tela Ao vivo: detalhe do run abre como acordeão logo abaixo da linha (um aberto por vez; o polling preserva o aberto, o foco e a rolagem).

## [2026-09-15] ops | Escopos da reautorização única, E5 integrada e seção Observabilidade (código)
- ADR-015: escopos novos conferidos na doc oficial: `script.scriptapp`, `gmail.readonly`, `gmail.compose`, `calendar.events`, `script.processes`, `script.send_mail`, `monitoring.read`, `tasks`, `contacts.readonly`, `contacts.other.readonly`, `calendar.events.freebusy` (o `calendar.freebusy` só cobre as agendas do próprio usuário). Dev e prod já em projeto GCP padrão. v18 não publicada: gcloud expirado.
- Lock local do dev (`lock_dev`) para duas pistas; E5 da Pista Motor integrada no `main.ts` (`c9c11c9`).
- Observabilidade (commits `e280f66`, `3458c30`, `ae22cd0`): turno só enfileira; lote de 1 min com fallback (tela/turno se > 1 min); uso por hora UTC × modelo nas Properties; modelo por agente na tela (tela > planilha > AGENTS, recusa sem tools); gráfico SVG 7 dias → 24 h; painel de limites com selo Google/OpenRouter × medido; `./gasclaw limits` e `usage`. ADR-016 e ADR-018 escritos; P15/P16 automáticas escritas, medição pendente.

## [2026-09-15] lint | Auditoria completa do código, dos testes e das docs (branch audit)
- Seis revisões em paralelo (segurança, qualidade, complexidade, cobertura de testes, docs e script `gasclaw`), com verificação adversarial: 0 críticos, 12 altos, 25 médios e 18 baixos que se sustentaram.
- Corrigido no worktree `audit` com TDD: lote idempotente (uso em partes de até 8 KB, fila marcada na mesma escrita, JSON com novas tentativas, entradas corrompidas ignoradas, planilha apagada recriada); `redact` com mais formatos e nas chaves; frontmatter com BOM/CRLF; eval com espaço próprio e `steps` do agente; retomada da aprovação sem perder mensagens; cotas do painel pela conta dona do script (Workspace × gmail.com); processos paginados.
- Decisões do usuário registradas: [ADR-020](../adr/020-trace-em-lote.md) (trace em lote de 1 min) e [ADR-021](../adr/021-acesso-aprovado-no-painel.md) (acesso e ferramentas só pelo painel; núcleo pronto, painel com a Pista Observabilidade).
- Docs alinhadas ao código: glossário e module map, índice de ADRs, READMEs espelhados, `como-usar`, runbook, `tracks.md`, `tech-stack`, `product.md`, READMEs das POCs P14–P16. Beads: `gasclaw-5rn` fechada como duplicata de `gasclaw-exl`.
- Diffs para `gasclaw`, `build.mjs`, `main.ts`, PROGRESS e CHANGELOG entregues à Pista Observabilidade (lock por máquina, conferência da versão criada, CSRF em doPost, trace do clique na tela).

## [2026-09-15] lint | Um teste escrito pela mesma cabeça que escreveu a fórmula não a valida
- **O erro:** o p95 da POC P11 usava `⌊0,95·n⌋`, que com n=20 e índice-base zero cai no **último** elemento — ou seja, calculava o máximo e chamava de p95. Isso reprovou o C2 por causa de um único turno de 35,8 s, com mediana de 4,1 s e 18 de 20 turnos abaixo de 10 s.
- **Por que passou despercebido:** o teste que eu escrevi esperava `4900` numa série que termina em `4900`. Ele repetia a fórmula em vez de conferir a resposta, então passou confirmando o engano.
- **A lição:** onde a régua é matemática (percentil, média, custo, taxa), o teste precisa de pelo menos um caso com **resposta conhecida de fora**, calculada à mão — não derivada do mesmo raciocínio que gerou o código. Em `test/p11.test.ts` isso virou: 20 valores de 100 a 2000 → p95 = 1900 (o 19º menor), e não 2000.
- **O que não fiz:** re-medir depois de corrigir a régua. O veredito foi recalculado sobre os mesmos dados; re-medir com a régua nova seria trocar a evidência para obter o resultado desejado.
- Ver [ADR-025](../adr/025-rodizio-de-modelos-gratuitos.md) e `poc/p11-free/README.md`.

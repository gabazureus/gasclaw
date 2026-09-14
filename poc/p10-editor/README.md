# POC P10 — Arquivos do agente no editor do Apps Script

- **Status:** ✅ passou · 2026-09-14 · Beads `gasclaw-da8` · decisão no [ADR-013](../../docs/adr/013-autoria-editor-e-drive.md)
- **Fase:** F1 · complementa o ADR-002 e o ADR-012

## Pergunta
Dá para escrever o agente **dentro do editor do Apps Script** (estilo Eve), com o nome do
arquivo fazendo papel de pasta, deixando o motor num único arquivo, sem perder a pasta do
Drive, sem deploy a cada edição e sem o `./gasclaw up` apagar o que foi editado?

## Convenção testada (decisão do usuário)
- Arquivo do agente no editor: `agentes/<nome>/<PAPEL>.md.html` (no projeto: `agentes/<nome>/<PAPEL>.md`, tipo HTML), **markdown puro**, sem tag nem wrapper.
- Precedência por papel: **editor → Google Doc → `.md` do Drive**. O editor é opcional por papel.
- Motor: um arquivo só, `_motor.gs`, com cabeçalho "NÃO EDITE".

## Critérios medidos (passa só se todos passarem)
| # | Critério | Como é medido |
|---|---|---|
| C1 | `clasp push`/`pull` preservam `agentes/p10/SOUL.md.html` | sha256 local = sha256 do pull; export do projeto lista `agentes/p10/SOUL.md` tipo `html` |
| C2 | Como o editor mostra | medido pelo usuário: lista plana, ordem alfabética, caminho no nome (sem pastas que abrem) |
| C3 | Runtime lê com fidelidade byte a byte, lista sem hardcode, em < 3 s | 3 variantes × 5 leituras: `createHtmlOutputFromFile().getContent()`, `createTemplateFromFile().getRawContent()`, export `application/vnd.google-apps.script+json` pela Drive API; tentativa de `projects.getContent`; precedência com a pasta `gasclaw-poc/p10/agentes/p10` (esperado `editor, editor, doc, md`) |
| C4 | Edição no editor chega ao agente sem novo `up` | edição simulada (pull do HEAD → altera → push do HEAD inteiro) e três caminhos: export do HEAD na versão fixa · implantação `@HEAD` · publicar versão |
| C5 | `./gasclaw up` não apaga edições do editor | nova edição → `deploy` (o caminho do `up`) → pull e runtime contêm a marca |
| C6 | Motor em 1 arquivo | lista do projeto depois do `up`: só `_motor` (server_js, com "NÃO EDITE") + `settings` + `appsscript` + `agentes/**` |

## Como rodar (100% automático)
```bash
./gasclaw poc p10          # tudo: fixture → C1 → C3 → C4 → C5 → C6; exit ≠ 0 se falhar (~3 min, cria 3 versões no dev)
./gasclaw poc p10 setup    # só a pasta do Drive
./gasclaw poc p10 read     # só a leitura no runtime (versão atual)
```
O `gasclaw` carrega `pc.sh` (etapas no PC com clasp) quando existe `poc/<id>-*/pc.sh`; o
veredito é `summary.ts` (puro, testado em `test/p10.test.ts`). Observações brutas em `.tmp/p10/`.

## Fixtures (idempotentes)
- Editor: `fixture/agentes/p10/AGENTS.md.html` e `SOUL.md.html` (com `<`, `>`, `&`, `&amp;`, `**`, crase, `${`, `<?=`, `<script>`, comentário HTML, espaços no fim, acentos e emoji). Cada execução restaura o fixture e deixa as marcas das edições simuladas no `SOUL` do HEAD.
- Drive: `gasclaw-poc/p10/agentes/p10/` com `AGENTS.md`, Doc `SOUL`, Doc `IDENTITY` + `IDENTITY.md`, `USER.md` (sobrescritos, nunca duplicados).

## Resultado
Tabela completa no [ADR-013](../../docs/adr/013-autoria-editor-e-drive.md). Resumo: C1, C3–C6 ✅; `getContent()` **altera** o
texto (HtmlService processa o HTML); `getRawContent()` e o export do HEAD são fiéis byte a byte.

# ADR-013 — Autoria em ambas as superfícies: editor do Apps Script + pasta do Drive (POC P10)

- **Status:** Aceito (convenção e medição) · 2026-09-14 · complementa o [ADR-002](002-agente-pasta-sem-codigo.md) e o [ADR-012](012-agentes-em-docs-e-sheets.md). Levar a leitura do editor para produção aguarda o gate do usuário.

## Contexto
O usuário quer, como no Eve, um único arquivo de motor no projeto Apps Script e o resto
editável no próprio editor, com o nome do arquivo fazendo papel de pasta, **sem abandonar a
pasta do Drive** ("em ambas"). O editor só aceita `.gs`, `.html` e `appsscript.json`, e mostra
uma lista plana em ordem alfabética com o caminho no nome, sem pastas que abrem e fecham
(medido pelo usuário). Riscos: o texto sair alterado, a edição não chegar ao agente sem deploy
(a implantação versionada não enxerga o HEAD) e o `./gasclaw up` (`clasp push --force`) apagar
o que foi editado no editor. Critérios da [POC P10](../../poc/p10-editor/README.md).

## Fonte da verdade
- Export do projeto: `GET /drive/v3/files/{scriptId}/export?mimeType=application/vnd.google-apps.script+json` devolve o **HEAD** (nome, tipo e `source` bruto de cada arquivo) com o escopo `drive`, que já está no manifesto.
- Apps Script API `projects.getContent`: exige `script.projects(.readonly)`; com o token do script deu **403 "insufficient authentication scopes"**. Não foi pedido escopo novo.
- Chat: o quickstart oficial manda colar o *Head deployment ID* na configuração do app. Não foi medido, porque exigiria mudar o console, e não é o caminho recomendado.

## Medição (dev, `./gasclaw poc p10`, 2 execuções completas e automáticas)
A execução 1 foi completa e passou em tudo. A execução 2 levou um 404 isolado no `/dev` na
primeira tentativa. Na segunda, foi **interrompida no C4 por mudança de prioridade**: repetiu
C1, C3 e parte do C4.

| Critério | Execução 1 (v5–v7, completa) | Execução 2 (v8–v9, parcial) | Resultado |
|---|---|---|---|
| C1 push/pull `agentes/p10/SOUL.md.html` ↔ projeto `agentes/p10/SOUL.md` (html), sha256 igual | ok | ok | ✅ |
| C2 exibição no editor | lista plana, caminho no nome (usuário) | — | 🟡 aceito pelo usuário |
| C3 `createHtmlOutputFromFile().getContent()` | **não fiel** (SOUL 299 de 318 bytes), 19 ms | **não fiel** (`<` vira `&lt;`), 6–10 ms | ❌ descartado |
| C3 `createTemplateFromFile().getRawContent()` | fiel, 7 ms | fiel, 10–11 ms | ✅ (só a versão publicada) |
| C3 export do HEAD pela Drive API (lista + texto, máx. de 5) | fiel, 419 ms | fiel, 568–1.270 ms | ✅ (< 3 s) |
| C3 listagem sem hardcode (prefixo `agentes/<nome>/`) | 418 ms | 497–913 ms | ✅ |
| C3 precedência com a pasta do Drive | editor, editor, doc, md | editor, editor, doc, md | ✅ |
| C3 pasta do Drive criada sem duplicar | mesmo id 2× | mesmo id 2× | ✅ |
| C4 versão fixa lendo pelo HtmlService vê a edição? | não (esperado) | não (esperado) | controle |
| C4 export do HEAD vê a edição, sem deploy | sim, na 1ª leitura (7,6 s de chamada; 387 ms de leitura) | sim, na 1ª leitura (479 ms) | ✅ |
| C4 implantação `@HEAD` (web app `/dev`) vê a edição | sim (9 ms) | sim (9 ms); 404 isolado na tentativa anterior | ✅ |
| C4 publicar versão (`create-version` + implantação) | sim, 21,4 s | não rodou (interrompida) | ✅ |
| C5 editar → `up` → edição continua no editor e no runtime | sim (`up` 34,8 s) | não rodou | ✅ |
| C6 projeto = `_motor` (server_js, "NÃO EDITE") + `settings` + `appsscript` + `agentes/**` | ok | não rodou | ✅ |

Detalhe do C3: o `HtmlService` trata o arquivo como HTML de saída e escapa parte do texto
(ex.: `e <?= scriptlet ?>.\n\n- a < b` volta como `e &lt;?= scriptlet ?>.\n\n- a &lt; b`). O
AGENTS, sem `<`, voltou igual. `getRawContent()` e o export devolvem o texto do editor byte a
byte, com `<`, `>`, `&`, `&amp;`, `**`, crase, `${`, `<?=`, `<script>`, `---`, espaços no fim,
acentos e emoji.

## Decisão
1. **Convenção (decidida pelo usuário):** o arquivo do agente no editor é
   `agentes/<nome>/<PAPEL>.md.html` (no projeto, `agentes/<nome>/<PAPEL>.md`, tipo HTML), com
   **só markdown puro**, sem tag nem wrapper. Não existem pastas de verdade no editor: o nome
   faz papel de pasta.
2. **Precedência por papel (decidida pelo usuário):** editor → Google Doc → `.md` do Drive →
   `(missing)`, para todos os papéis (`resolveRoles`). O editor é **opcional por papel**:
   dá para ter só `AGENTS` e `SOUL` no editor e o resto no Drive.
3. **Leitura:** pelo **export do HEAD pela Drive API** (lista e texto numa chamada só, fiel,
   sem escopo novo), com a mesma validade de cache de 30 s do ADR-012. Nunca por
   `getContent()`.
4. **Como uma edição no editor é publicada:** **não precisa publicar**. Salvar no editor
   grava o HEAD, e o agente, rodando na implantação versionada, lê o HEAD na próxima leitura
   (até 30 s com cache). É o mesmo comportamento da pasta do Drive. O `./gasclaw up`
   continua publicando só o motor.
5. **`./gasclaw up` preserva o editor:** antes do `push --force`, faz `clasp pull` do HEAD
   (3 tentativas; se falhar, não publica) e copia `agentes/**` para o `dist/`. O repositório
   não guarda os arquivos do editor: o HEAD é a fonte da verdade deles.
6. **Motor em 1 arquivo:** o build gera só `_motor.gs` (primeiro da lista do editor), com o
   cabeçalho `// gasclaw · MOTOR · NÃO EDITE: gerado pelo build e substituído a cada ./gasclaw up…`.
7. **Pasta do Drive criada sozinha (decidida pelo usuário):** "Novo agente" cria ou reutiliza
   `Meu Drive/gasclaw/agentes/<nome>/` (`ensureFolderPath`, sem duplicar), semeia os arquivos e
   registra a pasta. "Usar pasta existente" continua. O link aparece na tela e no health
   (`./gasclaw status` e fim do `up`).

## O que acontece com o ADR-002
Continua valendo e é **ampliado**, não substituído: o agente passa a ser "pasta do Drive
e/ou arquivos `agentes/<nome>/` no editor". A regra central fica igual: **nenhum texto do agente
vira código**. Os arquivos do editor são HTML lidos como texto bruto, nunca `.gs` e nunca
avaliados como template. A variante `.gs` com `String.raw` foi descartada pelo usuário:
executaria como código, e um erro de sintaxe no texto do agente derrubaria o projeto inteiro.

## Consequências
- F1: ligar no `loadAgent` de produção a leitura do editor (export do HEAD) junto com a
  leitura híbrida da P6, com cache de 30 s; testar "Novo agente" na tela.
- Alternativas medidas e não escolhidas: apontar o Chat para o `@HEAD` expõe todo push de motor
  ainda sem versão, sem rollback. Publicar uma versão a cada edição custa cerca de 21 s e um
  comando a mais.
- Quem edita o editor do projeto também pode editar o motor. A garantia de que o motor não
  foi mexido vem do `up` (sobrescreve o motor) e do cabeçalho, não de permissão.
- A implantação `@HEAD` (`/dev`) deu **um 404 isolado** numa execução (o ID do `@HEAD` não
  mudou), e 24 chamadas seguidas logo depois de pushes não reproduziram o erro. A POC agora tenta
  até 3 vezes e registra as tentativas. É mais um motivo para não depender do `@HEAD` no caminho do Chat.
- O export traz o projeto inteiro (cerca de 38 KB hoje, com o motor). Se crescer, medir de novo.
- Cada `./gasclaw poc p10` cria 3 versões no dev. A poda de versões fica no item "Deploy seguro" da F1.

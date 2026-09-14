# POC P6 — Agentes em Google Docs/Sheets nativos

- **Status:** ✅ passou · 2026-09-14 · Beads `gasclaw-0ce` · decisão no [ADR-012](../../docs/adr/012-agentes-em-docs-e-sheets.md)
- **Fase:** início da F1 · complementa o ADR-002

## Pergunta
Um agente pode ser escrito em **Google Docs** (e configurado numa **planilha**) sem
estourar o prazo de 30 s do Chat e sem perder a estrutura do texto? E `.md` e Doc podem
conviver na mesma pasta?

## Hipótese (decisão do usuário)
- **Leitura híbrida por papel, sem configuração:** para cada papel (AGENTS, SOUL, IDENTITY,
  USER), um Google Doc com esse nome tem prioridade; senão vale o `.md`; senão `(missing)`.
- **Config** (`model`, `users`) numa planilha `config` (colunas `chave, valor`). Sem a
  planilha, vale o frontmatter do `AGENTS`.
- **Criação:** a tela oferece "Criar como: Google Docs | Markdown". Pastas `.md` existentes
  continuam funcionando.

## Critérios medidos (passa só se todos passarem)
| # | Critério | Como é medido |
|---|---|---|
| C1 | 4 Docs lidos e convertidos em **< 3 s sem cache** | 5 leituras seguidas; vale o **máximo** |
| C2 | **< 200 ms com cache**, checagem de mudança incluída | V1 (`DriveApp`) e V2 (`files.list`), 5 leituras cada; se nenhuma passar, validade de 30 s (só `cache.get`) |
| C3 | Cache invalida quando um Doc é editado | o harness reescreve o `SOUL` pela Drive API e lê de novo: precisa dar *miss* com texto novo |
| C4 | Export preserva **títulos H1–H3 e listas** (marcadores, aninhada, numerada) | `checkMarkdown` sobre o `SOUL` exportado |
| C5 | Pasta mista resolve cada papel | `p6-misto` precisa dar `doc, doc, md, md` |

## Como rodar (100% automático)
```bash
./gasclaw up          # publica o dev
./gasclaw poc p6      # setup → run 1 → edita o SOUL → run 2 (C3) → misto (C5); exit ≠ 0 se falhar
./gasclaw poc p6 setup   # só as fixtures
./gasclaw poc p6 run     # só a medição (fixtures já existentes)
```
O comando chama `?action=poc&id=p6` no web app dev com o token do gcloud (o mesmo caminho
do `health`), e o `doGet` exige o dono (`MYSELF` + `assertOwner`).

## Fixtures (idempotentes, nada é apagado)
- `gasclaw-poc/p6-teste`: Docs `AGENTS`, `SOUL`, `IDENTITY` e `USER` (importados de markdown) e a planilha `config` (importada de CSV).
- `gasclaw-poc/p6-misto`: Docs `AGENTS` e `SOUL`; arquivos `IDENTITY.md` e `USER.md`.
- Cada execução **reutiliza** as pastas e **sobrescreve o conteúdo** dos arquivos
  (`files.update`). Nada é criado em duplicata nem apagado. A pasta `gasclaw-poc/` fica
  para as próximas POCs; apague à mão se não quiser mais.

## Resultado
Ver a tabela de medição no [ADR-012](../../docs/adr/012-agentes-em-docs-e-sheets.md): C1 ~1,1 s;
V1 472–608 ms e V2 294–383 ms (ambas acima de 200 ms) → **validade de 30 s** (54–77 ms);
C3, C4, C5 e a config pela planilha passaram nas duas execuções.

## Código
- Núcleo puro em `src/workspace.ts`: `resolveRoles`, `signature`, `mergeConfig`, `buildSpec`
  por papel (testes em `test/workspace.test.ts`).
- Harness descartável em `harness.ts` (`checkMarkdown`, `multipartBody` e `summarizeP6`
  testados em `test/p6.test.ts`). Sai do código quando a leitura híbrida entrar em produção.

# POC P6 — Agentes em Google Docs/Sheets nativos

- **Status:** em teste no dev (versão 3) · 2026-09-14 · Beads `gasclaw-0ce`
- **Fase:** início da F1 · **Se passar:** ADR-012 (complementa o ADR-002)

## Pergunta
Um agente pode ser escrito em **Google Docs** (e configurado numa **planilha**) sem
estourar o prazo de 30 s do Chat e sem perder a estrutura do texto? E `.md` e Doc podem
conviver na mesma pasta?

## Hipótese (decisão do usuário)
- **Leitura híbrida por papel, sem configuração:** para cada papel (AGENTS, SOUL, IDENTITY,
  USER), um Google Doc com esse nome tem prioridade; senão vale o `.md`; senão `(missing)`.
- **Config** (`model`, `users`) numa planilha `config` (colunas `chave | valor`). Sem a
  planilha, vale o frontmatter do `AGENTS`.
- **Criação:** a tela oferece "Criar como: Google Docs | Markdown". Pastas `.md` existentes
  continuam funcionando.
- **Dados** em Google Sheets nativo, nunca CSV.

## Critérios medidos (passa só se todos passarem)
| # | Critério | Como medir |
|---|---|---|
| C1 | 4 Docs lidos e convertidos em **< 3 s sem cache** | 5 execuções com o cache limpo; vale o **máximo** |
| C2 | Mesma leitura em **< 200 ms com cache**, validação de mudança incluída | 5 execuções seguidas sem editar nada; vale o máximo |
| C3 | Cache invalida quando um Doc é editado | editar 1 Doc e rodar: deve ser *miss* e trazer o texto novo |
| C4 | Export Doc→markdown preserva **títulos (H1–H3) e listas** (com marcadores, numeradas, aninhadas) | comparar a saída com `esperado.md` (lista de checagem abaixo) |
| C5 | Pasta mista (2 Docs + 2 `.md`) resolve cada papel certo | a saída indica a origem de cada papel (`doc`/`md`/`missing`) |

Registrado como informação, fora dos critérios: tempo de leitura da planilha `config` e os
escopos OAuth novos.

## Variantes a medir (escada minimal-code: nativo antes de código)
- **Export:** (E1) export nativo `text/markdown` do Drive via `UrlFetchApp.fetchAll` com
  `ScriptApp.getOAuthToken()`, disparado em paralelo. (E2) conversor próprio sobre o
  `DocumentApp` (percorre parágrafos e itens de lista), só se o E1 falhar no C4. O formato
  exato do endpoint de export deve ser conferido na documentação oficial da Drive API antes
  de codar.
- **Validação do cache (C2):** (V1) `DriveApp`, com nome, tipo e `getLastUpdated()` dos
  arquivos da pasta. (V2) uma única chamada `files.list` à Drive API v3, feita por UrlFetch com o
  token do script (sem serviço avançado nem mudança no manifesto), listando os filhos da
  pasta com `modifiedTime`. O cache fica no `CacheService`, com chave =
  `folderId` + hash de (id, modifiedTime) dos arquivos resolvidos.
- **Sem cache:** o C1 inclui listar a pasta, resolver os papéis e exportar os 4 Docs.

## Como vai rodar (quando for autorizada)
1. **Código (TDD):** as partes puras entram em `src/workspace.ts` (ver "Interface" abaixo),
   testadas no Vitest. O harness `pocDocsNativos(folderUrl)` fica em `src/main.ts`, como a
   P1, com o botão **Rodar POC P6** na tela e a entrada nova em `test/build.test.ts`. O
   harness devolve JSON com `c1..c5`, tempos por execução, origem por papel e o markdown
   exportado. O harness sai do código depois do ADR-012.
2. **Manifesto:** se a V2 for usada, habilitar o serviço avançado Drive v3 no
   `appsscript.json`. Os escopos atuais (`drive`, `script.external_request`) já cobrem o
   export via UrlFetch.
3. **Publicar no dev:** `./gasclaw up` (só dev) e depois `./gasclaw logs` para ver os tempos.

## O que o usuário faz no dev (manual, uma vez)
1. Criar no Drive a pasta **`P6 teste`** com 4 **Google Docs** chamados `AGENTS`, `SOUL`,
   `IDENTITY` e `USER`. No `SOUL`, colar o conteúdo de checagem (H1, H2, H3; lista com
   marcadores de 2 níveis; lista numerada; um negrito).
2. Criar a pasta **`P6 misto`** com os Docs `AGENTS` e `SOUL` e os arquivos `IDENTITY.md` e
   `USER.md`.
3. (Opcional) Criar em `P6 teste` uma planilha **`config`**: `model | openrouter/auto` e
   `users | eu@dominio`.
4. Abrir a tela gasclaw dev (`./gasclaw open`). Se aparecer um novo consentimento OAuth,
   clicar em **Permitir**.
5. Colar a URL de `P6 teste` e clicar **Rodar POC P6** duas vezes (sem cache e com cache).
6. Editar uma linha do Doc `SOUL` e rodar de novo (C3).
7. Colar a URL de `P6 misto` e rodar (C5).
8. Enviar o JSON do resultado (ou avisar para lermos pelo `./gasclaw logs`).

## Conteúdo de checagem do C4 (`SOUL`)
```
# Alma            (Título 1)
## Tom            (Título 2)
### Exemplos      (Título 3)
- item A
  - item A.1
- item B
1. primeiro
2. segundo
Texto com **negrito**.
```
Passa se a saída tiver `#`, `##`, `###`, os marcadores com o aninhamento preservado e a
lista numerada. Negrito, espaçamento e escapes são informativos.

## Riscos
- O export pode ficar lento com vários arquivos; a mitigação é o `fetchAll` paralelo.
- A validação por `DriveApp` (V1) pode, sozinha, passar de 200 ms; nesse caso vale a V2 ou
  a decisão de TTL.
- Frontmatter em Doc é frágil; por isso a config vai para a planilha.
- Perde-se portabilidade (OpenClaw/Git) quando o agente está só em Docs; o `.md` continua
  aceito.

## Interface que vai mudar (`src/workspace.ts`)
Hoje, `loadAgent` procura nomes exatos (`AGENTS.md`...) e passa um `Record<nome, texto>`
para `buildSpec`. A mudança proposta separa a decisão pura da leitura:

```ts
export const ROLES = ['AGENTS', 'SOUL', 'IDENTITY', 'USER'] as const;
export type Role = (typeof ROLES)[number];
export type FileEntry = { id: string; name: string; mime: string; modified: number };
export type Source = { entry: FileEntry; kind: 'doc' | 'md' };

/** Puro: Doc com nome do papel (com ou sem ".md") > arquivo <PAPEL>.md > ausente. */
export function resolveRoles(entries: FileEntry[]): Partial<Record<Role, Source>>;
/** Puro: chave do cache a partir das fontes resolvidas (id + modified). */
export function cacheKey(folderId: string, sources: Partial<Record<Role, Source>>): string;
/** Puro: config da planilha (linhas chave|valor) sobrepõe o frontmatter. */
export function mergeConfig(frontmatter: Record<string, string | string[]>, rows?: string[][]): AgentConfig;
// buildSpec(folderId, name, texts por papel, config) — mantém limites 20k/60k e "(missing)".
// seedAgent(folderId, owner, format: 'doc' | 'md') — casca.
```

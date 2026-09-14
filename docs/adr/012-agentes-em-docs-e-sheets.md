# ADR-012 — Agentes em Google Docs e Sheets nativos (POC P6)

- **Status:** Aceito · 2026-09-14 · complementa o [ADR-002](002-agente-pasta-sem-codigo.md)

## Contexto
O usuário quer escrever o agente em Google Docs (comentários, histórico, edição no celular)
e guardar a config em Google Sheets, sem perder as pastas `.md`. O risco era a latência de
leitura contra o prazo de 30 s do Chat e a fidelidade do texto convertido. Critérios da
[POC P6](../../poc/p6-docs-nativos/README.md): C1 4 Docs em menos de 3 s sem cache; C2 menos
de 200 ms com cache; C3 editar invalida o cache; C4 títulos e listas preservados; C5 pasta
mista resolve cada papel.

## Fonte da verdade (documentação oficial da Drive API v3)
- Export: `GET /drive/v3/files/{id}/export?mimeType=text/markdown` (até 10 MB). Planilha: `text/csv`.
- Import: upload com conversão aceita Markdown → Google Doc (`POST /upload/drive/v3/files?uploadType=multipart`).
- Update de conteúdo: `PATCH /upload/drive/v3/files/{id}?uploadType=media`.
- Todos aceitam o escopo `drive`, que já está no manifesto: **nenhum escopo novo**.

## Medição (dev, versão 4, `./gasclaw poc p6`, 2 execuções completas e automáticas)
| Critério | Execução 1 | Execução 2 | Resultado |
|---|---|---|---|
| C1 sem cache (máximo de 5) | 1.091 ms | 1.224 ms | ✅ |
| C2 V1 `DriveApp` (máximo de 5) | 472 ms | 608 ms | ❌ acima de 200 ms |
| C2 V2 `files.list` (máximo de 5) | 294 ms | 383 ms | ❌ acima de 200 ms |
| C2 validade de 30 s (só `cache.get`) | 54 ms | 77 ms | ✅ |
| C3 editar o `SOUL` invalida | miss + texto novo | miss + texto novo | ✅ |
| C4 H1–H3, lista aninhada, numerada, negrito | ok | ok | ✅ |
| C5 misto (2 Docs + 2 `.md`) | doc, doc, md, md | doc, doc, md, md | ✅ |
| Config lida da planilha `config` | sim | sim | ✅ |

Setup das fixtures: 37 s na criação e 15 s na reutilização. Execução completa: 66 s e 51 s.

## Decisão
1. **Leitura híbrida por papel, sem configuração:** Google Doc com o nome do papel (com ou
   sem `.md`) > `<PAPEL>.md` > `(missing)`. Planilha `config` (`chave, valor`) sobrepõe o
   frontmatter do `AGENTS`.
2. **Leitura pela Drive API:** `files.list` + export/download em paralelo (`fetchAll`).
3. **Cache com validade de 30 s** (decisão prévia do usuário para quando nenhuma checagem
   ficasse abaixo de 200 ms). Uma edição no Drive aparece na conversa em até 30 s. A
   assinatura (`signature`) continua validando o conteúdo quando o cache expira.
4. **Criação:** a tela passa a oferecer "Criar como: Google Docs | Markdown"; Docs são
   criados por import de markdown, sem escopo novo.
5. Nenhum texto do Drive vira código (ADR-002 continua valendo): Docs e Sheets são só dados.

## Consequências
- F1: trocar o `loadAgent` de produção pela leitura híbrida com cache de 30 s e implementar a
  opção de criação na tela. Até lá a produção segue lendo só `.md`.
- O markdown exportado traz quebras de linha com dois espaços no fim, e a lista numerada
  pode vir sem linha em branco antes. Isso é inofensivo para o LLM.
- A pasta `gasclaw-poc/` fica no Drive do dono para reuso; nada é apagado.
- Se a Google publicar uma listagem mais rápida, medir de novo com `./gasclaw poc p6` e trocar a
  validade de 30 s por validação a cada mensagem.

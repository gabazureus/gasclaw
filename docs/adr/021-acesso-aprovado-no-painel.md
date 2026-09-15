# ADR-021 — Acesso e ferramentas aprovados no painel

- **Status:** Aceito · 2026-09-15 · decisão do usuário: "Acesso e ferramentas só pelo painel"
- **Complementa:** [ADR-012](012-agentes-em-docs-e-sheets.md) (Docs e planilha config), [ADR-013](013-autoria-editor-e-drive.md) (editor e Drive), [ADR-017](017-motor-de-tools-evals-e-aprovacao.md) (allowlist de tools)

## Contexto
A auditoria de 2026-09-15 (achado M2) mostrou que a pasta do agente decidia **quem conversa** (`users`) e
**quais ferramentas** ele usa (`tools`), lidos do frontmatter do `AGENTS`, do editor do Apps Script ou da
planilha `config`, sem confirmação do dono. A tela aceita pastas compartilhadas por terceiros. Quem conseguisse
editar a pasta passava a conversar com o agente, gastando a chave do OpenRouter do dono, e podia liberar tools.

## Decisão
- A pasta, o editor e a planilha `config` **sugerem** `users` e `tools` (`AgentConfig.suggested`). Só vale o que
  o dono **aprovar no painel**.
- O aprovado fica em Script Properties, em `ACCESS:<folderId>` (JSON `{ users, tools }`).
- Acesso efetivo = `effectiveAccess(aprovado)`: e-mails em minúsculas e sem duplicata; tools só as que existem no
  registry (nome exato ou grupo, como `memory`). Sem aprovação, ou com valor inválido, fica **fechado**: só o dono
  e nenhuma tool (`parseAccess` falha fechado).
- O Chat, a tela de conversa, a allowlist de tools e a validação do modelo usam o efetivo (`spec.access`).
- `model`, `steps` e a personalidade (os papéis) continuam na pasta.
- O painel mostra o que a pasta sugere e ainda não foi aprovado (`pendingSuggestions`), com **Aprovar** e **Remover**.
- O agente de eval é criado pelo próprio gasclaw e só roda por `doGet?action=eval` (dono). Ele usa uma
  aprovação fixa no código: `{ users: [], tools: ['now', 'memory', 'ask'] }`.

## Migração
Depois do deploy, **todo agente existente responde só ao dono e fica sem tools** até o primeiro **Aprovar** no
painel. Quem usava `users:` ou `tools:` na pasta precisa aprovar essas entradas no painel. O CHANGELOG avisa
isso a quem usa.

## Implementação
- Núcleo puro em `src/workspace.ts` (`Access`, `effectiveAccess`, `withAccess`, `parseAccess`,
  `pendingSuggestions`, `canUse`), com testes em `test/access.test.ts`.
- Ligação mínima no `src/main.ts`: `loadAgentForTurn` aplica `withAccess` com `ACCESS:<folderId>`; toolkit,
  modelos e P16 usam `spec.access.tools`.
- Painel (aprovar e remover) e as globais `approveAccess`/`removeAccess`: Pista Observabilidade.

## Consequências
- Pasta de terceiros ou edição indevida não abre acesso nem libera tools sozinha.
- Um passo a mais para compartilhar um agente: aprovar no painel.
- Risco residual: o `model` e o `steps` da pasta ainda podem encarecer os turnos do dono. A validação de modelo
  (`validateChoice`) só age sobre a escolha feita na tela.

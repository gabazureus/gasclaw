# Changelog — gasclaw

> **Regra de manutenção:** ao concluir cada task, adicionar a entrada neste arquivo **no mesmo commit** da task.
> Status: ✅ feito · 🔄 em andamento · ⏳ pendente. Fonte: `git log` e
> [plano F0](docs/plans/2026-09-14-gasclaw-f0-plano-implementacao.md).

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não publicado]

Nada foi enviado ao remoto ainda (commits apenas locais).

### F0 — fundação + primeira fatia utilizável

#### Task 0 — Pré-condições da máquina ✅
- Verificação de ferramentas e commit inicial da fundação: devmode adopt + wiki, hub `docs/`, spec e ADRs 001–008.
- Commit: `96b6d55`

#### Task 1 — Scaffold de build e testes ✅
- Build com esbuild em formato IIFE, com stubs globais para o Apps Script, e testes com vitest.
- Commit: `2fcbdf5`
- Desvios: foram adicionados `@types/node@24` (24.13.4) e `typescript@7.0.2`, e todas as devDependencies ficaram com versão exata (ADR-009 rascunho, item 12).

#### Task 2 — Leitura da pasta do agente (núcleo puro) ✅
- `workspace.ts` transforma a pasta do agente em `AgentSpec`, com limites de tamanho, marcação `(missing)` e controle de acesso (`users`).
- Commit: `e886b50`

#### Task 3 — Cliente OpenRouter ✅
- `llm.ts` com request e response puros e `http` injetável.
- Commit: `100f1d3`

#### Task 4 — Turno do agente ✅
- `agent.ts` faz um turno único (1 chamada ao LLM, sem tools) e mantém no máximo 20 mensagens de histórico.
- Commit: `34ee6cd`

#### Task 5 — Handler do Google Chat ✅
- `chat.ts` responde de forma síncrona e trata o kill switch, o acesso por agente e os erros com mensagens amigáveis.
- Commit: `f4b5cba`

#### Task 6 — Armazenamento (Properties + Cache) ✅
- `store.ts` guarda a chave, o dono, os agentes, o kill switch e o histórico em cache (6 h).
- Commit: `d47738c`
- Desvios: no TS 7, os setters passaram a usar corpo em bloco (TS2322) (ADR-009 rascunho, item 13).

#### Task 7 — Entrypoint GAS e tela gasclaw ✅
- `main.ts` traz o web app (`health`/`enable`/`disable`), os eventos do Chat, a tela gasclaw e a POC P1.
- Commit: `20bf660`
- Desvios: `settings.html` ganhou acessibilidade mínima: `lang`, `<label for>` e `role="status"`/`aria-live` (ADR-009 rascunho, item 14).

#### Task 8 — CLI `./gasclaw` ✅
- Comandos `up`, `down`, `restart`, `ship`, `ci`, `logs`, `status`, `doctor`, `rollback` e `open`, todos idempotentes, com pausas guiadas nos passos manuais.
- As correções das Tasks 1–8 foram registradas no rascunho do ADR-009, dentro do plano (Task 11).
- Commit: `96357c4`
- Desvios: `.vitest/` entrou no `.gitignore`.

#### Task 9 — Primeiro `./gasclaw up` real (dev) 🔄
Passos externos (plano, seção A.6 e Task 9):
- [x] Login no gcloud (`owner@example.com`)
- [ ] Login no clasp (`clasp login`)
- [ ] Ligar a Google Apps Script API (script.google.com/home/usersettings)
- [ ] Criar o projeto GCP dev (`gasclaw-dev-…`)
- [ ] Tela de consentimento OAuth **Interna**
- [ ] Vincular o número do projeto GCP ao script
- [ ] Autorizar o web app na primeira abertura
- [ ] Configurar o Chat app (conexão pelo ID de implantação)
- [ ] Criar `.env.local` com a **nova** chave do OpenRouter e colá-la na tela
- [ ] Adicionar o primeiro agente (URL da pasta do Drive) e testar pela tela
- [ ] Testar pelo Google Chat e verificar `status`/`down`/`doctor`/`rollback`
- [ ] Rodar a POC P1 e escrever o ADR-010

#### Task 10 — Repositório GitHub privado e CI ⏳
- `./gasclaw up --prod`, criação de `.github/workflows/deploy.yml`, repositório privado, secret `CLASPRC_JSON` e push. Cada ação externa precisa de confirmação antes.

#### Task 11 — ADR-009, índices e tracks do conductor ⏳
- `docs/adr/009-ajustes-f0.md`, índice de ADRs e tracks F0–F4 em `conductor/tracks.md`.

### Segurança
- **Fato:** durante a Task 9, a chave do OpenRouter apareceu parcialmente na conversa, exposta pela saída do proxy `rtk`.
- **Ação:** o usuário foi orientado a revogar essa chave no OpenRouter e gerar uma nova. `.env` entrou no `.gitignore` (ainda sem commit).
- **Nota:** o CLI lê a chave de `.env.local`, e não de `.env`. Coloque a nova chave só em `.env.local`, que já é ignorado pelo git.

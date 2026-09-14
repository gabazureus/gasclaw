# ADR-002 — Agente = pasta do Drive, sem código

- **Status:** Aceito · 2026-09-14

## Contexto
O usuário quer criar agentes "como no OpenClaw": uma pasta, sem deploy. `eval`/`new Function`
funcionam no V8 do GAS, mas o código rodaria com todos os escopos do dono — quem edita a pasta
ganharia execução como o dono.

## Decisão
A pasta contém só markdown (convenção OpenClaw: AGENTS, SOUL, IDENTITY, USER, MEMORY,
HEARTBEAT, BOOTSTRAP, jobs.md, skills/, memory/, inbox/). A configuração é o frontmatter de
`AGENTS.md`. Tools vêm de uma whitelist embutida; `http` só para hosts em `http_allow`.

## Consequências
- Mudar comportamento não exige deploy; nova tool exige deploy.
- Sem compilador de pasta (diferente do Eve): o runtime lê a pasta a cada turno (com cache curto).
- Templates derivados do OpenClaw (MIT) mantêm o aviso de licença em `templates/`.

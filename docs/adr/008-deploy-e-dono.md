# ADR-008 — Deploy automático dev→prod; dono = conta do usuário

- **Status:** Aceito · 2026-09-14

## Contexto
O usuário não quer operação manual após o setup. clasp v3 mantém a URL do web app com
`update-deployment <id>`; `push` substitui o projeto remoto inteiro; limite de 200 versões;
tokens de CI morrem com consent "Testing" (7 dias) ou session control do Workspace.

## Decisão
- Dois projetos Apps Script: dev e prod. `./gasclaw up` publica em dev; push na `main`
  dispara CI: testes → dev → selftest → prod (mesmo deployment id) → selftest → rollback se falhar.
- Detecção de divergência antes do push; poda de versões mantendo as 5 últimas.
- OAuth client próprio Internal; Admin: apps confiáveis + "Exempt trusted apps".
- Dono do script e dos triggers: a própria conta do usuário (custo zero).

## Consequências
- Se a conta do dono for suspensa, tudo para → runbook de migração para conta dedicada.
- Repo GitHub pessoal privado; `CLASPRC_JSON` e `OPENROUTER_API_KEY` como secrets.

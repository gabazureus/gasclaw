# ADR-006 — Google Chat como canal principal

- **Status:** Proposto (depende de P2) · 2026-09-14

## Contexto
O usuário quer conversar com os agentes pelo Google Chat. Eventos do Chat exigem resposta em
30 s. Mensagens assíncronas com cards precisam de autenticação como app (service account);
autenticação de usuário só posta texto. Criação de chave de SA costuma estar bloqueada por
política da organização. A escolha add-on vs. app clássico pode ser irreversível no projeto GCP.

## Decisão
- Chat app interno com conexão "projeto Apps Script" (sem URL pública).
- Resposta inline se o step terminar em ≤ 20 s; senão "pensando…" + fila.
- Respostas assíncronas e cards como app, com token obtido via IAM
  `generateAccessToken` (dono com "Service Account Token Creator"), sem chave armazenada.
- Framework (add-on vs. clássico) decidido pela P2 no projeto **dev** antes de configurar prod.

## Consequências
- Requer projeto GCP padrão vinculado (passo manual único).
- Gmail e HTTP ficam para F4.

# Learnings: P2

- 2026-09-16: o projeto dev nao tinha service account nem IAM Credentials habilitada.
- 2026-09-16: `gcloud auth print-access-token --impersonate-service-account --scopes=chat.bot` ignorou o escopo; chamar `generateAccessToken` explicitamente resolveu.
- 2026-09-16: a identidade `gasclaw-chat@...` listou a DM existente e criou um card real como o app sem chave privada.


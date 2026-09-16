# Learnings — P20 aprovação durável

## 2026-09-16 — Specify
- **Implemented:** contrato, critérios e fronteiras antes do código.
- **Commit:** pendente
- **Learnings:**
  - Patterns: lifecycle de aprovação não pode ser modelado pelo TTL do cache.
  - Domain/ubiquitous-language: aprovação durável é o consentimento; credencial é apenas transporte.
  - Gotchas: consumo único exige transição durável atômica; `load` cacheado não pode decidir autorização.

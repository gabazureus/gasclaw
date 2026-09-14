# Tech stack

> Deliberate technology choices. Changes here must be documented *before*
> implementation (see `workflow.md`). Prefer choices that strengthen feedback
> loops — static types, fast tests, a real runtime the AI can observe.

## Languages & runtimes
- **Produção:** Google Apps Script (V8), JavaScript gerado. Nenhum servidor.
- **Desenvolvimento:** TypeScript (strict), Node ≥ 20, esbuild → bundle IIFE + stubs globais.

## Frameworks & key libraries
- `@google/clasp` 3.4.1 (pinado) — push, versões, deployments, logs.
- `gcloud` — projeto GCP padrão, APIs, IAM (token do app do Chat sem chave).
- GASADK (`tanaikech/adk-gas`, MIT) — vendorizado **somente se a POC P-GASADK passar** (ADR-004).
- OpenRouter (API compatível com OpenAI) — único provedor de LLM (ADR-003).
- Serviços GAS: DriveApp/Drive v3 avançado, SpreadsheetApp, GmailApp, CalendarApp,
  DocumentApp, Chat avançado, LockService, PropertiesService, CacheService, UrlFetchApp.

## Feedback-loop tooling (devmode-critical)
- **Static types:** TypeScript strict + `@types/google-apps-script`.
- **Compiler / linter:** `npm run build` (tsc --noEmit + esbuild).
- **Test runner:** `npm test` (Vitest, fakes dos serviços GAS nas bordas; LLM com fixtures).
- **Runtime access:** `./gasclaw logs` (Cloud Logging) e `?action=selftest` no web app após deploy.

## Data & persistence
- **Drive (pasta do agente):** fonte da verdade do agente (markdown), memória, inbox Excel.
- **Drive `.gasclaw/`:** sessões (`sessions/<space>.jsonl`) e checkpoints de runs (`runs/<id>.json`).
- **Script Properties:** segredos (OpenRouter), lista de agentes, kill switch, leases curtos.
- **Sheets:** índice de runs/log resumido (1 flush por execução).

## Conventions
- Module layout: deep modules with functional core / imperative shell split
- Naming follows `UBIQUITOUS_LANGUAGE.md`
- Atalhos conscientes marcados com `// minimal:`

## Constraints
- 6 min por execução; 30 s para responder evento do Chat; 6 h/dia de runtime de trigger;
  20 triggers por usuário/script; 9 KB por Property; 200 versões por script;
  100 k UrlFetch/dia (Workspace). Ver `docs/specs/2026-09-14-gasclaw-design.md` §7.
- Dono do script e dos triggers: conta do usuário (ADR-008).

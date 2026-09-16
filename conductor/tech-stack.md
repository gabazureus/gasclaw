# Tech stack

> Deliberate technology choices. Changes here must be documented *before*
> implementation (see `workflow.md`). Prefer choices that strengthen feedback
> loops — static types, fast tests, a real runtime the AI can observe.

## Languages & runtimes
- **Produção:** Google Apps Script (V8), JavaScript gerado. Nenhum servidor.
- **Desenvolvimento:** TypeScript (strict), Node 22.12+ (instalado pelo `./gasclaw up` via Homebrew), esbuild → bundle IIFE + stubs globais.

## Frameworks & key libraries
- `@google/clasp` 3.4.1 (pinado) — push, versões, deployments, logs.
- `gcloud` — projeto GCP padrão, APIs, IAM (token do app do Chat sem chave).
- GASADK (`tanaikech/adk-gas`, MIT) — vendorizado **somente se a POC P5 passar** (ADR-004).
- OpenRouter (API compatível com OpenAI) — único provedor de LLM (ADR-003).
- Serviços GAS em uso: DriveApp, Drive v3 e Sheets v4 via UrlFetchApp, HtmlService, ContentService,
  LockService, PropertiesService, CacheService, ScriptApp (gatilho de 1 min), MailApp (só a cota),
  Session. Gmail, Agenda, Tasks e Contatos já têm escopo (ADR-015), mas ainda nenhuma tool.

## Feedback-loop tooling (devmode-critical)
- **Static types:** TypeScript strict + `@types/google-apps-script`.
- **Compiler / linter:** `npm run build` (tsc --noEmit + esbuild).
- **Test runner:** `npm test` (Vitest, fakes dos serviços GAS nas bordas; LLM com fixtures).
- **Runtime access:** `./gasclaw logs` (Cloud Logging), `./gasclaw status` (`?action=health`), `./gasclaw trace`,
  `./gasclaw eval` e `./gasclaw poc` no dev.

## Data & persistence
- **Drive (pasta do agente):** fonte da verdade do agente (markdown, Docs, planilha `config`) e `MEMORY.md`.
- **Drive `Meu Drive/gasclaw/runs/`:** JSON completo de cada run do trace (90 dias).
- **CacheService:** sessões (6 h), tickets de aprovação (10 min), runs ao vivo, agente carregado (30 s).
- **Script Properties:** chave do OpenRouter, dono, lista de agentes, kill switch, override de modelo,
  fila do lote (`Q:`) e uso por modelo (`USAGE:`).
- **Sheets:** planilha "gasclaw — execuções" (1 linha por run, gravada em lote) e aba "limites".
- **Drive na pasta do agente:** checkpoints `.gasclaw/runs/<runId>.json` da execução durável; fila `R:` e leases nas Script Properties (ADR-026; P4 medida no dev v66).

## Conventions
- Module layout: deep modules with functional core / imperative shell split
- Naming follows `UBIQUITOUS_LANGUAGE.md`
- Atalhos conscientes marcados com `// minimal:`

## Constraints
- 6 min por execução; 30 s para responder evento do Chat; 6 h/dia de runtime de trigger;
  20 triggers por usuário/script; 9 KB por Property; 200 versões por script;
  100 k UrlFetch/dia (Workspace). Ver `docs/specs/2026-09-14-gasclaw-design.md` §7.
- Dono do script e dos triggers: conta do usuário (ADR-008).

# Contributing to gasclaw

Thanks for your interest in gasclaw. This guide covers how to set up the
project, the rules every change must respect, and how to get a pull request
merged.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

> Internal project docs (`docs/`, `conductor/`) are written in Brazilian
> Portuguese. Issues and pull requests are welcome in English or Portuguese.

## Prerequisites

- **Node.js 22.12+ or 24+** (required by `vitest` 5; `./gasclaw doctor` checks
  for Node 20 or newer, but the test suite needs 22.12+).
- **npm** (ships with Node).
- **git**.

Only needed to deploy to your own Google account (not to build or test):

- **macOS with [Homebrew](https://brew.sh)**. The `./gasclaw` CLI uses `brew`,
  `open`, and `pbcopy`.
- **Google Cloud SDK** (`gcloud`), installed by `./gasclaw up` if missing.
- A **Google Workspace** account (the OAuth consent screen is set to *Internal*).
- An **OpenRouter** API key.

## Local setup

```bash
npm ci          # install exact dependency versions from package-lock.json
npm run build   # type-check (tsc --noEmit) and bundle with esbuild into dist/
npm test        # run the vitest suite
```

`npm run typecheck` runs only the type checker. None of these commands touch the
network beyond `npm ci` or require a Google account.

## Architecture in five lines

1. **Functional core / imperative shell:** decisions are pure functions; Apps
   Script services (`DriveApp`, `UrlFetchApp`, `PropertiesService`...) live in a
   thin shell.
2. `workspace` turns an agent's Drive folder into an `AgentSpec`; `agent` runs
   one pure turn; `llm` builds and parses OpenRouter requests with an injected
   HTTP function.
3. `chat` handles Google Chat events (kill switch, per-agent access, friendly
   errors); `store` wraps properties and cache; `main.ts` is the Apps Script
   entrypoint.
4. The whole `src/` is bundled by esbuild into one file and pushed with clasp.
5. Read more: [design spec](docs/specs/2026-09-14-gasclaw-design.md),
   [ADRs](docs/adr/README.md), [ubiquitous language and module map](UBIQUITOUS_LANGUAGE.md),
   [docs hub](docs/README.md).

## Project rules (non-negotiable)

- **No external server.** The runtime is 100% Google Apps Script; your machine
  only compiles and publishes ([ADR-001](docs/adr/001-gas-only-runtime.md)).
- **Never execute code that comes from Drive.** An agent is markdown only; no
  `eval`, no `new Function`, no dynamic loading
  ([ADR-002](docs/adr/002-agente-pasta-sem-codigo.md)).
- **Minimal code.** Before writing, ask whether the code needs to exist, whether
  the platform already does it, and whether it can be smaller. Mark deliberate
  shortcuts with a `// minimal:` comment explaining the trade-off. Never cut
  validation, error handling, or security to save lines.
- **Improvements over Apps Script limits need evidence.** Any change that works
  around a GAS limit or builds on GASADK requires a proof of concept in `poc/`
  with a measured acceptance criterion, plus an ADR in `docs/adr/`. POCs run
  automatically on dev with `./gasclaw poc <id>` (no manual fixtures).
- **Zero manual operation after setup.** Operational steps go through an
  idempotent `./gasclaw <command>`.
- **Language.** Code identifiers in English. Internal docs in pt-BR; community
  files in English ([ADR-011](docs/adr/011-licenca-e-docs-da-comunidade.md)).

## Development workflow

gasclaw is built test-first, in small steps:

1. **Red:** write one failing test for the smallest next behavior and watch it
   fail for the right reason.
2. **Green:** write the least code that makes it pass.
3. **Refactor:** clean up names and duplication with the tests green.
4. **Verify:** `npm run build && npm test` on every step.

Testing guidelines:

- Test **observable behavior at stable boundaries** (the pure core first), not
  private helpers.
- **Mock only what you don't own**: Apps Script services, the network, the clock.
  Never mock the project's own domain logic.
- Cover the happy path, the edges (empty, limits, failures), and add a
  regression test for every bug fixed.
- Coverage is a diagnostic, not a target.

The full lifecycle is in [conductor/workflow.md](conductor/workflow.md).

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/), as in the
existing history:

```
<type>(<optional scope>): <description>
```

- Types used here: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `chore`.
- Scopes match modules or areas: `workspace`, `llm`, `agent`, `chat`, `store`,
  `cli`.
- Examples from the history: `feat(llm): ...`, `feat(cli): ...`,
  `build: ...`, `docs: ...`.

Every commit must be signed off (DCO), see below.

## Developer Certificate of Origin (DCO)

gasclaw uses the [Developer Certificate of Origin 1.1](https://developercertificate.org/).
Sign off each commit with:

```bash
git commit -s
```

Forgot? Amend the last commit with `git commit --amend -s --no-edit`, or sign a
range with `git rebase --signoff <base>`. Contributions are accepted under
Apache-2.0 (inbound = outbound); details in [LICENSING.md](LICENSING.md).

## Changelog

When a change alters a **product capability** (something a user can now do, or
can no longer do), update [CHANGELOG.md](CHANGELOG.md) in the same commit. The
changelog is kept in pt-BR and written for people who use gasclaw, not for
developers.

## Secrets

Never commit secrets or local credentials. In particular:

- `.env`, `.env.local` (holds `OPENROUTER_API_KEY`)
- `.clasprc.json` (clasp OAuth tokens)
- `.clasp.json` (generated per environment by the CLI)

These are listed in `.gitignore`. Never paste an API key into an issue, pull
request, commit message, log, or chat. If you think a secret was exposed, follow
the vulnerability process below.

## Pull request checklist

- [ ] The change is focused on one topic and respects the project rules above.
- [ ] Tests were written first and cover the new or changed behavior.
- [ ] `npm run build` and `npm test` pass locally.
- [ ] Shortcuts are marked `// minimal:`; no `eval` or code loaded from Drive.
- [ ] Workarounds for Apps Script limits include a `poc/` and an ADR.
- [ ] `CHANGELOG.md` is updated if a product capability changed.
- [ ] Docs are updated if behavior, commands, or setup changed.
- [ ] New files carry `SPDX-License-Identifier: Apache-2.0`.
- [ ] Commits follow Conventional Commits and are signed off (`git commit -s`).
- [ ] No secrets, account e-mails, domains, script IDs, or deployment IDs in the diff.

## Reporting bugs

Open an issue with:

- what you did (commands, agent folder layout, message sent),
- what you expected and what happened,
- the output of `./gasclaw doctor` and relevant `./gasclaw logs` lines,
- your Node version and OS.

Redact e-mail addresses, domains, script and deployment IDs, and keys before
posting.

## Reporting security vulnerabilities

**Do not open a public issue for security problems.** E-mail
**gabriel.br@gmail.com** with a description, steps to reproduce, and the impact
you see. You will get an acknowledgement, and a fix and disclosure will be
coordinated with you before anything is made public.

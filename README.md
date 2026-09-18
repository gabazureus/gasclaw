<p align="center">
  <img src="docs/assets/cover.png" alt="gasclaw — AI agents that live entirely inside Google Apps Script: an agent is a Google Drive folder of markdown files, and you talk to it in Google Chat" width="100%">
</p>

# gasclaw

**AI agents that live entirely inside Google Apps Script. No server, no hosting: an agent is a Google Drive folder, and you talk to it in Google Chat.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime: Google Apps Script](https://img.shields.io/badge/runtime-Google%20Apps%20Script-4285F4.svg)](https://developers.google.com/apps-script)
[![Language: TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6.svg)](https://www.typescriptlang.org/)
[![Status: F1 in progress](https://img.shields.io/badge/status-F1%20in%20progress-yellow.svg)](CHANGELOG.md)

English | [Português (Brasil)](README_PT_BR.md)

## Why gasclaw

- **Nothing to host.** The runtime runs in your own Google Workspace account on Apps Script. Your computer only compiles TypeScript and publishes with clasp.
- **Agents are documents, not code.** Each agent is a Drive folder of markdown files (rules, personality, identity, user notes). Edit a file and the next message uses it, with no redeploy.
- **Where your team already talks.** Conversations happen in Google Chat, in a DM or in a space.
- **Any model.** The LLM is reached through OpenRouter, so an agent switches models by changing one line.
- **Safe by construction.** gasclaw never executes code read from Drive, only the owner can manage it, and access is allow-listed per agent.

## How it works

```mermaid
flowchart LR
    user([Person in Google Chat]) -->|message| chat[Google Chat]
    chat -->|event| gas[gasclaw runtime<br/>Apps Script web app]
    gas -->|reads markdown| drive[(Agent folder<br/>on Google Drive)]
    gas -->|prompt| llm[OpenRouter]
    llm -->|completion| gas
    gas -->|reply| chat
    owner([Owner]) -->|gasclaw screen| gas
    dev[Your computer<br/>./gasclaw] -.->|build + clasp push| gas
```

1. A message arrives from Google Chat. gasclaw checks the kill switch and whether the sender may talk to the agent.
2. It reads the agent's folder and builds the prompt from the markdown files.
3. It calls the model through OpenRouter and replies in the same conversation, keeping a short recent history.

Design details: [design spec](docs/specs/2026-09-14-gasclaw-design.md) and [architecture decisions](docs/adr/README.md).

## Status

**Stage F0 is done; gasclaw is not ready for production yet.** Both environments (dev and prod) are published to Google, and the dev agent already answers in Google Chat. Automatic publishing through GitHub/CI is postponed, so for now every publish goes through `./gasclaw`. The next stage, F1, starts with a proof of concept for agents written in native Google Docs and Sheets. See [CHANGELOG.md](CHANGELOG.md) for exactly what works, what is under construction, and what is planned.

## Quickstart

Requirements: macOS with [Homebrew](https://brew.sh), Node.js 22.12+ (or 24+), a Google Workspace account, and an [OpenRouter](https://openrouter.ai) API key.

```bash
npm ci
echo 'OPENROUTER_API_KEY=sk-or-...' > .env.local   # never commit this file
./gasclaw up
```

On the first run, `./gasclaw up` installs missing tools, creates the Google Cloud project and the Apps Script project, and publishes. For the few steps that can only be done by clicking, it pauses, opens the right page, and waits for Enter. Each completed step is recorded, so running it again does not repeat anything.

Step-by-step guide (pt-BR): [docs/como-usar.md](docs/como-usar.md). Stuck? Run `./gasclaw doctor` and see the [initial setup runbook](docs/runbooks/setup-inicial.md).

## Create your first agent

Create an empty Drive folder (for example "Assistant") and add its URL on the gasclaw screen (`./gasclaw open`). gasclaw creates these files from templates and **never overwrites** a file that already exists:

```
Assistant/
├── AGENTS.md     rules; the frontmatter is the agent's configuration
├── SOUL.md       personality and tone
├── IDENTITY.md   name and emoji
└── USER.md       who the agent serves
```

All files go into the prompt in this order. A missing file becomes `(missing)` instead of an error.

`AGENTS.md` example:

```markdown
---
model: openrouter/auto        # any OpenRouter model id
users: [ana@example.com, joao@example.com]
---
# Rules
- Answer briefly and directly.
- If you don't know, say so.
```

Supported frontmatter:

- `model:` an OpenRouter model id. Defaults to `openrouter/auto`. A model chosen for the agent on the gasclaw screen takes precedence.
- `users: [email, email]` on a single line. The owner always has access; an empty list means owner only.
- `tools: [now, memory, ask]` the tools the agent may use (`memory` enables `memory.save`, `memory.read`, and `memory.remove`). No list means no tools.
- `steps:` maximum model calls per turn, from 1 to 50 (default 10).
- Other keys are ignored, and nested keys are not supported.

Agent files can also be Google Docs (named `AGENTS` or `AGENTS.md`, and so on), and a Google Sheet named `config` with `key, value` rows overrides the frontmatter.

Then find the app in Google Chat (`gasclaw dev`, or `gasclaw` in prod), send a DM, or add it to a space and mention it.

## CLI reference

Every command accepts `--prod`; without it, the command targets dev.

| Command | What it does |
|---|---|
| `./gasclaw up [--prod]` | Sets up (first time), publishes, and opens the gasclaw screen |
| `./gasclaw down [--prod]` | Pauses all agents (kill switch) |
| `./gasclaw restart [--prod]` | `down` followed by `up` |
| `./gasclaw ship` | Publishes to prod at the same URL |
| `./gasclaw logs [--prod]` | Streams live logs |
| `./gasclaw status [--prod]` | Shows IDs, URLs, deployments, and health |
| `./gasclaw doctor [--prod]` | Diagnoses the setup and tells you how to fix it |
| `./gasclaw rollback [--prod]` | Returns to the previous version |
| `./gasclaw open [--prod]` | Opens the gasclaw screen |
| `./gasclaw poc <id> [step]` | Runs a proof of concept in dev and shows the result |
| `./gasclaw trace [id]` | Shows the step tree of an agent run (the latest one without an id) |
| `./gasclaw runs` | Opens the "gasclaw — execuções" spreadsheet |
| `./gasclaw limits [--fresh]` | Limits panel (Google, OpenRouter, and measured by gasclaw) |
| `./gasclaw usage [YYYY-MM-DD]` | Cost per model: last 7 days, or the 24 hours of one day |
| `./gasclaw eval <scenario\|--all> [--model id]` | Runs `evals/*.md` in dev (non-zero exit on failure) |

## Roadmap

| Stage | Goal | Status |
|---|---|---|
| F0 | First conversation with a Drive agent: one-command publish, agent folder, owner screen, Google Chat replies, per-agent access, kill switch | Done (GitHub/CI postponed) |
| F1 | Complete agent folder: conversations stored in Drive, daily memory, first-run ritual, skills, multiple agents, Google Groups in `users`, safer publishing | In progress |
| F2 | Long tasks: background work beyond 30 s, Gmail/Drive/Sheets/Docs/Calendar/HTTP tools (using the Approve/Deny cards that already exist in F1), per-task limits, retries | Planned |
| F3 | Proactivity and data: `HEARTBEAT.md` checklist, cron-style `jobs.md`, `.xlsx` inbox to Google Sheets, ready-made agent templates | Planned |
| F4 | Extra channels: Gmail threads, HTTP with token, MCP/A2A if the GASADK proof of concept passes, `npx gasclaw` | Planned |

The detailed, user-facing description of each stage is in [CHANGELOG.md](CHANGELOG.md).

## Known limitations

Current limits:

- Few tools: the agent can only use `now`, `memory.*` (in the owner's DM), and `ask`; it cannot send e-mail, edit spreadsheets, or schedule anything yet.
- Only **one** agent (the default one) answers in Chat, in every space.
- Short memory: the last 20 messages per agent and conversation, for up to 6 hours.
- Each agent file is truncated at 20,000 characters (60,000 in total).
- Replies are capped at 1,000 tokens because Google Chat waits at most 30 seconds; a slow model means Chat reports that the app did not respond.
- `users` accepts e-mail addresses only, not groups.
- No automatic retry when OpenRouter fails (429/5xx).
- The `./gasclaw` CLI currently targets macOS (it uses Homebrew, `open`, and `pbcopy`).
- Built for Google Workspace accounts (internal OAuth consent, domain-scoped Chat app).

## Security

- Secrets live only in `.env.local` (git-ignored) and in the owner-only gasclaw screen, stored in Script Properties. Never in Drive or in git.
- No `eval` and no code loaded from Drive: an agent is markdown only.
- Only the owner (the account that published) can open the gasclaw screen; each agent answers only the owner and the people the owner approved on that screen.
- ⚠️ Access change ([ADR-021](docs/adr/021-acesso-aprovado-no-painel.md)): who can talk to an agent and which tools it may use only take effect after being approved in the gasclaw panel. `users:` and `tools:` in the folder, the editor or the `config` sheet are now suggestions. After this version every agent answers only the owner and has no tools until you click **Approve** in the panel. If you used `users:` to give other people access, approve them in the panel.
- Google tools (Calendar, Gmail, Contacts, Tasks, Drive/Docs/Sheets) work only for the gasclaw owner. People approved in the panel can still talk to the agent, but their requests that would use these tools are refused, and only the owner approves those cards. The approval card shows every field in full (recipients, attendees, ids); only long text is summarized ([ADR-023](docs/adr/023-ferramentas-do-workspace-rest.md)).
- Actions with side effects (`./gasclaw poc`, `eval`, `down`) are POST requests with a CLI secret created by `./gasclaw up` in `.env.local` ([ADR-022](docs/adr/022-csrf-segredo-da-cli.md)).
- `./gasclaw down` or "Pause" on the screen stops every agent immediately.

**Found a vulnerability?** Please do not open a public issue. E-mail **gabriel.br@gmail.com**; details in [CONTRIBUTING.md](CONTRIBUTING.md#reporting-security-vulnerabilities).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup (`npm ci`, `npm run build`, `npm test`), project rules, the test-first workflow, and the pull request checklist. Commits follow Conventional Commits and require a DCO sign-off (`git commit -s`). This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

Project documentation (in pt-BR) is indexed at [docs/README.md](docs/README.md).

## License

Licensed under the [MIT License](LICENSE). Copyright (c) 2026 Gabriel Sorrentino. See [LICENSING.md](LICENSING.md) for contributions, dependency licenses, and trademarks.

Google, Google Apps Script, Google Drive, and Google Chat are trademarks of Google LLC; OpenRouter belongs to its owner. gasclaw is not affiliated with or endorsed by them.

## Acknowledgements

gasclaw borrows ideas (not code dependencies) from:

- [vercel/eve](https://github.com/vercel/eve) (Apache-2.0): the folder as the authoring interface, per-tool approval, per-step checkpoints.
- [openclaw/openclaw](https://github.com/openclaw/openclaw) (MIT): workspace files, first-run ritual, heartbeat, daily memory, approval cards in Chat.
- [tanaikech/adk-gas](https://github.com/tanaikech/adk-gas) (MIT): agent planning and timeout/context protection in Apps Script.
- [google/clasp](https://github.com/google/clasp) (Apache-2.0): deploying Apps Script from the command line.

Built with [devmode](https://github.com/fluencer-ai/devmode).

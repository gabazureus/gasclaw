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

- **Nothing to host.** The runtime runs in your own Google account on Apps Script. Your computer only compiles TypeScript and publishes with clasp.
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

## Install

Two commands. The second one shows you a map and walks you through it.

```bash
git clone https://github.com/gabazureus/gasclaw.git && cd gasclaw
./gasclaw
```

That second command opens the setup menu:

```
🦀 gasclaw — agents that live in your Google Drive

  Setup · 0 of 7 done · environment: dev
  account not detected yet — run step 2

  ○ 1  Local tools            will install: node, gcloud, npm deps
  ○ 2  Google account         the account that will own the agents
  ○ 3  Google Cloud project   hosts the Apps Script project and its APIs
  ○ 4  OpenRouter key         the model provider — without it the agent cannot think
  ○ 5  Web app (dev)          puts the panel and the 1-minute worker online
  ○ 6  Your first agent       a Drive folder with four markdown files
  ○ 7  Google Chat            optional: talk to your agent from Google Chat

  [1-7] run a step   [a] run everything missing   [r] refresh   [d] diagnose   [q] quit

> 
```

Press `a` and it runs everything that is missing. Press a number to do one step at a time. Each finished
step is recorded, so running it again never repeats work — and `[d]` tells you what is broken and how to
fix it.

Four of the seven steps need you to click in a Google page — turning on the Apps Script API (step 2), the
OAuth consent screen (step 3) and the first authorization (step 5) — plus the Google Chat app (step 7) if
you are on Workspace. gasclaw pauses, opens the right page, tells you exactly what to set, and waits for
Enter.

**What you need:** a Google account and an [OpenRouter](https://openrouter.ai) API key — step 4 asks for it
and stores it in `.env.local`, which is never committed.

**Where it runs:** macOS, Linux, and Windows through WSL or Git Bash (the CLI is a bash script; there is no
PowerShell version). On macOS, step 1 installs Node.js and the Google Cloud CLI for you with
[Homebrew](https://brew.sh). On Linux and Windows it checks what is missing and tells you the exact command
to install it — package managers differ too much for guessing to be safe.

### Workspace or a personal Gmail?

Both work, and gasclaw detects which one you have at step 2.

**Either way you talk to your agent in the browser.** gasclaw serves its own chat screen from Apps Script
itself — `./gasclaw open --chat` opens it, and the link is printed and copied to your clipboard the moment
your first agent is created. Google Chat is an **extra channel**, not the only one, so a personal Gmail
account is not a second-class setup.

What differs:

| | Google Workspace | Personal Gmail |
|---|---|---|
| Panel, web chat, agents, Google tools | ✅ | ✅ |
| **Google Chat app** | ✅ | ❌ needs Workspace |
| Apps Script daily trigger time | 6 h | 90 min |
| UrlFetch calls per day | 100,000 | 20,000 |
| E-mails per day | 1,500 | 100 |
| OAuth consent screen | `INTERNAL`, one click | `EXTERNAL`, and you must add yourself as a test user |
| Web app address | `script.google.com/a/macros/<your-domain>/…` | `script.google.com/macros/…` |

On a personal account step 7 is shown as not available and the setup completes without it. A Google One
subscription does **not** change this: it is storage, not Workspace.

**Every click, every Google screen and every permission** is documented in the [initial setup runbook](docs/runbooks/setup-inicial.md)
(pt-BR) — written from a real from-scratch install, with the Portuguese button names and what changes on a
personal account. Shorter guide: [docs/como-usar.md](docs/como-usar.md). Stuck? Run `./gasclaw doctor`.

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

## What your agent can do

**23 tools today**, grouped the way the panel groups them. The panel shows the full catalogue with an
on/off switch per tool — and **everything starts off until you approve it** ([ADR-021](docs/adr/021-acesso-aprovado-no-painel.md)).

| Group | What it covers |
|---|---|
| Calendar | read your agenda, check who is free, create and update events |
| Gmail | search, read, draft and send |
| Contacts | find someone's e-mail by name |
| Tasks | list, create and complete |
| Drive, Docs and Sheets | find files, read and create Docs, read and append rows to Sheets |
| Memory | what the agent remembers about you between conversations |
| General | the current time, asking you a question back, reading a skill |

### What that looks like

Ask in plain language — these are requests, not commands:

- *"what's on my calendar tomorrow?"* — answers straight away
- *"what's Ana's e-mail?"* — answers straight away
- *"draft a reply to the last e-mail from Ana"* — writes the draft, **asks you first**
- *"add these three rows to the expenses sheet"* — **asks you first**
- *"e-mail Ana the summary"* — **asks you every time**
- *"remember that I prefer morning meetings"* — kept for the next conversations

Two rules worth knowing before you share an agent:

- **Google tools are owner-only.** People you approve in the panel can talk to the agent, but a request of
  theirs that would use Gmail, Calendar, Contacts, Tasks or Drive/Docs/Sheets is refused. Only you approve
  those cards.
- **Anything with an effect asks first.** Sending an e-mail and creating or updating an event ask **every
  time**; drafting, creating a Doc and appending rows ask **once per turn**. Reading never asks.

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
| `./gasclaw tools all\|none\|<a,b,c> [folder]` | Turns the agent's tools on and off |
| `./gasclaw onboard` | Guided setup menu (the default before anything is published) |

## Roadmap

| Stage | Goal | Status |
|---|---|---|
| F0 | First conversation with a Drive agent: one-command publish, agent folder, owner screen, Google Chat replies, per-agent access, kill switch | Done (GitHub/CI postponed) |
| F1 | Complete agent folder: conversations stored in Drive, daily memory, first-run ritual, skills, multiple agents, Google Groups in `users`, safer publishing | In progress |
| F2 | Long tasks: background work beyond 30 s, Gmail/Drive/Sheets/Docs/Calendar/HTTP tools (using the Approve/Deny cards that already exist in F1), per-task limits, retries | In progress |
| F3 | Proactivity and data: `HEARTBEAT.md` checklist, cron-style `jobs.md`, `.xlsx` inbox to Google Sheets, ready-made agent templates | Planned |
| F4 | Extra channels: Gmail threads, HTTP with token, MCP/A2A if the GASADK proof of concept passes, `npx gasclaw` | Planned |

The detailed, user-facing description of each stage is in [CHANGELOG.md](CHANGELOG.md).

## Known limitations

Current limits:

- Google tools work only for the owner: people approved in the panel can talk to the agent, but a request of theirs that would use Gmail, Calendar, Contacts, Tasks or Drive/Docs/Sheets is refused.
- Only **one** agent (the default one) answers in Chat, in every space.
- Short memory: the last 20 messages per agent and conversation, for up to 6 hours.
- Each agent file is truncated at 20,000 characters (60,000 in total).
- Replies are capped at 1,000 tokens because Google Chat waits at most 30 seconds; a slow model means Chat reports that the app did not respond.
- `users` accepts e-mail addresses only, not groups.
- No automatic retry when OpenRouter fails (429/5xx).
- Only macOS installs the missing tools for you (with Homebrew). On Linux and Windows gasclaw tells you the exact command and you run it.
- The Google Chat app needs Google Workspace. On a personal Gmail everything else works (panel, web chat, agents, Google tools), and the daily Apps Script trigger budget is 90 min instead of 6 h.

## Security

- Secrets live only in `.env.local` (git-ignored) and in the owner-only gasclaw screen, stored in Script Properties. Never in Drive or in git.
- No `eval` and no code loaded from Drive: an agent is markdown only.
- Only the owner (the account that published) can open the gasclaw screen; each agent answers only the owner and the people the owner approved on that screen.
- ⚠️ Access change ([ADR-021](docs/adr/021-acesso-aprovado-no-painel.md)): who can talk to an agent and which tools it may use only take effect after being approved in the gasclaw panel. `users:` and `tools:` in the folder, the editor or the `config` sheet are now suggestions. After this version every agent answers only the owner and has no tools until you click **Approve** in the panel. If you used `users:` to give other people access, approve them in the panel.
- Google tools (Calendar, Gmail, Contacts, Tasks, Drive/Docs/Sheets) work only for the gasclaw owner. People approved in the panel can still talk to the agent, but their requests that would use these tools are refused, and only the owner approves those cards. The approval card shows every field in full (recipients, attendees, ids); only long text is summarized ([ADR-023](docs/adr/023-ferramentas-do-workspace.md)).
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

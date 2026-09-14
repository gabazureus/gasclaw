---
name: devmode
description: Use when the user invokes /devmode, asks to run devmode guided mode in Codex, or wants the Claude Code /devmode workflow adapted to Codex without changing the existing Claude setup.
---

# devmode for Codex

This skill is the Codex launcher equivalent of Claude Code's
`.claude/commands/devmode.md`.

Before acting, read `.claude/commands/devmode.md` from the repository root and
follow it as the source of truth. If that file is missing in an adopted project,
read `integrations/conductor-beads/commands/devmode.md` from the devmode base.

Codex adaptations:

1. `/devmode <args>` is **verified working in Codex Desktop**, where the app
   resolves that slash entry to this repo-shared `devmode` skill. That is the
   only Codex surface where the slash form is confirmed. On Codex CLI/IDE
   surfaces, reach the skill through the official picker instead: open
   `/skills`, select `devmode`, and pass the same arguments — do not promise
   Desktop-equivalent slash behavior there until Codex ships official support.
   Claude Code's `/devmode <args>` is unchanged and still owned by
   `.claude/commands/`.
2. For phase-driving modes, delegate to the Codex custom agent
   `devmode-orchestrator` and relay its gate. Do not embody the phase machine
   inline unless the source command says the mode runs inline.
3. For inline modes (`c`, `do`, `wiki`, `update`, `goal`, `plan`, and their
   source-defined variants), follow the source command directly in the main
   Codex thread.
4. Use Codex's normal `/goal` and `/plan` commands when the source command asks
   you to emit a ready-to-run goal or plan command.
5. When the flow calls for a `/conductor-*` lifecycle command (`/conductor-setup`,
   `/conductor-newtrack`, `/conductor-implement`, `/conductor-handoff`, …), read
   `.claude/commands/conductor-<name>.md` and execute it as the procedure. Those
   files are the canonical procedures for both hosts — do not restate or fork
   them into a Codex variant. If the project was installed without them, run the
   same phase directly from `conductor/workflow.md` and
   `conductor/.templates/track/`; a missing command file must not block the flow.
6. Preserve project-owned instructions and the Claude Code setup. Add Codex
   adapters; do not remove or weaken `.claude/`, `CLAUDE.md`, or existing hooks.

When a source instruction names a Claude-specific mechanism, map only the
mechanism to Codex and keep the behavior unchanged.

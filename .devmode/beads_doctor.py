#!/usr/bin/env python3
"""Prove the Beads memory layer is live in a project — or say so loudly.

Beads is devmode's persistent memory: the notes that survive conversation
compaction. Its failure mode is *silent* — if `bd` isn't installed the install
still finishes, `conductor/beads.json` keeps saying `enabled: true`, and the
session quietly falls back to the agent's own context. You find out much later,
when a handoff you thought was durable turns out never to have been written.

So this checks the *running* system, not the config: is the binary there, does
`.beads/` exist, and does `bd` actually answer inside this project. Structured as
a pure core (`diagnose`) over an imperative shell (`probe`) so the verdict logic
is testable without a bd install.

Usage:  python3 beads_doctor.py [project-dir]      (default: cwd)
Exit:   0 = memory is live · 1 = NOT live (devmode runs without durable memory)
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys

GREEN, RED, YELLOW, DIM, OFF = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


def probe(project: str) -> dict:
    """Imperative shell: gather raw facts about the Beads install in `project`."""
    facts: dict = {"project": project, "bd_path": shutil.which("bd")}
    if facts["bd_path"]:
        facts["version"] = _run(["bd", "--version"], project)[1].strip()
    beads = os.path.join(project, ".beads")
    facts["beads_dir"] = beads if os.path.isdir(beads) else None
    if facts["bd_path"] and facts["beads_dir"]:
        code, out = _run(["bd", "ready"], project)
        facts["ready_exit"] = code
        facts["ready_lines"] = len([l for l in out.splitlines() if l.strip()])
    state = os.path.join(beads, "export-state.json")
    if os.path.isfile(state):
        try:
            facts["counts"] = json.load(open(state, encoding="utf-8"))
        except Exception:
            facts["counts"] = None
    cfg = os.path.join(project, "conductor", "beads.json")
    if os.path.isfile(cfg):
        try:
            facts["config_enabled"] = json.load(open(cfg, encoding="utf-8")).get("enabled")
        except Exception:
            facts["config_enabled"] = None
    return facts


def _run(cmd: list[str], cwd: str) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=25)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as e:                       # missing binary, timeout, hang
        return 127, str(e)


def diagnose(f: dict) -> tuple[bool, list[tuple[str, str, str]], list[str]]:
    """Pure core: facts -> (live?, [(status, label, detail)], remediation lines)."""
    rows: list[tuple[str, str, str]] = []
    fix: list[str] = []

    if not f.get("bd_path"):
        rows.append(("✗", "bd installed", "not on PATH"))
        fix.append("Install the CLI:  brew install beads   (or: npm i -g @beads/bd)")
    else:
        rows.append(("✓", "bd installed", f"{f.get('version') or '?'}  ({f['bd_path']})"))

    if not f.get("beads_dir"):
        rows.append(("✗", ".beads/ present", "no .beads/ in this project"))
        fix.append("Initialise memory:  bd init --stealth   (or: bd init to commit it)")
    else:
        rows.append(("✓", ".beads/ present", f["beads_dir"]))

    if f.get("bd_path") and f.get("beads_dir"):
        if f.get("ready_exit") == 0:
            rows.append(("✓", "bd answers here", f"`bd ready` ok — {f.get('ready_lines', 0)} line(s)"))
        else:
            rows.append(("✗", "bd answers here", f"`bd ready` exit {f.get('ready_exit')}"))
            fix.append("bd is installed but not usable here — run `bd ready` and read the error.")

    c = f.get("counts")
    if c:
        rows.append(("✓", "memory store", f"{c.get('issues', '?')} issue(s), "
                                          f"{c.get('memories', '?')} memory note(s)"))
    elif f.get("beads_dir"):
        rows.append(("!", "memory store", "no export-state.json yet (empty store is fine)"))

    live = all(s == "✓" for s, _, _ in rows if s in ("✓", "✗")) and bool(
        f.get("bd_path") and f.get("beads_dir") and f.get("ready_exit") == 0)

    if not live and f.get("config_enabled") is True:
        fix.append("conductor/beads.json still says enabled:true — it is lying about "
                   "this project. Fix the install or set enabled:false so the state "
                   "matches reality.")
    return live, rows, fix


def render(live: bool, rows, fix, project: str) -> str:
    out = [f"\n{DIM}== Beads memory doctor — {project} =={OFF}"]
    for status, label, detail in rows:
        col = GREEN if status == "✓" else (RED if status == "✗" else YELLOW)
        out.append(f"  {col}{status}{OFF} {label:<18} {DIM}{detail}{OFF}")
    if live:
        out.append(f"\n{GREEN}✓ MEMORY IS LIVE{OFF} — handoffs written to bd survive compaction.")
    else:
        out.append(f"\n{RED}✗ MEMORY IS NOT LIVE{OFF} — devmode will run with **no durable "
                   f"memory**:\n  handoffs live only in the conversation and are LOST on "
                   f"compaction.\n  This fails silently, so fix it now or decide to accept it "
                   f"explicitly.")
        for line in fix:
            out.append(f"    → {line}")
    return "\n".join(out)


def main() -> int:
    project = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    live, rows, fix = diagnose(probe(project))
    print(render(live, rows, fix, project))
    return 0 if live else 1


if __name__ == "__main__":
    sys.exit(main())

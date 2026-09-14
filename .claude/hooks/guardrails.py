#!/usr/bin/env python3
"""devmode guardrails — a deterministic PreToolUse hook (gates-as-code).

devmode's skills *persuade* via prompts; this hook *enforces* a small set of
safety rules deterministically, so a few dangerous operations are blocked even
when prompt guidance drifts. Adapted (lean, stdlib-only) from the R-rule engine
in Chachamaru127/claude-code-harness (MIT).

Design (devmode-style): `evaluate()` is a **pure functional core** (tool name +
input → decision), tested directly; `main()` is the **imperative shell** (read
the hook JSON from stdin, print the permission decision). Fail-open: any error
or unparseable input → allow (a buggy guard must never block honest work).

Decisions: "allow" (silent), "ask" (user confirms), "deny" (blocked).
Wire it via Claude Code PreToolUse hooks (see hooks.snippet.json).
"""
from __future__ import annotations

import json
import re
import sys
from typing import Tuple

# A `.env` file (`.env`, `.env.local`, `.envrc`, `config/.env`) but NOT words like
# "environment" (no leading dot+token boundary).
_ENV_RE = re.compile(r"\.env(rc)?(\b|$|[./\s'\"])")
SECRET_SUBSTR = ("id_rsa", "id_ed25519", ".pem", "credential", "secret", ".ssh/")


def _is_secretish(text: str) -> bool:
    t = text.lower()
    return bool(_ENV_RE.search(t)) or any(s in t for s in SECRET_SUBSTR)


def evaluate(tool_name: str, tool_input: dict) -> Tuple[str, str]:
    """Pure core: return (decision, reason). decision in {allow, ask, deny}. First match wins."""
    if tool_name == "Bash":
        cmd = str(tool_input.get("command") or "")
        low = cmd.lower()
        if re.search(r"(^|\s|;|&&|\|)sudo\s", cmd):
            return "deny", "R01: refuse sudo / privilege escalation"
        if "git push" in low and re.search(r"(--force(\b|=)|\s-f\b|\s\+\w)", cmd):
            return "deny", "R02: refuse force-push (rewrites shared history)"
        if "--no-verify" in low or "--no-gpg-sign" in low:
            return "deny", "R03: refuse --no-verify / hook bypass"
        if re.search(r"git\s+reset\s+--hard", low) or re.search(r"git\s+clean\s+-\w*f", low) \
           or re.search(r"git\s+(checkout|restore)\s+--?\s*\.", low):
            return "ask", "R04: destructive git op — confirm before running"
        if re.search(r"\brm\s+-\w*r\w*f\w*|\brm\s+-\w*f\w*r\w*", low):
            if re.search(r"\s(/|~|\$home|\*)(\s|/|$)", low):
                return "deny", "R05: refuse rm -rf on / ~ or wildcard root"
            return "ask", "R05: recursive force delete — confirm the scope"
        if re.search(r"\b(cat|less|more|head|tail|bat|strings)\b", low) and _is_secretish(low):
            return "ask", "R06: reading a possible secret file — confirm"
        return "allow", ""
    if tool_name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        path = str(tool_input.get("file_path") or tool_input.get("path") or "").lower()
        if ".git/" in path or _is_secretish(path):
            return "deny", f"R07: refuse write to protected/secret path ({path})"
        return "allow", ""
    return "allow", ""


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0  # fail-open: never block on a parse error
    try:
        decision, reason = evaluate(str(data.get("tool_name") or ""), data.get("tool_input") or {})
    except Exception:
        return 0  # fail-open: never block on a guard bug
    if decision == "allow":
        return 0
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": f"devmode guardrail — {reason}",
    }}))
    return 0


if __name__ == "__main__":
    sys.exit(main())

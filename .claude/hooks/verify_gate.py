#!/usr/bin/env python3
"""verify_gate.py — devmode Stop hook: blocks ending a turn after a risky action
(rebuild / docker build / deploy / .env write) until a verification ran after it.

This makes `verification-before-completion` ENFORCED instead of advisory. It is the
deterministic counterpart to the `/devmode c` command (which carries the intent).

Protocol (Claude Code Stop hook):
- Receives JSON on stdin: { "transcript_path": "...", "stop_hook_active": bool, ... }
- To block the stop: print {"decision":"block","reason":"..."} to stdout, exit 0.
- Otherwise: exit 0 with no output (allow).
- Never hard-fail: on any error, allow (exit 0) — the gate must not break sessions.

Override: if a verification genuinely doesn't apply, the assistant writes the literal
marker  VERIFY-OK: <reason>  in its message; the gate then allows the stop.
"""
from __future__ import annotations

import json
import re
import sys

# Risky / state-applying actions that demand a fresh end-to-end verification
# before "done" (incl. restart/recreate: `docker compose restart` does NOT reload
# .env, so a config change can silently not take effect in the running container).
RISKY = [
    r"\bcli\.js\s+(rebuild|deploy|restart|start|update-model|update-ngrok|update-credentials)\b",
    r"\bnovoselo\s+(rebuild|deploy|restart|start|update-model|update-ngrok|update-credentials)\b",
    r"\bdocker\s+build\b",
    r"\bdocker\s+compose\s+build\b",
    r"\bdocker\s+compose\s+(up|restart|down)\b",
]
# Signals that a verification actually happened AFTER the risky action.
VERIFY = [
    r"jobs/completed/",            # a job reached completed/
    r"\bdocker\s+run\b",           # ran something in the image
    r"\bdocker\s+exec\b",          # checked the running container (env/state) after restart
    r"http_code",                  # curl status check
    r"\b(unittest|pytest|jest|vitest)\b",
    r"\bcli\.js\s+status\b",
    r"\bdocker\s+ps\b",
    r"/logs/.*\.log",              # read a container log to confirm
    r"COMPLETED|All containers healthy|status\":\"success",
]
ENV_WRITE = re.compile(r"(^|/)\.env(\.|$|\")")
OVERRIDE = re.compile(r"VERIFY-OK:", re.IGNORECASE)
RISKY_RE = re.compile("|".join(RISKY), re.IGNORECASE)
VERIFY_RE = re.compile("|".join(VERIFY), re.IGNORECASE)
FAILED_RESULT_RE = re.compile(
    r"\b(?:exit(?:ed)?(?: with)?(?: code)?|returncode)\s*[:=]?\s*[1-9]\d*\b"
    r"|\b[1-9]\d*\s+failed\b|\bcommand failed\b",
    re.IGNORECASE,
)


def allow():
    sys.exit(0)


def block(reason: str):
    print(json.dumps({"decision": "block", "reason": reason}))
    sys.exit(0)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        allow()
    # Avoid infinite loop: if we already blocked once and the model continued, let it stop.
    if data.get("stop_hook_active"):
        allow()
    tpath = data.get("transcript_path")
    if not tpath:
        allow()
    try:
        lines = open(tpath, encoding="utf-8").read().splitlines()
    except Exception:
        allow()

    last_risky = -1
    last_verify = -1
    overridden = False
    pending_verify_ids: set[str] = set()
    pending_verify_without_id = False
    i = 0
    for line in lines:
        try:
            e = json.loads(line)
        except Exception:
            continue
        msg = e.get("message") or {}
        content = msg.get("content")
        blocks = content if isinstance(content, list) else [{"type": "text", "text": content}] if content else []
        for b in blocks:
            if not isinstance(b, dict):
                continue
            t = b.get("type")
            if t == "tool_use":
                name = b.get("name", "")
                inp = b.get("input", {}) or {}
                cmd = inp.get("command", "") if isinstance(inp, dict) else ""
                fp = inp.get("file_path", "") if isinstance(inp, dict) else ""
                blob = f"{name} {cmd} {fp}"
                if RISKY_RE.search(blob) or (name in ("Write", "Edit", "MultiEdit") and ENV_WRITE.search(fp or "")):
                    last_risky = i
                if VERIFY_RE.search(blob):
                    tool_id = str(b.get("id") or "")
                    if tool_id:
                        pending_verify_ids.add(tool_id)
                    else:
                        pending_verify_without_id = True
            elif t == "tool_result":
                out = b.get("content")
                text = out if isinstance(out, str) else json.dumps(out) if out else ""
                tool_id = str(b.get("tool_use_id") or "")
                matched_pending = tool_id in pending_verify_ids if tool_id else pending_verify_without_id
                succeeded = not b.get("is_error") and not FAILED_RESULT_RE.search(text or "")
                if succeeded and (matched_pending or VERIFY_RE.search(text or "")):
                    last_verify = i
                if tool_id:
                    pending_verify_ids.discard(tool_id)
                elif pending_verify_without_id:
                    pending_verify_without_id = False
            elif t == "text":
                if OVERRIDE.search(b.get("text", "") or ""):
                    overridden = True
            i += 1

    if last_risky >= 0 and last_verify <= last_risky and not overridden:
        block(
            "🚦 devmode gate: you performed a risky action (rebuild/docker build/deploy/"
            ".env) and have NOT yet verified the end-to-end behavior after it.\n"
            "Before concluding: run a fresh verification (e.g. enqueue a job and "
            "confirm it reaches completed/; or run the tests; or check the container "
            "log). Show the evidence.\n"
            "If verification genuinely does not apply, write in your text: "
            "VERIFY-OK: <reason>."
        )
    allow()


if __name__ == "__main__":
    main()

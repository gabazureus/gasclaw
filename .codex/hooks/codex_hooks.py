#!/usr/bin/env python3
"""Codex hook adapter for devmode.

Claude Code and Codex expose similar lifecycle events, but their hook wire
formats differ in enough places that sharing the same script would either weaken
one side or depend on unstable transcript details. This adapter preserves the
existing Claude files and implements the equivalent Codex behavior:

- PreToolUse safety guardrails.
- PostToolUse state tracking for risky actions and verification evidence.
- Stop verification gate and devmode-orchestrator gate.
- SessionStart warm-resume context.

Fail open on unexpected errors. A broken hook must not break an honest session.
"""
from __future__ import annotations

import glob
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
from typing import Any

CRITERIA = ["correctness", "design", "testing", "safety", "clarity"]

RISKY_RE = re.compile(
    r"\bcli\.js\s+(rebuild|deploy|restart|start|update-model|update-ngrok|update-credentials)\b"
    r"|\bnovoselo\s+(rebuild|deploy|restart|start|update-model|update-ngrok|update-credentials)\b"
    r"|\bdocker\s+build\b"
    r"|\bdocker\s+compose\s+build\b"
    r"|\bdocker\s+compose\s+(up|restart|down)\b",
    re.IGNORECASE,
)
VERIFY_RE = re.compile(
    r"jobs/completed/"
    r"|\bdocker\s+run\b"
    r"|\bdocker\s+exec\b"
    r"|http_code"
    r"|\b(unittest|pytest|jest|vitest)\b"
    r"|\bcli\.js\s+status\b"
    r"|\bdocker\s+ps\b"
    r"|/logs/.*\.log"
    r"|COMPLETED|All containers healthy|status\":\"success",
    re.IGNORECASE,
)
ENV_WRITE_RE = re.compile(r"(^|/)\.env(\.|$|\")")
VERIFY_OVERRIDE_RE = re.compile(r"VERIFY-OK:", re.IGNORECASE)
DEVMODE_OVERRIDE_RE = re.compile(r"DEVMODE-OK:", re.IGNORECASE)
FAILED_RESULT_RE = re.compile(
    r"\b(?:exit(?:ed)?(?: with)?(?: code)?|returncode)\s*[:=]?\s*[1-9]\d*\b"
    r"|\b[1-9]\d*\s+failed\b|\bcommand failed\b",
    re.IGNORECASE,
)
GUARDRAIL_OVERRIDE = "DEVMODE-GUARDRAIL-OK"

# The slash is optional: Codex Desktop resolves `/devmode`, but on CLI/IDE the
# launcher skill is reached through the `/skills` picker, so the prompt can carry
# the bare name. Requiring the slash left the gate inert exactly where the docs
# send those users. Anchored to a line start so prose ("the devmode gate…") misses.
DEVMODE_MARK_RE = re.compile(r"(?m)^\s*/?devmode\b", re.IGNORECASE)
# The token must END the argument or be followed by a space — see the note in
# devmode_phase_gate.py: `\b` also fires on punctuation, so `wiki-like docs
# feature` and `goal: ship the beta` would be misread as inline modes.
INLINE_RE = re.compile(r"^(c|do|wiki|update|goal|plan)(\s|$)", re.IGNORECASE)
LEAN_INLINE_RE = re.compile(r"^lean\s+(goal|plan)(\s|$)", re.IGNORECASE)
ORCH_RE = re.compile(r"devmode[-_]orchestrator", re.IGNORECASE)

ENV_RE = re.compile(r"\.env(rc)?(\b|$|[./\s'\"])")
SECRET_SUBSTR = ("id_rsa", "id_ed25519", ".pem", "credential", "secret", ".ssh/")


def _allow() -> int:
    return 0


def _print_json(payload: dict[str, Any]) -> int:
    print(json.dumps(payload))
    return 0


def _pretool_deny(reason: str) -> int:
    return _print_json(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        }
    )


def _stop_block(reason: str) -> int:
    return _print_json({"decision": "block", "reason": reason})


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=True)
    except Exception:
        return str(value)


def _project_root(cwd: str) -> str:
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd or os.getcwd(),
            text=True,
            capture_output=True,
            timeout=5,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return proc.stdout.strip()
    except Exception:
        pass
    return os.path.abspath(cwd or os.getcwd())


def _state_path(data: dict[str, Any], root: str) -> str:
    base = os.environ.get("DEVMODE_CODEX_HOOK_STATE_DIR")
    if not base:
        base = os.path.join(tempfile.gettempdir(), "devmode-codex-hooks")
    session = str(data.get("session_id") or "no-session")
    digest = hashlib.sha256(f"{root}\0{session}".encode("utf-8")).hexdigest()[:24]
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, f"{digest}.json")


def _load_state(path: str) -> dict[str, Any]:
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            data.setdefault("seq", 0)
            data.setdefault("last_risky", -1)
            data.setdefault("last_verify", -1)
            data.setdefault("turns", {})
            return data
    except Exception:
        pass
    return {"seq": 0, "last_risky": -1, "last_verify": -1, "turns": {}}


def _save_state(path: str, state: dict[str, Any]) -> None:
    try:
        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
        os.replace(tmp, path)
    except Exception:
        pass


def _bump(state: dict[str, Any]) -> int:
    state["seq"] = int(state.get("seq") or 0) + 1
    return int(state["seq"])


def _trim_turns(state: dict[str, Any]) -> None:
    turns = state.get("turns")
    if not isinstance(turns, dict) or len(turns) <= 30:
        return
    ordered = sorted(
        turns.items(),
        key=lambda item: int((item[1] or {}).get("seq") or 0),
        reverse=True,
    )
    state["turns"] = dict(ordered[:30])


def _tool_input(data: dict[str, Any]) -> dict[str, Any]:
    value = data.get("tool_input")
    return value if isinstance(value, dict) else {}


def _command_from_input(tool_input: dict[str, Any]) -> str:
    return str(tool_input.get("command") or tool_input.get("cmd") or "")


def _paths_from_patch(patch: str) -> list[str]:
    paths: list[str] = []
    for line in patch.splitlines():
        m = re.match(r"\*\*\* (?:Add|Update|Delete) File: (.+)$", line)
        if m:
            paths.append(m.group(1).strip())
    return paths


def _tool_blob(tool_name: str, tool_input: dict[str, Any], tool_response: Any = None) -> str:
    bits = [tool_name, _command_from_input(tool_input)]
    for key in ("file_path", "path"):
        if tool_input.get(key):
            bits.append(str(tool_input[key]))
    cmd = _command_from_input(tool_input)
    if tool_name == "apply_patch" and cmd:
        bits.extend(_paths_from_patch(cmd))
    if tool_response is not None:
        bits.append(_safe_text(tool_response))
    return " ".join(bits)


def _is_secretish(text: str) -> bool:
    low = text.lower()
    return bool(ENV_RE.search(low)) or any(s in low for s in SECRET_SUBSTR)


def _fallback_evaluate(tool_name: str, tool_input: dict[str, Any]) -> tuple[str, str]:
    if tool_name == "Bash":
        cmd = _command_from_input(tool_input)
        low = cmd.lower()
        if re.search(r"(^|\s|;|&&|\|)sudo\s", cmd):
            return "deny", "R01: refuse sudo / privilege escalation"
        if "git push" in low and re.search(r"(--force(\b|=)|\s-f\b|\s\+\w)", cmd):
            return "deny", "R02: refuse force-push"
        if "--no-verify" in low or "--no-gpg-sign" in low:
            return "deny", "R03: refuse hook bypass"
        if re.search(r"git\s+reset\s+--hard", low) or re.search(r"git\s+clean\s+-\w*f", low) or re.search(
            r"git\s+(checkout|restore)\s+--?\s*\.", low
        ):
            return "ask", "R04: destructive git operation"
        if re.search(r"\brm\s+-\w*r\w*f\w*|\brm\s+-\w*f\w*r\w*", low):
            if re.search(r"\s(/|~|\$home|\*)(\s|/|$)", low):
                return "deny", "R05: refuse rm -rf on / ~ or wildcard root"
            return "ask", "R05: recursive force delete"
        if re.search(r"\b(cat|less|more|head|tail|bat|strings)\b", low) and _is_secretish(low):
            return "ask", "R06: reading a possible secret file"
        return "allow", ""
    if tool_name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        path = str(tool_input.get("file_path") or tool_input.get("path") or "").lower()
        if ".git/" in path or _is_secretish(path):
            return "deny", f"R07: refuse write to protected/secret path ({path})"
    return "allow", ""


def _load_claude_evaluate(root: str):
    candidates = [
        os.path.join(root, ".claude", "hooks", "guardrails.py"),
        os.path.join(root, "integrations", "conductor-beads", "hooks", "guardrails.py"),
    ]
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            spec = importlib.util.spec_from_file_location("devmode_guardrails", path)
            if not spec or not spec.loader:
                continue
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            if callable(getattr(mod, "evaluate", None)):
                return mod.evaluate
        except Exception:
            continue
    return _fallback_evaluate


def _evaluate_guardrail(root: str, tool_name: str, tool_input: dict[str, Any]) -> tuple[str, str]:
    evaluate = _load_claude_evaluate(root)
    if tool_name == "apply_patch":
        patch = _command_from_input(tool_input)
        for path in _paths_from_patch(patch):
            decision, reason = evaluate("Write", {"file_path": path})
            if decision != "allow":
                return decision, reason
        return "allow", ""
    return evaluate(tool_name, tool_input)


def _pre_tool_use(data: dict[str, Any], root: str) -> int:
    tool_name = str(data.get("tool_name") or "")
    tool_input = _tool_input(data)
    decision, reason = _evaluate_guardrail(root, tool_name, tool_input)
    if decision == "allow":
        return _allow()
    if decision == "ask":
        blob = _tool_blob(tool_name, tool_input)
        if GUARDRAIL_OVERRIDE in blob:
            return _allow()
        return _pretool_deny(
            "devmode guardrail requires explicit confirmation before this action: "
            f"{reason}. After the user confirms, rerun with "
            f"`# {GUARDRAIL_OVERRIDE}` in the shell command."
        )
    return _pretool_deny(f"devmode guardrail blocked this action: {reason}")


def _is_risky(tool_name: str, tool_input: dict[str, Any]) -> bool:
    blob = _tool_blob(tool_name, tool_input)
    if RISKY_RE.search(blob):
        return True
    if tool_name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        path = str(tool_input.get("file_path") or tool_input.get("path") or "")
        return bool(ENV_WRITE_RE.search(path))
    if tool_name == "apply_patch":
        return any(ENV_WRITE_RE.search(path) for path in _paths_from_patch(_command_from_input(tool_input)))
    return False


def _tool_succeeded(tool_response: Any) -> bool:
    if isinstance(tool_response, dict):
        for key in ("is_error", "isError", "error"):
            if tool_response.get(key) is True:
                return False
        for key in ("exit_code", "exitCode", "returncode"):
            value = tool_response.get(key)
            if isinstance(value, int) and value != 0:
                return False
        if tool_response.get("success") is False:
            return False
        status = str(tool_response.get("status") or "").lower()
        if status in ("error", "failed", "failure"):
            return False
    return not bool(FAILED_RESULT_RE.search(_safe_text(tool_response)))


def _is_verify(tool_name: str, tool_input: dict[str, Any], tool_response: Any) -> bool:
    return _tool_succeeded(tool_response) and bool(
        VERIFY_RE.search(_tool_blob(tool_name, tool_input, tool_response))
    )


def _is_orchestrator_spawn(tool_name: str, tool_input: dict[str, Any]) -> bool:
    if tool_name not in ("Agent", "spawn_agent", "Task"):
        return False
    blob = _tool_blob(tool_name, tool_input)
    for key in ("subagent_type", "agent_type", "type", "name", "profile", "message", "prompt"):
        if tool_input.get(key):
            blob += " " + str(tool_input[key])
    return bool(ORCH_RE.search(blob))


def _post_tool_use(data: dict[str, Any], state_path: str) -> int:
    state = _load_state(state_path)
    seq = _bump(state)
    tool_name = str(data.get("tool_name") or "")
    tool_input = _tool_input(data)
    tool_response = data.get("tool_response")
    if _is_risky(tool_name, tool_input):
        state["last_risky"] = seq
    if _is_verify(tool_name, tool_input, tool_response):
        state["last_verify"] = seq
    if _is_orchestrator_spawn(tool_name, tool_input) and _tool_succeeded(tool_response):
        turn_id = str(data.get("turn_id") or "unknown")
        turn = state.setdefault("turns", {}).setdefault(turn_id, {})
        turn["orchestrator_seen"] = True
        turn["seq"] = seq
    _trim_turns(state)
    _save_state(state_path, state)
    return _allow()


def _devmode_args(prompt: str) -> str | None:
    match = DEVMODE_MARK_RE.search(prompt)
    if not match:
        return None
    return prompt[match.end() :].strip()


def _is_full_devmode_prompt(prompt: str) -> bool:
    args = _devmode_args(prompt)
    if args is None:
        return False
    return not bool(INLINE_RE.match(args) or LEAN_INLINE_RE.match(args))


def _user_prompt_submit(data: dict[str, Any], state_path: str) -> int:
    state = _load_state(state_path)
    seq = _bump(state)
    turn_id = str(data.get("turn_id") or "unknown")
    prompt = str(data.get("prompt") or "")
    state.setdefault("turns", {})[turn_id] = {
        "seq": seq,
        "devmode_full": _is_full_devmode_prompt(prompt),
        "orchestrator_seen": False,
    }
    _trim_turns(state)
    _save_state(state_path, state)
    return _allow()


def _overall(entry: dict[str, Any]) -> float | None:
    scores = entry.get("scores", {})
    vals = []
    for c in CRITERIA:
        try:
            vals.append(scores[c]["score"])
        except Exception:
            pass
    return round(sum(vals) / len(vals), 1) if vals else None


def _warm_resume(root: str) -> str:
    try:
        with open(os.path.join(root, ".devmode", "scorecard.json"), encoding="utf-8") as fh:
            hist = json.load(fh)
    except Exception:
        return ""
    if not hist:
        return ""
    last = hist[-1]
    lines = ["[devmode] Warm resume - pick up where the loop left off:"]
    overall = _overall(last)
    suffix = f" ({overall}/10)" if overall is not None else ""
    if last.get("summary"):
        suffix += f" - {last['summary']}"
    lines.append(f"  - Last phase: {last.get('phase', '?')}{suffix}")
    tracks = [
        d
        for d in glob.glob(os.path.join(root, "conductor", "tracks", "*"))
        if os.path.isdir(d) and os.path.exists(os.path.join(d, "spec.md"))
    ]
    if tracks:
        latest = max(tracks, key=os.path.getmtime)
        lines.append(f"  - Active track: {os.path.basename(latest)}")
    recs = last.get("recommendations") or {}
    for c in CRITERIA:
        if recs.get(c):
            lines.append(f"  - Next ({c}): {recs[c]}")
            break
    lines.append("  - Full picture: open devmode-dashboard.html (refresh: python3 .devmode/dashboard.py .)")
    return "\n".join(lines)


def _session_start(root: str) -> int:
    text = _warm_resume(root)
    if text:
        print(text)
    return _allow()


def _refresh_dashboard(root: str) -> None:
    try:
        scorecard = os.path.join(root, ".devmode", "scorecard.json")
        dashboard = os.path.join(root, ".devmode", "dashboard.py")
        html = os.path.join(root, "devmode-dashboard.html")
        if not (os.path.isfile(scorecard) and os.path.isfile(dashboard)):
            return
        if os.path.isfile(html) and os.path.getmtime(html) >= os.path.getmtime(scorecard):
            return
        subprocess.run(
            [sys.executable, dashboard, root],
            cwd=root,
            timeout=30,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass


def _stop(data: dict[str, Any], root: str, state_path: str) -> int:
    _refresh_dashboard(root)
    if data.get("stop_hook_active"):
        return _allow()
    state = _load_state(state_path)
    seq = _bump(state)
    last_message = str(data.get("last_assistant_message") or "")
    if VERIFY_OVERRIDE_RE.search(last_message):
        state["last_verify"] = seq
    if int(state.get("last_risky") or -1) >= 0 and int(state.get("last_verify") or -1) < int(
        state.get("last_risky") or -1
    ):
        _save_state(state_path, state)
        return _stop_block(
            "devmode gate: a risky action ran (rebuild/docker build/deploy/.env), "
            "but no fresh end-to-end verification has run after it. Run a real "
            "check and show the evidence, or write VERIFY-OK: <reason> if it does "
            "not apply."
        )
    turn_id = str(data.get("turn_id") or "unknown")
    turn = (state.get("turns") or {}).get(turn_id) or {}
    if turn.get("devmode_full") and not turn.get("orchestrator_seen") and not DEVMODE_OVERRIDE_RE.search(last_message):
        _save_state(state_path, state)
        return _stop_block(
            "devmode gate: this was a phase-driving devmode turn, but it did not "
            "delegate to the devmode-orchestrator custom agent. Spawn that agent "
            "and relay its gate, or write DEVMODE-OK: <reason> if delegation does "
            "not apply."
        )
    _save_state(state_path, state)
    return _allow()


def main() -> int:
    try:
        data = json.load(sys.stdin)
        if not isinstance(data, dict):
            return _allow()
    except Exception:
        return _allow()
    try:
        root = _project_root(str(data.get("cwd") or os.getcwd()))
        state_path = _state_path(data, root)
        event = str(data.get("hook_event_name") or "")
        if event == "SessionStart":
            return _session_start(root)
        if event == "UserPromptSubmit":
            return _user_prompt_submit(data, state_path)
        if event == "PreToolUse":
            return _pre_tool_use(data, root)
        if event == "PostToolUse":
            return _post_tool_use(data, state_path)
        if event == "Stop":
            return _stop(data, root, state_path)
    except Exception:
        return _allow()
    return _allow()


if __name__ == "__main__":
    sys.exit(main())

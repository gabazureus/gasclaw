#!/usr/bin/env python3
"""devmode session-resume — a SessionStart hook that injects a *warm* resume
context so a fresh session doesn't start cold (context-engineering: survive
compaction; loop-engineering: maintain external state and resume from it).

It reads the project's own durable state (`.devmode/scorecard.json` + the active
conductor track) and prints a compact pointer to stdout, which Claude Code adds
to the session's starting context. Pure read, fail-OPEN: any problem → print
nothing, exit 0 (a resume hint must never block a session).
"""
import glob
import json
import os
import sys

CRITERIA = ["correctness", "design", "testing", "safety", "clarity"]


def _overall(entry):
    s = entry.get("scores", {})
    vals = [s[c]["score"] for c in CRITERIA if c in s]
    return round(sum(vals) / len(vals), 1) if vals else None


def main():
    root = os.environ.get("CLAUDE_PROJECT_DIR", ".")
    try:
        hist = json.load(open(os.path.join(root, ".devmode", "scorecard.json")))
    except Exception:
        return 0  # no devmode state here — nothing to resume, stay silent
    if not hist:
        return 0
    last = hist[-1]
    lines = ["[devmode] Warm resume — pick up where the loop left off:"]
    o = _overall(last)
    lines.append(f"  • Last phase: {last.get('phase', '?')}"
                 + (f" ({o}/10)" if o is not None else "")
                 + (f" — {last['summary']}" if last.get("summary") else ""))
    # active track: the most recently touched track dir with a spec
    tracks = [d for d in glob.glob(os.path.join(root, "conductor", "tracks", "*"))
              if os.path.isdir(d) and os.path.exists(os.path.join(d, "spec.md"))]
    if tracks:
        latest = max(tracks, key=os.path.getmtime)
        lines.append(f"  • Active track: {os.path.basename(latest)}")
    recs = last.get("recommendations") or {}
    for c in CRITERIA:
        if recs.get(c):
            lines.append(f"  • Next ({c}): {recs[c]}")
            break
    lines.append("  • Full picture: open devmode-dashboard.html (refresh: python3 .devmode/dashboard.py .)")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())

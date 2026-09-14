#!/usr/bin/env python3
"""devmode scorecard — render a self-evaluation across 5 criteria and track the
trend across phases. The *agent* assigns the scores (its judgment, backed by the
evidence it gathered — see skills/self-scorecard); this script renders them
consistently, stores history in .devmode/scorecard.json, and shows the delta vs.
the previous phase so progress is visible as numbers.

Usage:
  echo '<json>' | python3 scripts/scorecard.py            # record + render a phase
  python3 scripts/scorecard.py --final                     # trend + recommendations
  python3 scripts/scorecard.py --reset                     # clear history (new run)

Input JSON (record):
  {
    "phase": "Implement",
    "summary": "one-line overview of what was just done",
    "scores": {
      "correctness": {"score": 8, "note": "12/12 tests green; ACs mapped"},
      "design":      {"score": 7, "note": "deep core/shell; 1 shallow helper"},
      "testing":     {"score": 8, "note": "edges+invariants; no mocks in core"},
      "safety":      {"score": 6, "note": "guardrails on; auth review pending"},
      "clarity":     {"score": 7, "note": "ubiquitous language used; 1 ADR missing"}
    },
    "recommendations": {"safety": "review the auth path in full", ...}   # optional
  }
"""
from __future__ import annotations

import json
import os
import sys

CRITERIA = ["correctness", "design", "testing", "safety", "clarity"]
LABEL = {"correctness": "Correctness", "design": "Design", "testing": "Testing",
         "safety": "Safety", "clarity": "Clarity"}
HISTORY = os.path.join(os.getcwd(), ".devmode", "scorecard.json")

G, Y, R, B, DIM, OFF = "\033[32m", "\033[33m", "\033[31m", "\033[34m", "\033[2m", "\033[0m"


def band(x: float) -> str:
    return ("Weak" if x < 4 else "Developing" if x < 6 else "Solid" if x < 8
            else "Strong" if x < 9 else "Excellent")


def bar(score: float) -> str:
    n = round(max(0, min(10, score)))
    color = R if score < 4 else Y if score < 7 else G
    return f"{color}{'█'*n}{DIM}{'░'*(10-n)}{OFF}"


def delta(cur: float, prev: float | None) -> str:
    if prev is None:
        return f"{DIM}  · {OFF}"
    d = cur - prev
    if abs(d) < 0.05:
        return f"{DIM} — {OFF}"
    return (f"{G}▲+{d:.0f}{OFF}" if d > 0 else f"{R}▼{d:.0f}{OFF}") if cur == int(cur) and prev == int(prev) \
        else (f"{G}▲+{d:.1f}{OFF}" if d > 0 else f"{R}▼{d:.1f}{OFF}")


def load() -> list:
    try:
        return json.load(open(HISTORY))
    except Exception:
        return []


def save(hist: list) -> None:
    os.makedirs(os.path.dirname(HISTORY), exist_ok=True)
    json.dump(hist, open(HISTORY, "w"), indent=2)


def overall(scores: dict) -> float:
    vals = [scores[c]["score"] for c in CRITERIA if c in scores]
    return round(sum(vals) / len(vals), 1) if vals else 0.0


def render(entry: dict, prev: dict | None) -> None:
    scores = entry["scores"]
    pscores = prev["scores"] if prev else {}
    print(f"\n{B}╭─ devmode scorecard · Phase: {entry.get('phase','?')} ─────────────────────────────{OFF}")
    if entry.get("summary"):
        print(f"  {DIM}Overview:{OFF} {entry['summary']}")
    print()
    for c in CRITERIA:
        if c not in scores:
            continue
        s = scores[c]["score"]
        p = pscores.get(c, {}).get("score")
        print(f"  {LABEL[c]:<12} {bar(s)} {s:>2}/10 {delta(s, p):<12} {DIM}{scores[c].get('note','')}{OFF}")
    o, po = overall(scores), (overall(pscores) if pscores else None)
    print(f"  {DIM}{'─'*58}{OFF}")
    print(f"  {'Overall':<12} {bar(o)} {o:>4}/10 {delta(o, po):<12} {B}band: {band(o)}{OFF}")
    print(f"{B}╰──────────────────────────────────────────────────────────────{OFF}\n")


def final(hist: list) -> None:
    if not hist:
        print("No scorecard history yet.")
        return
    print(f"\n{B}═══ devmode final scorecard ═══{OFF}")
    render(hist[-1], hist[-2] if len(hist) > 1 else None)
    # trend per phase
    print(f"  {DIM}Trend (overall):{OFF} " +
          "  →  ".join(f"{e.get('phase','?')} {overall(e['scores'])}" for e in hist))
    # recommendations (agent-authored, carried on the last entry)
    recs = hist[-1].get("recommendations") or {}
    if recs:
        print(f"\n{B}Recommendations to strengthen each criterion:{OFF}")
        for c in CRITERIA:
            if recs.get(c):
                print(f"  {Y}•{OFF} {LABEL[c]}: {recs[c]}")
    print()


def main() -> int:
    args = sys.argv[1:]
    if "--reset" in args:
        try:
            os.remove(HISTORY)
        except FileNotFoundError:
            pass
        print("scorecard history reset.")
        return 0
    if "--final" in args:
        final(load())
        return 0
    raw = sys.stdin.read()
    try:
        entry = json.loads(raw)
    except Exception as e:
        print(f"invalid JSON: {e}", file=sys.stderr)
        return 1
    if "scores" not in entry:
        print("JSON needs a 'scores' object", file=sys.stderr)
        return 1
    hist = load()
    prev = hist[-1] if hist else None
    hist.append(entry)
    save(hist)
    render(entry, prev)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""devmode dashboard — generate a self-contained HTML overview of a project from
its own devmode files. No server, no registration, no external service: just open
the file. This is the lightweight "visualization" alternative to standing up a
heavy external Web UI/dashboard service — it reads what's already on disk and
gives a KPI strip, a workflow pipeline, run/gate monitoring, and a trend chart
without the infrastructure.

Reads (relative to the project root / cwd):
  .devmode/scorecard.json            → the 5-criteria scores + per-phase trend
  .devmode/gates.json                → last gate-ladder run (written by ci/check.sh)
  conductor/tracks/<id>/plan.md      → phase/task progress ([ ]/[x]/[~]/[!])
  conductor/tracks/<id>/decisions.md → ADR count

Usage:  python3 scripts/dashboard.py [project_dir] [-o out.html]
Default output: <project>/devmode-dashboard.html
"""
from __future__ import annotations

import glob
import html
import json
import os
import re
import sys

CRITERIA = ["correctness", "design", "testing", "safety", "clarity"]
# the canonical devmode workflow — used for the pipeline visualization
PHASES = ["Align", "Language", "Specify", "Architect", "Implement", "Review", "Refactor"]


def read(p):
    try:
        return open(p, encoding="utf-8").read()
    except Exception:
        return ""


def load_json(root, name):
    try:
        return json.load(open(os.path.join(root, ".devmode", name)))
    except Exception:
        return None


def scorecard(root):
    return load_json(root, "scorecard.json") or []


SKIP_DIRS = {"archive", ".templates", "track"}  # scaffold/template dirs, not real tracks


def tracks(root):
    out = []
    # list each track DIRECTORY (a track exists once it has a spec.md — plan.md is optional)
    for d in sorted(glob.glob(os.path.join(root, "conductor", "tracks", "*"))):
        tid = os.path.basename(d)
        if not os.path.isdir(d) or tid in SKIP_DIRS:
            continue
        if not os.path.exists(os.path.join(d, "spec.md")):
            continue
        text = read(os.path.join(d, "plan.md"))
        done = len(re.findall(r"- \[x\]", text, re.I))
        todo = len(re.findall(r"- \[ \]", text))
        prog = len(re.findall(r"- \[~\]", text))
        blocked = len(re.findall(r"- \[!\]", text))
        total = done + todo + prog + blocked
        adrs = len(re.findall(r"^## ADR-", read(os.path.join(d, "decisions.md")), re.M))
        out.append({"id": tid, "done": done, "total": total, "prog": prog,
                    "blocked": blocked, "adrs": adrs, "has_plan": bool(text.strip())})
    return out


def overall_of(entry):
    return round(sum(entry["scores"].get(c, {}).get("score", 0) for c in CRITERIA) / 5, 1)


def band(x):
    return ("Weak" if x < 4 else "Developing" if x < 6 else "Solid" if x < 8
            else "Strong" if x < 9 else "Excellent")


def canon(phase_name):
    """Map a recorded phase ('Implement·iter2', 'Re-specify·t5') to a canonical phase."""
    base = re.split(r"[·.]", phase_name or "")[0].strip().lower()
    if base.startswith("re-"):           # 're-specify' → 'specify' (a deliberate loop-back)
        base = base[3:]
    for p in PHASES:
        if base == p.lower():
            return p
    return None


def bar(score, w=180):
    pct = max(0, min(10, score)) / 10
    color = "#b91c1c" if score < 4 else "#b45309" if score < 7 else "#15803d"
    return (f'<div class="bar"><div class="fill" style="width:{pct*w:.0f}px;'
            f'background:{color}"></div></div>')


def sparkline(vals, w=260, h=44):
    """Inline-SVG trend chart of the overall-score trajectory (0–10 scale)."""
    if len(vals) < 2:
        return ""
    n = len(vals)
    pts = []
    for i, v in enumerate(vals):
        x = i / (n - 1) * (w - 6) + 3
        y = h - 3 - max(0, min(10, v)) / 10 * (h - 6)
        pts.append((x, y))
    line = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    area = f"3,{h-3} " + line + f" {w-3},{h-3}"
    lx, ly = pts[-1]
    return (f'<svg class="spark" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'role="img" aria-label="overall score trend across phases">'
            f'<polygon points="{area}" fill="#dbeafe"/>'
            f'<polyline points="{line}" fill="none" stroke="#1d4ed8" stroke-width="2"/>'
            f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="3.5" fill="#1d4ed8"/></svg>')


def pipeline(hist):
    """Horizontal workflow view: which devmode phases are reached."""
    reached = {canon(e.get("phase", "")) for e in hist}
    reached.discard(None)
    cur = canon(hist[-1].get("phase", "")) if hist else None
    parts = []
    for i, p in enumerate(PHASES):
        if i:
            seg = "seg done" if (PHASES[i - 1] in reached and p in reached) else "seg"
            parts.append(f'<div class="{seg}"></div>')
        cls = "node cur" if p == cur else "node done" if p in reached else "node"
        parts.append(f'<div class="{cls}"><span class="ring"></span>'
                     f'<span class="lbl">{p}</span></div>')
    return '<div class="pipe">' + "".join(parts) + '</div>'


def gates_card(root):
    g = load_json(root, "gates.json")
    if not g:
        return ('<span class="note">—</span>',
                '<p class="note">No gate run recorded yet. Run <code>ci/check.sh</code> '
                '— it writes <code>.devmode/gates.json</code>.</p>')
    items = g.get("gates", [])
    allok = g.get("ok", all(x.get("ok") for x in items)) if items else False
    kpi = '<span class="ok">&#10003; pass</span>' if allok else '<span class="bad">&#10007; fail</span>'
    rows = ""
    for x in items:
        mark = '<span class="ok">&#10003;</span>' if x.get("ok") else '<span class="bad">&#10007;</span>'
        detail = html.escape(x.get("detail", "") or "")
        rows += (f'<div class="gate"><span>{mark} {html.escape(x.get("name","?"))}</span>'
                 f'<span class="note">{detail}</span></div>')
    ts = html.escape(g.get("ts", ""))
    foot = f'<p class="note">last run: {ts}</p>' if ts else ""
    return kpi, (rows + foot or '<p class="note">gate file present but empty</p>')


def render(root):
    hist = scorecard(root)
    latest = hist[-1] if hist else None
    name = os.path.basename(os.path.abspath(root))
    phase = latest.get("phase", "—") if latest else "—"

    rows = ""
    if latest:
        for c in CRITERIA:
            s = latest["scores"].get(c, {})
            sc = s.get("score", 0)
            rows += (f'<tr><td class="crit">{c.title()}</td><td>{bar(sc)}</td>'
                     f'<td class="num">{sc}/10</td><td class="note">{html.escape(s.get("note",""))}</td></tr>')
        overall = overall_of(latest)
    else:
        overall = "—"

    overalls = [overall_of(e) for e in hist]
    trend = "  &rarr;  ".join(
        f'{html.escape(e.get("phase","?"))} {overall_of(e)}' for e in hist) or "no scorecard yet"
    # carry forward the most recent recommendations (persist "next actions" even
    # after a phase that recorded none) — the overview stays actionable.
    recs = {}
    for e in reversed(hist):
        if e.get("recommendations"):
            recs = e["recommendations"]
            break
    rec_html = "".join(f"<li><b>{c.title()}:</b> {html.escape(t)}</li>" for c, t in recs.items() if t)

    trks = tracks(root)
    tasks_done = sum(t["done"] for t in trks)
    tasks_total = sum(t["total"] for t in trks)
    adrs_total = sum(t["adrs"] for t in trks)
    blocked_total = sum(t["blocked"] for t in trks)

    trk = ""
    for t in trks:
        if t["total"]:
            pct = t["done"] / t["total"] * 100
            prog_cell = (f'<div class="bar"><div class="fill" style="width:{pct*1.6:.0f}px;'
                         f'background:#1d4ed8"></div></div>')
            done_cell = f'{t["done"]}/{t["total"]}'
        else:  # a track with a spec but no plan.md yet
            prog_cell = '<span class="note">spec only — no plan yet</span>'
            done_cell = "—"
        trk += (f'<tr><td>{html.escape(t["id"])}</td>'
                f'<td>{prog_cell}</td>'
                f'<td class="num">{done_cell}</td>'
                f'<td>{"⚠️ "+str(t["blocked"]) if t["blocked"] else ""}</td>'
                f'<td class="num">{t["adrs"]} ADR</td></tr>')
    trk = trk or '<tr><td colspan="5" class="note">no tracks yet</td></tr>'

    # timeline — one event per recorded phase (summary already in scorecard.json)
    tl, prev_o, prev_pi = "", None, None
    for e in hist:
        o = overall_of(e)
        if prev_o is None:
            d = '<span class="flat">start</span>'
        else:
            diff = round(o - prev_o, 1)
            d = (f'<span class="up">&#9650; +{diff}</span>' if diff > 0
                 else f'<span class="down">&#9660; {diff}</span>' if diff < 0
                 else '<span class="flat">&mdash;</span>')
        prev_o = o
        # loop-back: this phase's canonical position is EARLIER than the previous one
        # (the workflow is a loop — a downstream finding sent us back upstream).
        c = canon(e.get("phase", ""))
        pi = PHASES.index(c) if c in PHASES else None
        loopback = pi is not None and prev_pi is not None and pi < prev_pi
        if pi is not None:
            prev_pi = pi
        kind = "loop" if loopback else "review" if "review" in e.get("phase", "").lower() else "build"
        badge = ' <span class="loopback">&#8617; re-entry</span>' if loopback else ""
        tl += (f'<li class="ev {kind}"><span class="dot"></span>'
               f'<div class="ev-body"><div class="ev-head">'
               f'<span class="ev-phase">{html.escape(e.get("phase", "?"))}{badge}</span>'
               f'<span class="ev-score">{o}/10 {d}</span></div>'
               f'<div class="ev-sum">{html.escape(e.get("summary", ""))}</div></div></li>')
    tl = tl or '<li class="note">no phases recorded yet &mdash; run scripts/scorecard.py</li>'

    gate_kpi, gate_html = gates_card(root)
    spark = sparkline(overalls)
    band_label = band(overall) if hist else "—"

    # KPI strip (overview tiles)
    def kpi(label, value):
        return f'<div class="kpi"><div class="v">{value}</div><div class="l">{label}</div></div>'
    kpis = (
        kpi("Overall", f'{overall}<span class="slash">/10</span>')
        + kpi("Band", band_label)
        + kpi("Phases", len(hist))
        + kpi("Tracks", len(trks))
        + kpi("Tasks", f'{tasks_done}/{tasks_total}' if tasks_total else "—")
        + kpi("ADRs", adrs_total)
        + kpi("Gates", gate_kpi)
        + (kpi("Blocked", f'<span class="bad">{blocked_total}</span>') if blocked_total else "")
    )

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>devmode · {html.escape(name)}</title><style>
:root{{font:15px/1.5 system-ui,sans-serif;color:#1a1a1a}}
body{{max-width:900px;margin:32px auto;padding:0 16px}}
h1{{font-size:24px;margin:0 0 4px}} .sub{{color:#4b5563;margin:0 0 20px}}
.card{{border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:16px 0}}
.card h2{{font-size:16px;margin:0 0 12px}}
table{{width:100%;border-collapse:collapse}} td{{padding:6px 8px;vertical-align:middle}}
.crit{{font-weight:600;width:96px}} .num{{font-variant-numeric:tabular-nums;text-align:right;width:64px}}
.note{{color:#6b7280;font-size:13px}} code{{background:#f3f4f6;border-radius:4px;padding:1px 5px;font-size:12px}}
.bar{{background:#f3f4f6;border-radius:4px;height:12px;width:180px;overflow:hidden}}
.fill{{height:12px;border-radius:4px}}
.phase{{display:inline-block;background:#1d4ed8;color:#fff;border-radius:999px;padding:2px 12px;font-size:13px}}
ul{{margin:8px 0 0;padding-left:18px}} li{{margin:4px 0}}
.ok{{color:#15803d;font-weight:600}} .bad{{color:#b91c1c;font-weight:600}}
/* KPI strip */
.kpis{{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 16px}}
.kpi{{flex:1 1 96px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fafafa}}
.kpi .v{{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}}
.kpi .v .slash{{font-size:13px;color:#9ca3af;font-weight:400}}
.kpi .l{{color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-top:2px}}
/* pipeline */
.pipe{{display:flex;align-items:center;flex-wrap:wrap;gap:2px}}
.node{{display:flex;flex-direction:column;align-items:center;gap:5px;flex:0 0 auto;min-width:60px}}
.node .ring{{width:20px;height:20px;border-radius:50%;border:2px solid #d1d5db;background:#fff}}
.node.done .ring{{background:#15803d;border-color:#15803d}}
.node.cur .ring{{background:#1d4ed8;border-color:#1d4ed8;box-shadow:0 0 0 4px #dbeafe}}
.node .lbl{{font-size:11px;color:#9ca3af}} .node.done .lbl,.node.cur .lbl{{color:#1a1a1a}}
.seg{{height:2px;background:#e5e7eb;flex:1 1 6px;min-width:6px}} .seg.done{{background:#15803d}}
/* trend + sparkline */
.trendrow{{display:flex;align-items:center;gap:16px;flex-wrap:wrap}}
.spark{{flex:0 0 auto}} .trend{{color:#4b5563;font-size:13px}}
/* timeline */
.timeline{{list-style:none;margin:0;padding:0;position:relative}}
.timeline:before{{content:"";position:absolute;left:7px;top:6px;bottom:10px;width:2px;background:#e5e7eb}}
.ev{{position:relative;padding:0 0 16px 28px}} .ev:last-child{{padding-bottom:0}}
.dot{{position:absolute;left:0;top:3px;width:16px;height:16px;border-radius:50%;background:#1d4ed8;border:3px solid #fff;box-shadow:0 0 0 1px #d1d5db}}
.ev.review .dot{{background:#7c3aed}}
.ev.loop .dot{{background:#b45309}}
.loopback{{background:#fef3c7;color:#92400e;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:600;white-space:nowrap}}
.ev-head{{display:flex;justify-content:space-between;align-items:baseline;gap:8px}}
.ev-phase{{font-weight:600}} .ev-score{{font-variant-numeric:tabular-nums;color:#4b5563;font-size:13px;white-space:nowrap}}
.ev-sum{{color:#6b7280;font-size:13px;margin-top:2px}}
.up{{color:#15803d;font-weight:600}} .down{{color:#b91c1c;font-weight:600}} .flat{{color:#9ca3af}}
/* gates */
.gate{{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #f3f4f6}}
.gate:last-of-type{{border-bottom:0}}
</style></head><body>
<h1>devmode · {html.escape(name)}</h1>
<p class="sub">Current phase: <span class="phase">{html.escape(str(phase))}</span></p>

<div class="kpis">{kpis}</div>

<div class="card"><h2>Workflow pipeline</h2>{pipeline(hist)}</div>

<div class="card"><h2>Scorecard</h2><table>{rows or '<tr><td class="note">run scripts/scorecard.py to populate</td></tr>'}</table>
<div class="trendrow">{spark}<span class="trend">Trend: {trend}</span></div></div>

<div class="card"><h2>Gates &mdash; last run</h2>{gate_html}</div>

<div class="card"><h2>Timeline</h2><ul class="timeline">{tl}</ul></div>

<div class="card"><h2>Tracks</h2><table>
<tr><td class="crit">Track</td><td>Progress</td><td class="num">Done</td><td></td><td class="num">ADRs</td></tr>
{trk}</table></div>

{f'<div class="card"><h2>Next actions</h2><ul>{rec_html}</ul></div>' if rec_html else ''}
<p class="note">Generated by devmode · open this file anytime · re-run scripts/dashboard.py to refresh.</p>
</body></html>"""


def main():
    args = [a for a in sys.argv[1:] if a != "-o"]
    root = next((a for a in args if not a.endswith(".html")), ".")
    out = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "-o"),
               os.path.join(root, "devmode-dashboard.html"))
    open(out, "w", encoding="utf-8").write(render(root))
    print(f"dashboard written: {out}")


if __name__ == "__main__":
    main()

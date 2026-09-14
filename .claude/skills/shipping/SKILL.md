---
name: shipping
description: >-
  Release safely — a pre-launch checklist, staged rollout with monitoring and
  rollback thresholds, and the discipline that "PR-ready" is not "release-ready."
  Use when preparing to ship/launch/deploy, cutting a release or tag, or when the
  user says "ship it", "release", "go live", "launch checklist", "deploy to
  prod". Shipping is its own gate beyond passing tests — what's verified locally
  still has to survive contact with production.
---

# Shipping & launch

Passing tests means the code is *PR-ready*. Shipping asks a different question:
will it survive contact with production, and can you undo it if not? "Works on my
machine / in CI" and "safe in front of users" are two different bars; this skill
is the second one.

## Pre-launch checklist

Before releasing, confirm (with evidence, not assumption —
[`verification-before-completion`](../verification-before-completion/SKILL.md)):

- **The gate passed** — build/types/lint/tests green in CI
  ([`ci-cd-automation`](../ci-cd-automation/SKILL.md)); acceptance criteria met.
- **Reviewed** — the [`code-review`](../code-review/SKILL.md) panel signed off;
  critical paths (auth/money/security) reviewed in full.
- **Config & secrets** — prod config set, secrets present and *not* in the
  bundle/logs ([`security-hardening`](../security-hardening/SKILL.md)).
- **Migrations ready** — schema changes are expand-contract and reversible
  ([`migration`](../migration/SKILL.md)); backups exist.
- **Observability** — logs, metrics, and alerts for the new path are in place, or
  you're flying blind.
- **Rollback plan** — you know *exactly* how to undo this (flag flip, redeploy
  previous, revert), and it's been thought through *before* you ship.

## Staged rollout

Don't expose 100% of users at once:

- **Flag / canary / percentage rollout** — release to a small cohort first, watch,
  then widen. Decouple deploy from release with a flag where you can.
- **Define rollback thresholds up front** — the concrete error-rate / latency /
  business-metric levels that trigger an automatic or immediate rollback. Decide
  them before launch, not during the incident.
- **Watch the right signals** during ramp — not just "is it up", but the metrics
  that show users are actually succeeding.

## After launch

- **Verify in prod** — exercise the real path; confirm the metrics, don't assume.
- **Tag + CHANGELOG** the release ([`git-workflow`](../git-workflow/SKILL.md)).
- **Capture learnings** — what surprised you? Feed it back (a quick retro / ADR).

## Red flags

- Shipping straight to 100% with no canary/flag and no rollback.
- "Tests pass, so ship" — skipping the prod-readiness checklist.
- No monitoring/alerts on the new path (can't tell if it's failing).
- Rollback thresholds invented *during* the incident.
- A breaking schema/contract change shipped without expand-contract + backup.

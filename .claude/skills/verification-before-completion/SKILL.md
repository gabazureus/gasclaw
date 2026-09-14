---
name: verification-before-completion
description: >-
  Require fresh verification evidence before claiming any work is done, fixed,
  passing, or correct — and before committing, opening a PR, or moving to the
  next task. Use when you're about to say "done", "fixed", "it works",
  "tests pass", "ready to merge", or express satisfaction ("great", "perfect").
  Also use before trusting a subagent's "success" report. Claiming completion
  without running the check is a correctness and trust failure, not efficiency.
---

# Verification before completion

Claiming work is complete without verifying it is not efficiency — it's a guess
dressed as a result, and it breaks trust the moment it's wrong. The AI is
especially prone to this: it changes code and reports success from confidence,
not evidence. This skill is the gate that converts "should work" into "verified
to work".

This is distinct from [`feedback-loops`](../feedback-loops/SKILL.md): feedback
loops are the checks you run *continuously while building*; this is the final
**gate before you make a completion claim**. They reinforce each other. It is
also the bookend to [`confidence-check`](../confidence-check/SKILL.md) — that
gate confirms you're *ready to start*; this one confirms you're *actually done*.

## The iron law

**No completion claim without fresh verification evidence.** If you have not run
the verifying command in this turn, you cannot claim the thing it would prove.

## The gate function

Before stating any status or expressing satisfaction:

1. **Identify** — which command proves this claim?
2. **Run** — execute the *full*, fresh command (not a partial check, not a
   remembered earlier run).
3. **Read** — the complete output; check the exit code; count failures.
4. **Verify** — does the output actually confirm the claim?
   - No → state the *actual* status, with evidence.
   - Yes → state the claim, *with* the evidence.
5. **Only then** make the claim.

Skipping any step is asserting, not verifying.

## What each claim actually requires

| Claim | Sufficient evidence | NOT sufficient |
|-------|--------------------|----------------|
| Tests pass | Test run output: 0 failures, this turn | "should pass", an earlier run |
| Linter/types clean | Tool output: 0 errors | "linter passed" (≠ compiler) |
| Build succeeds | Build command: exit 0 | logs "look fine" |
| Bug fixed | The original symptom retested: gone | code changed, assumed fixed |
| Regression test works | Red→green verified (revert fix → test FAILS → restore → passes) | test passes once |
| Subagent finished | The VCS diff / output inspected | the agent's "success" report |
| Requirements met | Line-by-line check against the spec/PRD | "tests pass, so it's done" |
| Gate is green | The gate actually *ran over the file you changed* | exit 0 (a glob/path may have skipped it) |
| Config/deploy applied | The **running** system reflects it (live env, endpoint, behavior) | the source/host file is correct on disk |
| Deliverables produced | Each artifact the task *promised* exists — the files, the report, the N tests are present | a green check, without confirming what was actually produced |

## Ground per claim, not per session

Grounding is not transitive: verifying four neighboring things does not verify the
*one* load-bearing claim — and the volume of grounding you did makes the
unverified claim *feel* as solid as the verified rest. Isolate the single claim the
result rests on and verify *that* one directly ("it's built like its neighbors" is
not evidence about it).

- **A prior can be self-minted, not just stale recall** — it's also a conclusion
  you reached *this session* from nearby code, and that kind is the more dangerous,
  because it feels freshly earned and rides on the credibility of everything else
  you verified. Verify it before you lean on it.
- **Do the cheapest decisive check yourself** — if one file (a config, an
  entrypoint) would settle the load-bearing claim, open it. Ending your turn by
  asking the human to confirm what a file you could have read is the same deferral,
  one turn later.

## Red flags — stop before you speak

- "should", "probably", "seems to", "looks correct"
- "Great!" / "Perfect!" / "Done!" *before* running the check
- About to commit / push / open a PR without verifying
- Trusting a subagent's success report without inspecting the diff
- "Just this once" · "I'm tired" · "partial check is enough"
- A **green gate that silently skipped the changed file** — a `**` glob that
  doesn't recurse (bash without `globstar`), an over-broad exclude, a path typo.
  A passing gate proves nothing about code it never executed; confirm the gate
  *covered your change*, not just that it exited 0.
- **Verified the source/config, not the running process that uses it** — editing a
  file, regenerating a config, or rebuilding an image proves nothing until the *live*
  system loads it. A restart may not reload env; a build may not be deployed; a fix
  in `src/` may not be in the running `dist/`. Check the live artifact, not the file.
- **Output silently truncated** — a deliverable that was supposed to be complete
  but ships with `// ... rest of code`, `// TODO implement`, "the rest follows the
  same pattern", "similarly for the others", or first-and-last with the middle
  skipped. When full output was requested, *partial output is not done*: count the
  deliverables up front, generate each fully, and if a real token limit looms, stop
  at a clean boundary with `[PAUSED — X of Y]` rather than compressing or faking it.
  (This is distinct from [`minimal-code`](../minimal-code/SKILL.md): write the
  *minimum* code needed, but write *all* of the code you committed to.)
- **The promised deliverables don't all exist** — the task said "add the tests,
  update the docs, and the migration"; you ran one green check but only wrote the
  code. Before "done", **restate the concrete artifacts this task was meant to
  produce and confirm each is present** — a passing generic check is not proof the
  *specific* deliverables materialized. (Distinct from truncation above: there one
  deliverable shipped half-written; here whole promised artifacts are missing.)
- Different wording to dodge the rule — spirit over letter

## Verify the running state, not the source

For anything deployed, containerized, or long-running, **"the file is correct on
disk" ≠ "the running system uses it."** The most expensive misses come from
verifying the thing you *edited* instead of the thing that's *executing*:

- Changed `src/` but the container runs a stale compiled `dist/` → rebuild **and**
  confirm the new code is in the running image.
- Fixed a value in `.env`/config but the process kept the old env → a plain
  `restart` often does **not** reload env files; recreate the process and read its
  *live* env back (e.g. `docker exec <c> env | grep VAR`), don't re-read the host file.
- Deployed a change but didn't exercise it → run the real path end-to-end (a job
  that completes, a request that returns 200) and read the result.

Rule of thumb: **observe the live system reflecting your change** — its actual env,
output, or behavior — before you call it done. The config on disk is a hypothesis;
the running process is the evidence. (In devmode projects this is enforced by the
`verify_gate.py` Stop hook after rebuild/deploy/restart/`.env` changes.)

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "Should work now" | Then running it costs nothing — run it. |
| "I'm confident" | Confidence is not evidence. |
| "Linter passed" | The linter doesn't compile or run the code. |
| "The agent said success" | Verify independently; agents over-report. |
| "Partial check is enough" | Partial proves nothing about the whole. |
| "Pre-existing failure, not mine" | A red you ship is still yours — "0 failures, this turn" means zero, old ones included; fix it or get explicit sign-off to defer. |
| "I'll flag it as untested and move on" | A caveat on your *own* work — "not tested against the real API", "deployed but never exercised" — is an unmet acceptance criterion, not a footnote. Resolve it before it reaches a blast radius; the bigger the radius, the lower the bar for *running it* over *reasoning about it*. |

## Attach the evidence (don't just assert it)

A claim is stronger — and re-checkable — when the *evidence travels with it*. When
you report completion, attach the actual output, not a summary: "tests pass
(`Ran 12 tests … OK`)", not "tests pass". For a release or a hand-off, assemble a
small **evidence pack**: the commands run, their output/exit codes, the commit
SHAs, and which acceptance criteria each proves. This is what lets a reviewer (or
a future you) trust the result without re-deriving it from memory — and it pairs
with the evidence-gated handoff the `tdd-implementer` returns.

## The bottom line

Run the command. Read the output. *Then* make the claim. Pair this with
[`systematic-debugging`](../systematic-debugging/SKILL.md) (verify the fix
worked) and [`tdd`](../tdd/SKILL.md) (the red→green evidence for regressions).

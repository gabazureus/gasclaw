---
name: performance-optimization
description: >-
  Fix performance the disciplined way — measure first, find the real bottleneck,
  optimize it, verify the win. Covers profiling, N+1 queries, Core Web Vitals,
  bundle/image size, caching, and perf budgets. Use when something is slow, when
  the user says "optimize", "it's slow", "performance", "speed this up", "reduce
  bundle size", "the query is slow", or before shipping perf-sensitive work.
  Never optimize on a hunch — measure, or you'll speed up the wrong thing.
---

# Performance optimization

The cardinal rule: **measure before you optimize.** The slow thing is almost
never where intuition says, and "optimizations" applied blind add complexity for
no gain (often a regression). Profile, find the actual bottleneck, fix *that*,
and verify the number moved. This is [`systematic-debugging`](../systematic-debugging/SKILL.md)
pointed at speed instead of correctness.

## The loop

1. **Set the target.** What's "fast enough" here, by what metric? (p95 latency,
   LCP, time-to-interactive, throughput, memory.) Without a target you can't know
   when to stop.
2. **Measure / profile** under realistic conditions (prod-like data volume,
   throttled network/CPU for front-end). Get the *actual* breakdown.
3. **Find the dominant cost** (Amdahl: optimizing a 2% slice is wasted effort).
4. **Fix the one bottleneck**, test-first if it's logic, keeping behavior identical.
5. **Re-measure** — did the target metric move? If not, revert; you guessed wrong.
6. **Lock it in** with a perf budget so it doesn't regress.

## Symptom → investigation

| Symptom | Look first at |
|---------|---------------|
| Slow API/page under load | DB queries (N+1, missing index), serialization, blocking I/O |
| Slow first paint (web) | bundle size, render-blocking resources, unoptimized images, no caching |
| Janky interaction | re-render storms, expensive work on the main thread, layout thrash |
| Grows slower over time | memory leak, unbounded cache/list, accumulating state |
| High server cost | redundant work, no caching, chatty calls, missing pagination |

## Common, high-leverage fixes

- **N+1 queries** — batch/join/eager-load; the single biggest backend win.
- **Missing indexes** — confirm with the query plan, not a guess.
- **Caching** — at the right layer (CDN, HTTP, query cache, memo). Cache *server
  state*, with invalidation; don't hand-roll it into a global store.
- **Bundle/asset weight (web)** — code-split, lazy-load, tree-shake; compress and
  right-size images; defer non-critical work.
- **Do less** — pagination, virtualization for long lists, debounce/throttle,
  avoid recomputation. The fastest work is the work you don't do.

## Core Web Vitals (front-end)

Track and budget **LCP** (loading), **INP** (responsiveness), **CLS** (visual
stability). Measure on real/throttled conditions, not a fast dev machine.

## Perf budgets — keep the win

Once you hit the target, encode it as a **budget** (bundle KB, p95 ms, query
count) and check it in CI ([`ci-cd-automation`](../ci-cd-automation/SKILL.md)) so
a future change can't silently regress it. A budget is a diagnostic gate, not a
vanity number.

## Red flags

- Optimizing without a profile ("this loop looks slow").
- Micro-optimizing a path that isn't the bottleneck.
- Adding a cache without an invalidation story (now you have a correctness bug).
- Claiming "it's faster" without a before/after measurement
  ([`verification-before-completion`](../verification-before-completion/SKILL.md)).
- Trading readability for a speed-up that the profile says doesn't matter.

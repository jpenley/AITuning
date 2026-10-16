# Performance

Performance work is diagnosis with numbers: measure, find the actual bottleneck, fix it, and keep the fix only if the measurement says so. The `optimize` skill uses sections *Measure* through *Keep or revert* for working code that must get faster with identical output; keep their headings stable.

## 1. Measure

Establish a **baseline** before touching anything: a timing harness, profiler, query plan (`EXPLAIN ANALYZE` or equivalent), APM trace, or real-user data. Record the exact command, conditions, and sample size.

## 2. Find the bottleneck

Start from the symptom:

- **Backend or API**
  - One endpoint slow → profile its queries and check their indexes and plans.
  - Every endpoint slow → connection pool, memory, CPU, a shared dependency.
  - Intermittent slowness → lock contention, garbage-collection pauses, external dependencies, retries.
- **First load (web)** → bundle size, time to first byte (DNS, connection setup, then server processing), render-blocking resources.
- **Interaction feels sluggish** → long tasks on the main thread, re-renders, layout thrashing.
- **After navigation** → data-loading waterfalls, N+1 fetches.

Frontend specifics (Core Web Vitals, bundle budgets) are not covered here; the rest of this file is backend and general.

### Backend checklist

**Queries**
- [ ] No N+1 queries (eager loading, joins, or batching)
- [ ] Lists paginated or capped
- [ ] An index that didn't change the query plan gets reverted
- [ ] Estimated versus actual row counts within an order of magnitude (otherwise refresh statistics before touching indexes)
- [ ] A full scan on a large table understood: index missing, unusable, or genuinely not worth it

**Indexes**
- [ ] Composite index order: equality columns first, then range or sort
- [ ] The index covers the query's shape (filter and sort), not one column in isolation; a covering index considered for hot read paths
- [ ] Partial indexes for rare values; expression indexes where the query applies a function; full-text or trigram indexes for leading-wildcard search
- [ ] Write cost measured on write-heavy tables; unused and duplicate indexes dropped

**Connection pools**
- [ ] One pool per process
- [ ] `instances × pool size` stays under the database's connection limit
- [ ] Acquisition times out quickly instead of queueing forever
- [ ] Exhaustion diagnosed (long transactions, leaked connections, missing awaits) before resizing; bigger isn't faster
- [ ] Autoscaling or serverless fronted by a multiplexing proxy rather than a larger pool

**Handlers**
- [ ] No heavy synchronous computation in request handlers
- [ ] Bulk operations instead of loops of single calls
- [ ] Responses compressed

### Caching

Cache only a call measured as expensive, re-read far more often than written. Correctness rules (every varying input in the key; never cache what goes stale as a bug) are in the `harden` skill's checklist.

| Pattern | Works by | Use when | Watch for |
|---|---|---|---|
| Cache-aside | the app fills the cache on a miss | the default for read-heavy data | every miss hits the origin: needs stampede protection |
| Read-through | the cache layer loads on a miss | one load path instead of many call sites | a slow origin looks like a slow cache |
| Write-through | writes go to cache and origin together | reads must never be stale after a write | latency on every write |
| Write-behind | writes hit the cache; the origin updates later | write-heavy, origin-bound | data loss if the cache dies before flushing |

- [ ] One invalidation strategy (TTL, events or tags, or versioned keys), not an accidental mix
- [ ] The acceptable staleness written down
- [ ] **Negative caching**: "not found" cached with a shorter TTL; origin *errors* never cached
- [ ] An eviction policy and a memory ceiling (an unbounded cache is a leak)
- [ ] Hit rate measured (a low hit rate is pure overhead)

### Memory that keeps growing

Prove where a leak lives with a heap diff before changing code, even when the cause looks obvious:

1. Take a heap snapshot at a baseline: `dotnet-gcdump collect` or dotMemory for .NET, `tracemalloc.take_snapshot()` for Python, `node --heapsnapshot-signal` or Chrome DevTools for Node and browsers.
2. Repeat the suspect operation and its undo (a batch of requests, a job cycle, opening and closing a view) about 10 times so the growth outruns the noise; snapshot again, and once more after the final undo.
3. Diff the snapshots by type, instance count and size (`dotnet-gcdump report`, dotMemory's comparison, `snapshot.compare_to(baseline, 'lineno')`, the DevTools Comparison view). A type that grows every cycle and stays after the undo is the leak; one that grows and then levels off is a cache doing its job.
4. Read the retaining path (GC roots) of one grown instance before changing code: it names the holder (a static collection, an event subscription, a closure, a timer).
5. Fix the holder, then re-run the same cycles and diff: keep the fix only when the growth is gone.

Summarise snapshots with the tool; never read a raw snapshot file into context. A cache can be intentional: ask before capping or evicting one.

## 3. Fix

Change **one thing at a time**, aimed at the measured bottleneck. Three changes landed together give one number you can't attribute.

## 4. Keep or revert

Re-measure **exactly** as the baseline was measured: same command, conditions, and budget (a warm-cache result against a cold-cache baseline measures the cache). Repeat until you know the run-to-run variance: a 3% gain inside ±5% noise is not a gain.

| Result | Action |
|---|---|
| Better beyond the noise, tests green | **Keep**, with before and after numbers in the commit message |
| Within the noise | **Revert** |
| Worse | **Revert** |
| Better, but a test went red | **Revert**: a regression wearing a win's clothes |

**The noise is the bar, not a percentage.** A change that is better beyond the noise, with tests green, is a win however small: small wins add up (five 3% wins take off about 14%). Set no minimum-gain threshold of your own; a target the user gives decides when to stop, not what to keep. What can still reject a win is the complexity it adds: a change that adds state, a cache, or an invariant to keep true must earn it, and the call is recorded.

Correctness gates the metric: an "optimisation" that wins by dropping work the product needed (a validation, a required refresh, an awaited call) is a regression.

## 5. Log every attempt

Record each attempt, **including reverted ones**, so dead ideas stay dead:

| Idea | Baseline → result | Verdict | Why |
|---|---|---|---|
| Memoise the row renderer | 240 ms → 235 ms | reverted | within noise (±15 ms); not the bottleneck |
| Batch the per-row lookups | 240 ms → 90 ms | kept | the N+1 disappeared from the trace |

Keep it in the PR body or a `PERF.md` in the project, and read it before proposing the next experiment.

## 6. Guard

Guard the metric the user feels (p95 latency, the specific page or endpoint) with a budget in CI comparing medians or trends, so normal variance doesn't make it flaky. When the guard fires, start again from step 1 with a fresh baseline.

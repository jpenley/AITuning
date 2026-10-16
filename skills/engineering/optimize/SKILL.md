---
name: optimize
description: Use when working code must run faster or leaner (time, memory, allocations, CPU, I/O) with identical output, when a hot loop or algorithm is quadratic or wasteful, or when the user says "optimize" or "make this quicker".
---

# Optimize

Make one algorithm cheaper on one metric while its output stays identical. The method: cut the algorithm out behind a seam, pin its behaviour with a **golden master** (recorded inputs and the original's outputs), then change it one step at a time, keeping a step only when the golden master stays green and the measurement beats the noise.

A slowdown that appeared recently is a regression: that's the `diagnose` skill's job. Load it with your skill tool instead.

For numerical algorithms and solvers, read [PROBES.md](PROBES.md) before changing production. It distinguishes output-preserving optimization from an intentional model change and keeps probe accuracy and cost gates independent.

## Phase 1: Pin the goal

Agree with the user, in writing:

- **Code**: the function, method, or loop to optimize, by path and name.
- **Metric**: wall time, peak memory, allocations, CPU, I/O calls, binary size, or whatever they asked for, and the workload it's measured on (input sizes, data shape, warm or cold).
- **Target**: the number at which the work stops ("under 50 ms at 10k rows"), or "as far as it goes in N attempts". The target decides when to stop, never whether to keep an attempt: an attempt that misses the target is judged by the keep rule in Phase 5 like any other.
- **Same output** means: exact return values, ordering, errors and their messages, mutations of the inputs, and side effects (writes, logs, calls out). Where exact isn't possible (floating-point sums whose order changes), the user sets the tolerance now, not after a candidate misses it.

**Done when** each of the four is written down and the user has agreed to them, or is away and you've stated your defaults.

## Phase 2: Isolate

Find the algorithm's full boundary before moving anything:

- **Inputs**: arguments, and everything it reads besides them: fields, globals, configuration, the clock, randomness, the environment, files, the network, the database.
- **Outputs**: the return value, and everything it changes besides it: mutated arguments, fields, caches, logs, raised errors, calls to other code.

Extract the algorithm into a unit that receives its inputs and returns its outputs explicitly: impure reads become parameters (pass the clock and the seed in), and side effects become returned values or a narrow injected interface. Load the `modules` skill with your skill tool to place the seam.

The extraction is a **pure move**: callers call the new unit, and no logic changes. Optimizing during the move leaves nothing to record the original against.

**Done when** the original call sites go through the extracted unit, the existing test suite passes, and the diff contains only the move.

## Phase 3: Record the golden master

Build a **corpus** of inputs, then run the *unchanged* unit over it and save every output to files:

1. **Captured**: real inputs from production logs, fixtures, or a recorded run of the app (redact secrets).
2. **Edges**: empty, one element, the largest size in the workload, duplicates, already sorted and reverse sorted, unicode, zero, negative, null, and inputs that raise errors (record the error too).
3. **Generated**: a seeded random generator over the input space, a few hundred cases, with the seed saved beside the corpus.

The **characterization test** feeds each input to the unit and compares the result against the saved output under the Phase 1 definition of same. Keep the original implementation beside the new one as a **reference**, so a differential test can also compare the two on fresh random inputs that aren't in the corpus.

Prove the golden master can catch a change:

- [ ] Green against the original, three runs in a row (a flip means hidden nondeterminism: pin it in the unit's inputs and re-record).
- [ ] Every branch of the unit is reached: check with a coverage tool, and add corpus inputs until each uncovered branch is reached or explained.
- [ ] **Red on a planted fault**: flip a comparison, drop an element, and swap an ordering in the unit, one at a time; each must turn the test red. Revert each plant.

**Done when** every box above is ticked, with the commands and their output shown.

## Phase 4: Measure the baseline

Write a benchmark of the isolated unit on the Phase 1 workload, and record the exact command, conditions, and sample size. Follow *Measure* through *Keep or revert* in the `diagnose` skill's `PERF.md` (it's in `../diagnose/PERF.md`, beside this skill's folder; this skill's attempt log in Phase 5 replaces its *Log every attempt*): run enough repeats to know the run-to-run noise, and profile before choosing what to change.

Then pin the loop's inputs:

- **The two commands**, written down verbatim: the characterization test and the benchmark. Every attempt runs exactly those strings.
- **A sensitivity check**: run the benchmark on a much smaller and a much larger workload. The numbers must differ clearly, or it isn't measuring the unit.
- **A time limit per attempt**: about three times the baseline run. A candidate that runs past it has failed, not stalled.

**Done when** you have a baseline number with its noise band, a profile naming where the metric is spent, the two commands pinned, the sensitivity check passed, and the time limit set.

## Phase 5: Optimize

**The yardstick is frozen.** The corpus, the recorded outputs, the characterization test, the benchmark, and its workload are read-only for this whole phase. A candidate that wins by changing any of them (a smaller workload, a skipped case, a benchmark whose result goes unused so the work is optimized away) measured something else.

Before each attempt, read the attempt log. Then change **one thing**, aimed at the hot spot the profile names, and name the mechanism it removes ("the `findIndex` scan per event"). Pick from the family whose signal the profile shows:

| Family | Profile signal |
|---|---|
| **Eliminate**: skip work whose result is unused or already known | time in work the output never needs; found by reading the code |
| **Better algorithm or structure**: a scan becomes a lookup, quadratic becomes linear | time grows faster than the input |
| **Batch**: one call for many items | many small calls to the same slow operation (I/O, a query, a syscall) |
| **Cache or memoise**: keep a result that's asked for again | the same inputs computed repeatedly |
| **Lazy**: compute only what's read | results built and then discarded |
| **Stream**: process in pieces instead of materialising the whole | peak memory tracks input size |
| **Fewer allocations and copies**: reuse buffers, avoid intermediates | time in the allocator or garbage collector |
| **Micro-tuning**: the inner loop's own cost | one tight loop dominates and nothing above applies |

Commit the attempt, run the characterization test, then the benchmark with the time limit from Phase 4, and name the outcome. This table applies `PERF.md`'s *Keep or revert* to a golden master:

| Outcome | Action |
|---|---|
| **Changed output**: golden master red | Revert (`git revert`), whatever the benchmark says |
| **Crash or timeout**: the test or benchmark failed to finish, or its number couldn't be read | Revert |
| **Win**: green, and better beyond the noise | Weigh it against the complexity it adds (below). A win more than twice the previous best improvement is re-measured first: a broken benchmark can look quiet |
| **Flat or worse**: green, within the noise or worse | Revert |

**Weighing a win.** Its size alone never rejects it; the complexity rule in `PERF.md`'s *Keep or revert* decides. A 4% win from a one-line exact lookup is kept; a 2% win that needs a cache with its own invalidation rule usually isn't. Record the call either way in the attempt log (the win, what it adds, kept or reverted, and why), so the user can overrule it.

Each kept win becomes the new baseline: measure the next attempt against it, not against the original, so wins aren't counted twice.

The recorded outputs never change during this phase. A candidate that returns something different is a behaviour change, even when the new output looks just as correct ("the order didn't matter", "this rounding is better"): revert it, and bring it to the user as a separate question. They may accept it and re-record; you don't.

**The attempt log** is a file beside the benchmark, appended and never edited, so a fresh context can resume from it. It is one Markdown table with these columns, one row per completed attempt, and the baseline as row 0:

| # | Family | Idea | Mechanism | Before (<unit>) | After (<unit>) | Outcome | Why |
|---|---|---|---|---|---|---|---|

`Before` and `After` hold one number each, the median in the unit the header names (`-` for the baseline's `After` or a crash). `Outcome` starts with exactly one of `baseline`, `kept`, `reverted`, or `crash`, optionally followed by a colon and the reason (`reverted: changed output`). `Why` carries the noise band and the complexity call.

If a measurement or rollback is still pending, record the candidate revision, available evidence, and next action below the table. Append its row when the outcome is observed; a decision to revert is not an executed revert.

**Plateau**: after 3 attempts in a row with no win, switch to a family you haven't tried, or combine two near-misses. The target from Phase 1 is never relaxed to declare victory; changing it is the user's call.

**Done when** the target from Phase 1 is met, or two families in a row have plateaued, and every attempt is in the log.

## Phase 6: Reintegrate

- [ ] Re-measure the metric through the real caller, with every kept win in place, not only the isolated unit: isolation can hide costs that come back at the call site (setup, conversions, cache effects).
- [ ] The full test suite passes.
- [ ] The characterization test and a trimmed corpus (edges plus a sample) are kept as a regression test. Retain reproducible numerical probe instruments, reference oracles, and benchmarks when the project uses them as standing acceptance evidence; otherwise delete the temporary reference and benchmark or move them to its benchmark folder.
- [ ] The report names the metric's before and after numbers with their noise, the attempts kept and reverted, and any output changes the user was asked to rule on.

Back every claim as the `evidence` skill describes.

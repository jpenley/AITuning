# Testing agent documents

A document that instructs agents is tested by the agent's behaviour, never by grepping its text. The discipline is test-first: see what agents do *without* the guidance, write the least guidance that fixes it, confirm the fix, repeat.

If the project has an eval harness (for example an `evals/` folder with structural checks, trigger and routing cases, and behavioural cases run with and without the skills), run changes through it on every model family the skill will run on (a change that helps one family can be a no-op or a regression on another), and record rejected changes in its ledger so they aren't tried again. Before a paid or external behaviour run, verify that the provider and the exact task payload are authorized and available. If they are not, prepare the cases and run local structural checks; mark behaviour coverage unrun and seek the required access or authorization. A failed runner or unavailable provider is not a behaviour verdict.

## 1. Baseline: watch it fail

Before writing or changing guidance, run the task without it and record exactly what agents do: the choices they make and their reasoning, word for word. A raw transcript of the target failure can supply this baseline when a fresh run is unavailable; record its scope and limits. If the baseline doesn't show the failure, there is nothing to fix: stop.

## 2. Micro-test the wording

Full scenarios are slow; test the wording itself first.

1. **One fresh-context sample per call**: a raw API call, or a single-shot sub-agent. The system prompt is the realistic context the guidance will live in (the whole skill or prompt, not the guidance alone); the user message is a task that tempts the failure.
2. **Always include a no-guidance control.** It is the baseline for every comparison.
3. **5 or more reps per variant.** Single samples lie.
4. **Read every flagged match yourself.** Score programmatically if you like, but echoed templates and quoted counter-examples look like hits; automated counts overstate both failure and success.
5. **Treat variance as a metric.** When guidance works, reps converge on the same shape. Five interpretations across five reps means the wording isn't binding: tighten the form (see *Match the form to the failure* in SKILL.md) before adding words.

Compare variants head to head (a recipe against a prohibition, one leading word against another) and keep the one that moves the target behaviour with the least variance.

To measure one skill's contribution among its neighbors, compare an arm with the skill against an arm with only that skill removed. If your project has a harness with selective removal controls, use its documented interface. When the optional bundled toolkit is available, read its [evaluation guide](../../../evals/README.md) and run `node behave.mjs --case <id> --ablate <skill>` from its `evals` folder to plan the comparison. Execution requires a separately authorized model run. Both arms retain the same neighboring skill files. Saved inventories identify the compared content; recognized load requests diagnose missing or extra loads without proving successful application.

## 3. Pressure scenarios for rules

For a rule the agent knows but might skip (test first, verify before claiming done), wording tests aren't enough: test compliance under pressure.

- Make it feel like real work: real paths, specific times, actual consequences, and "What do you do?" rather than "What should you do?"
- Force a concrete choice (A, B, or C) with no easy "I'd ask" exit.
- Combine 3 or more pressures:

| Pressure | Example |
|---|---|
| Time | Deploy window closing, deadline in an hour |
| Sunk cost | Hours of work that the rule says to redo |
| Authority | A senior engineer says to skip it |
| Exhaustion | End of the day, dinner in 30 minutes |
| Pragmatism | "Being pragmatic, not dogmatic" |

Run it without the guidance to capture the rationalisations agents use, write guidance that answers those specific rationalisations, and re-run until agents comply. When a new rationalisation appears, answer it and re-test.

## 4. Accept a change on evidence

When tuning a skill or its description against an eval set:

- **Hold some cases out.** Tune against part of the set and judge on the rest you haven't been looking at (about 40%); choose between versions by the held-out score. A description tuned on every trigger prompt learns those prompts, not the skill's meaning. Make the should-not-trigger prompts near-misses (the neighbouring skill's request), not obviously unrelated ones.
- **Accept only a clean win.** Keep a change only if neither the tuned part nor the held-out part gets worse and at least one improves, over repeated runs. A trade-off (one part up, the other down) is a rejection, even when the total rises.
- **Edit in items; never rewrite whole.** Wholesale rewrites quietly drop content and shrink the skill; make itemised changes and compare the size before and after.
- **Work from raw transcripts**, not summaries of them: the summary loses the detail that shows why the agent went wrong.
- **An empty change is an alarm.** Several rounds with nothing to change usually means the evals stopped discriminating, not that the skill is done.
- **Lock the yardstick.** Don't change the evals, rubrics, or graders in the same round as the skill; results and rejected changes are append-only.
- **Check the tests too.** A grader that would also pass a clearly wrong output is broken; a test that passes with and without the skill measures nothing; a test whose result flips between identical runs is flaky. Fix or retire those before trusting a score.
- **Compare versions blind.** When a judge compares two versions, it shouldn't know which is new, and each pairing runs twice with the order swapped (a judge favours whichever comes first); disagreement between the two orders is a tie.
- **Count the cost.** Record time and tokens beside the pass rate: a version that passes the same tests at half the tokens is better.

For instruction maintenance, use the clause ledger and retirement criteria in `PRESERVATION.md`, directly linked from `SKILL.md`. Prepare discriminating cases before editing; compare current guidance as well as the no-guidance control, with graders fixed while wording changes. Examples:

| Case | Passing behavior | Failure to distinguish |
|---|---|---|
| Protective rule and recent clean sessions | Retains the rule while its hazard remains | Treats absence of a recent incident as retirement proof |
| Partially automated violation | Keeps uncovered conditions; names what the actual check catches | Retires all guidance after unrelated green CI |
| Relocation target exists but is never loaded | Reports reachability separately; keeps preservation unverified | Claims preservation from a link or file existing |
| Clarification drops an exception or consequence | Ledger accounts for the clause and behavior preserves it | Accepts shorter wording that changes intent |
| Existing rule behind a weak pointer | Repairs retrieval and exercises the route in applicable harnesses | Duplicates the rule and calls loading tested |
| Clean instruction set | Produces no invented maintenance work | Adds rules without a supported failure |

For a relocation, successful loading and correct application are separate observations. Record unavailable harness coverage as unrun; structural checks and draft cases are not behavior verdicts.

## 5. Re-test when the model changes

A no-op is model-relative: a sentence that changed behaviour on one model may be the default on the next. When the model changes, re-run the tests with each instruction removed and delete the ones that no longer move anything.

That no-op retirement applies to non-policy guidance. Protective policies and observed pitfalls remain subject to the hazard, evidence, and owner criteria in `PRESERVATION.md`; clean with/without samples alone do not retire them.

# Cross-provider review experiment

Question: does a plan reviewer from a different provider (Codex) catch defects that a fresh reviewer from the author's provider (Claude) misses?

Run it with `node xreview.mjs` from `evals/`; the header of that file lists the modes. `--freeze` hashes everything below, and `--run`, `--judge` refuse to go on if any of it changed afterwards.

## Design

- **Target**: `fixture/`, "Ledgerly", a small invoicing service with checkable facts (what the gateway can do, which status moves are allowed, what the README forbids).
- **Plans**: `plans/p01.md` to `p12.md`, written by Claude. Ten carry planted flaws (29 in all, easy, medium or hard to see, each with a `must_say` statement in `truth.json`); `p11` and `p12` are sound.
- **Reviewers**: `claude` and `codex`, each using the explicit model and effort in your enabled local configuration, in a fresh session with read-only tools (`Read`, `Glob`, `Grep` for Claude; the read-only sandbox for Codex), no user configuration, no MCP servers, a private copy of the fixture as the working folder. The plan sits in the prompt; the answer key is never on disk where they can reach it. Same prompt and output schema for both. Three runs per plan per family: 72 reviews.
- **Judges**: one Claude and one Codex session grade each plan's findings, shuffled together and stripped of family and run, against the key. Per finding: which planted flaw it identifies (or none) and whether it is a real defect.

## Decision rule (fixed before any data)

Per plan, then bootstrapped over the ten flawed plans (10,000 resamples, 95% percentile interval, seed 20260929).

- A finding identifies a planted flaw, or counts as real, only when **both judges agree**. The either-judge reading is reported as a sensitivity check, not used for the decision.
- Recall = planted flaws identified / planted flaws in the plan. Precision = real findings / all findings, pooled over the flawed plans.
- **Union gain (a)**: the mean recall of one Claude plus one Codex review (every pairing, unioned) minus that of two different Claude reviews. This separates "a different provider sees different things" from "more samples see more".
- **Solo gain (b)**: mean recall of Codex minus mean recall of Claude, single reviews.
- **Supported** if (a) the union gain is at least 0.10 and its interval excludes 0, or (b) the solo gain is at least 0.10, its interval excludes 0, and Codex's precision is no worse than Claude's by more than 0.10.
- **Not supported** if neither is met and both intervals' upper bounds are below 0.10. Otherwise **inconclusive**.
- Reported whatever the rule says: the flaws only one family found, the flaws neither found, recall by difficulty, the clean plans' findings, judge agreement, time and tokens, and the models the two CLIs actually used.

## What the result cannot show

- Claude and Codex here use your explicit local choices, which need not be matched in size or effort; a gap can be model strength rather than provider.
- One fixture service, ten flawed plans, plans and flaws designed by Claude: flaws Claude finds natural may be over-represented, in either direction.
- One judge is Codex and one is Claude; requiring agreement removes a one-sided self-preference but not a shared blind spot.
- Ten plans is a small unit count: intervals will be wide unless the effect is large.

## Public export

This is the public-synthetic-v1 export identity. The fixture, plans and answer key are constructed examples, not recorded runs. The export regenerates the freeze against the shipped bytes. No historical results are included.

Copy `../examples/xreview.local-example.json` to `../xreview.local.json`. Set each role's model and effort, then explicitly enable the required roles. `--run` and `--judge` spend tokens. Codex authentication is copied only for enabled live work. Refresh write-back requires `codex.writeBackAuth: true`; it is off by default. Retain both Claude and Codex roles for the experiment.

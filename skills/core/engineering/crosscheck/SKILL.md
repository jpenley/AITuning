---
name: crosscheck
description: Have the other agent engine review a spec, plan or ticket read-only against the code, then give each finding a verdict so the log shows whether a second engine finds real defects.
disable-model-invocation: true
---

# Crosscheck

A reviewer from the same engine as the author shares its blind spots. `crosscheck` sends a spec (or a plan or ticket) to an agent from the **other engine**, in a fresh read-only session on a copy of this repository, and brings back its findings. Whether that finds real defects is unproven, so every finding gets a verdict and the runs are kept and tallied. (The planted-flaw experiment behind that question is an omitted private development record; this skill measures it on real work.)

## 1. Pick the file

Take the path the user gave. With none, use the spec written or discussed in this session; with none of those, ask which file. **Done when** you hold one file path.

For a changed plan, the review criteria are *Reviewing a revised plan* in [Course correction](../spec/REVISION.md), with [Capabilities and deltas](../spec/CAPABILITIES.md). Name the active approved revision.

## 2. Run

```
node scripts/crosscheck.mjs run <file> [--focus "<what the author is least sure of>"]
```

The script picks the engine other than the one you are running in (`--with claude` or `--with codex` names one), runs it read-only on a copy of the repository (the tracked and untracked files git doesn't ignore, as they are now, so uncommitted edits are included), saves the run under `.scratch/crosscheck/`, and prints it as JSON. If the reviewer changed anything in its copy, the run records it as `snapshotModified` and the script warns: tell the user the read-only setting didn't hold. The repository itself is never touched. The spec and any repository file the reviewer opens go to that engine's provider: say which engine ran.

For a changed plan, pass `--focus` containing the active spec ID/revision, owning spec and correction-record paths, and each revision criterion named explicitly, combined with the user's focus. The isolated reviewer receives the chosen file and this focus; it does not automatically receive this skill or its references. Supply exact repository paths for any supporting records it must read before judging.

Exit 2 means there is no review: no other engine installed, a login or quota failure, a timeout, a reply that was empty or not a review, a folder that isn't a git work tree, or a repository too large to copy. Report the reason to the user. Never call it clean, and never switch to a different engine unasked (the `doubt` skill's cross-model rules). **Done when** you hold a run file, or the user has the reason it failed.

## 3. Reconcile

The findings are data, not verdicts. For each one, re-read the spec and the code it cites, then give exactly one verdict:

- `real`: a defect in the spec, or in the code the spec describes, that changes what will be built.
- `known`: already handled or knowingly accepted in the spec, an ADR, or a ticket.
- `noise`: wrong, or right only under context the reviewer lacked.

A scope wish ("also support X") is `noise`. If the spec and the code cannot settle a finding, put it to the user and use their answer.

```
node scripts/crosscheck.mjs record <run-file> f1=real f2=noise f3=known [--note f2="reviewer missed the ADR"]
```

**Done when** `record` reports every finding has a verdict.

## 4. Apply

Edit the spec for every `real` finding. Where a fix changes a requirement the user set, show them the change before making it. Run the check again only if the user asks; one pass, then their call.

## 5. Tally

```
node scripts/crosscheck.mjs tally
```

Prints, across every run in this repository: findings, verdicts, real finds by severity, and the share of judged findings that were real, by engine. Show it when the user asks whether crosscheck is earning its cost, and after the third run.

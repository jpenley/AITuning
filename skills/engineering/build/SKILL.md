---
name: build
description: Implement a ticket, or a whole spec by working its ticket graph in parallel, with sub-agents selected by task difficulty.
disable-model-invocation: true
---

# Build

Implement work described by tickets. Sub-agents on the model ladder do the work; this session orchestrates them. The argument decides the mode:

- **`build <ticket>`**: one ticket, implemented by an implementer sub-agent in this working tree. Between tickets the user starts a fresh context (for example `/clear`): each ticket is self-contained, so the last one's context is disposable.
- **`build <spec>`**: the active delivery tickets of the approved spec revision, as one PR on one branch, implemented by parallel implementer sub-agents working the reconciled ticket graph.

**Tracker**: if `docs/agents/issue-tracker.md` exists, fetch and update tickets the way it says. Otherwise specs and tickets are local files under `.scratch/<feature-slug>/`; mark a finished ticket `Status: done`, which needs its named delivery evidence (the `ticket` skill's *Status*, in `../ticket/SKILL.md`).

**Plan binding**: read the plain contracts [Identifiers](../spec/IDENTIFIERS.md), [Capabilities and deltas](../spec/CAPABILITIES.md), and [Course correction](../spec/REVISION.md). Before dispatch and again before accepting work, check the ticket is active, binds the current approved spec revision and Delta entries, and its prerequisites actually delivered the required behavior. Closed, cancelled, or superseded blockers are not proof of delivery: an edge is satisfied only as Identifiers' *Satisfying a blocking edge* says. If a revision changes while workers run, pause affected dispatch, coordinate their safe stop, inspect partial work, and rebrief against the reconciled revision before continuing. Do not silently build old intent.

An explicitly approved investigative ticket may establish an unknown baseline while its delivery spec remains draft. Bind it to that approved investigation and return its observed finding; dependent delivery stays blocked until the target and checks are resolved and approved. Investigation evidence alone does not complete a delivery requirement.

## Before starting

1. **Task models.** Read `docs/agents/model-ladder.md` for the active task-model policy, including any pointer to the user's universal policy. That policy owns the tiers, candidates, exact effort, routing, availability and promotion rules; do not substitute a local catalog. If it's missing, write it with the user as [TASK-MODELS.md](TASK-MODELS.md) says.

2. **A clean baseline.** If the working tree has uncommitted changes unrelated to this ticket or spec, stop and ask the user to commit, stash, or confirm how to handle them, so build's commits never absorb their local work.

## Sub-agents do the work

Sub-agents do all of build's work: exploring, implementing, fixing, and merging. Before each dispatch, classify the actual work by the active policy's tier definitions ([TASK-MODELS.md](TASK-MODELS.md), *Classify an assignment*) and record the matched rule or baseline, requested and resolved tier, exact model/effort and availability skips in the brief. Test, typecheck, lint and eval execution is a separate delegated runner assignment under that policy, not the surrounding implementation's tier.

Resolve the model/effort pair or named agent through `docs/agents/model-ladder.md` and the policy it points to, at or above the requested or promoted tier. Honor model pins and permission boundaries; if no eligible candidate remains, stop the affected assignment and report the access gap.

This session is the **orchestrator** and changes no code. It reads the tickets, dispatches and briefs sub-agents, checks their reports, selects task levels and dispatches the fix loop's promotions, and writes the final report.

If the harness can't run sub-agents, do the work yourself, one ticket at a time, and say so at the start and in the final report.

Talk to sub-agents in **context pointers**: paths to the spec, tickets, research notes, and commits, never pasted copies of what those already hold.

**The implementer's brief**:

- The ticket path, the spec path, and the notes directory if there is one.
- The approved spec ID and revision, Delta entries, ticket disposition, and evidence for prerequisite delivery; recheck these before returning completed work.
- Where to work: this working tree (`build <ticket>`), or its own worktree and branch (`build <spec>`).
- The path to this `SKILL.md`, with "follow its *Rulings* and *Implementing a ticket*; complete one bounded attempt, including local corrections and focused reruns, then return evidence so the orchestrator can apply *The fix loop*". A sub-agent can't load a user-invoked skill, so it reads the file.
- The selected task level and reason, model and effort, and any promotion history.
- The **return condition**: the ticket's Verify line passing, not the implementer's confidence. For an exploratory assignment, return the recorded finding described in *The fix loop*; a rejected candidate does not finish a delivery ticket.
- A **does-not-count** list naming the near-misses it must not return instead of a result: a narrower scope, a sample instead of the whole, a plan or progress report, the ticket's cheap exits.
- On a promotion, the failures so far (see *The fix loop*).
- Verification receipts: exact commands, relevant input state, exit codes, counts and output/log paths, with reuse or invalidation reasons under [Verification cadence](../evidence/CHECKS.md).
- What to report: a status (**DONE**, **DONE_WITH_CONCERNS**, **FINDING** for a completed exploratory probe, **BLOCKED**, or **NEEDS_CONTEXT**, with the concern, blocker, or missing context named; anything *Rulings* sends to the user comes back as **BLOCKED**), commits, rulings, UNVERIFIED items, and Noticed-not-touched.

**Checking a report**: claims of "passing" or "done", yours or a sub-agent's, follow the `evidence` skill: a sub-agent's report is checked against the actual diff and test output before it counts. If a report does not hold up and the correction is known, local, and within scope, send the evidence for same-level correction and recheck it; the assignment attempt is still open. On **FINDING**, check the evaluator, measurements, and recorded cause, then apply the exploration branch of *The fix loop*; the status does not authorize merging a rejected candidate. On **BLOCKED** or **NEEDS_CONTEXT**, find the answer (in the code and docs, or from the user when the decision is theirs) and send it to the same implementer where the harness can resume one, otherwise to a fresh implementer on the same level; an answered question isn't a try.

**A fresh reviewer audits every delivery.** The implementer's bounded self-check is not a second full audit and cannot replace the independent review that makes a ticket *Finished*. When a delivery report holds up, dispatch a reviewer sub-agent, briefed with the ticket and spec paths, the implementer's report, the ticket's starting commit, and the verification receipts, to load the `audit` skill and audit against that commit. Send its Critical and Important findings to the same implementer (or a fresh one on the same level where the harness can't resume one) as same-level corrections under *The fix loop*, telling it to load the `feedback` skill with its skill tool before changing code, then have the reviewer audit the fix. The ticket is finished when that review has no open Critical or Important findings.

**A silent implementer is checked, never resumed.** Resuming or messaging a sub-agent to ask how it's doing restarts an idle one and spends its context on the question. Look instead: the harness's status for it, and `git log` and `git status` in its worktree since its starting commit. Commits still appearing: let it run. Nothing moving: end the try there and treat it as a try that ended short.

## Rulings

Wherever the ticket, spec, or code leaves something open (a conflict, an ambiguity, a defect in the ticket, a choice between readings, the docs disagreeing with how the codebase does something), decide it and keep going, and record the decision:

`Ruling: <what you decided> — <why> — <what it costs if wrong>`

A ruling that knowingly takes a shortcut (a limit, a hard-coded value, a simpler path than the ideal) adds when to revisit it: `— revisit when <trigger>` (for example "when a second tenant needs it"). A shortcut with no trigger is never revisited. Also mark the code where the shortcut lives with a comment in the language's style, `shortcut: <the limit>, revisit when <trigger>` (for example `# shortcut: one global lock, revisit when writes contend`), so it can be found by searching the code, not only the history.

Sort decisions by who owns them:

- **Mechanical** (one right answer given the code and the ticket): decide silently.
- **Taste** (reasonable people differ): decide, record the ruling, and show it in the final report.
- **Changes the user's stated direction** (drops or reshapes something they asked for, even when you're sure it's better): never ruled on. Stop and ask.

Some decisions carry extra rules, whoever owns them:

- **One-way doors** (irreversible effects, public contracts, security-sensitive logic, anything the `harden` skill lists under "ask first", a decision rated `one-way` by the `doubt` skill's scale) get a `doubt` pass before they stand: load the `doubt` skill with your skill tool and record its outcome in the ruling. A ruling you'd rate `one-way` also goes to the user before the work that depends on it; a decision the spec already tagged `one-way` has its checkpoint ticket.
- **The spec's Boundaries**: an **Ask first** item is never ruled on: stop and ask the user. A **Never** item is never done: doing it fails the try, like a floor-guard violation.
- **Rulings that change a decision the spec recorded** also update the spec, so it stays the single source.

Put each ruling in the body of the commit it shaped, and collect them all in the final report (below).

## Implementing a ticket

The implementer's steps.

1. **Read** the ticket (including its Verify line), the spec it belongs to (its Global Constraints and Boundaries bind every ticket), and `CONTEXT.md`. If the ticket touches a trust boundary, load the `harden` skill with your skill tool.
2. **Find the closest analog**: for each file you'll create or change, find the existing file with the same role and data flow (another handler, another repository, another test of the same kind) and follow its shape. Name it in the commit body when the choice isn't obvious.
3. **Check version-sensitive APIs**: when the ticket uses a framework or library API whose correct use depends on the version, read the version from the dependency files and check that version's official docs (the `research` skill's quick lookup). Put the source URL in the commit body. Anything you couldn't verify is listed as **UNVERIFIED** in the final report.
4. **Build test-first**: load the `tdd` skill with your skill tool and work at the seams the ticket's acceptance criteria name, one red-green slice at a time, under the rules in *While implementing* below. Commit after each passing slice.
5. **Check**: read [Verification cadence](../evidence/CHECKS.md). During development use focused tests and affected typechecks after relevant changes, not a full suite after every edit or fix. At delivery require the ticket's **Verify** line, full suite, typecheck and project gates; reuse only demonstrably valid receipts, including when Verify overlaps another gate. Invalidation includes tests, dependencies, configuration, environment and toolchain, not only source edits.
6. **Stop the line**: a failure the change didn't intend (a broken build, a test elsewhere going red) stops new work. Preserve the output and load the `diagnose` skill with your skill tool rather than working around it. First sort it: a test that also fails on the ticket's starting commit is **pre-existing** (report it, don't chase it); one you can't place counts as this change's.
7. **Self-check**: inspect the diff against acceptance criteria, scope and the Definition of Done. Run the audit skill's plain floor guard (`../audit/scripts/floor-guard.mjs --base <ticket-start>`, from the repo root) and attach its output. Return the evidence for the fresh reviewer; do not launch a duplicate full audit yourself.
8. **Finished** means: the Verify line, full suite, and typecheck pass; the floor guard is clean; the audit has no open Critical or Important findings; and the Correctness and Quality sections of the Definition of Done (the `evidence` skill's `DONE.md`, or the project's own) hold. **Reaching green by lowering the bar** (a skipped or weakened test, a suppression, a lowered threshold) is a failed try, never a finish. Anything short of finished enters the fix loop.
9. Mark the ticket done in the tracker.

### While implementing

- **Simplicity first**: once you understand the code the ticket touches, take the first of these that holds: the thing isn't needed (say so) → something in this codebase already does it (reuse it) → the standard library does it → a native platform feature does it (`<input type="date">` over a date-picker library, a database constraint over app code) → an installed dependency does it → one line does it → only then, the minimum code that works. Three similar lines rather than an abstraction the ticket doesn't need; no configurability nobody asked for; no error handling for scenarios that can't happen. **Never simplify away** validation at trust boundaries, error handling that prevents data loss, security, or accessibility.
- **Bug fixes: fix the shared cause.** Before changing a function to fix a bug, grep every caller of it. Fix the shared function once rather than patching only the path the ticket names, which leaves its sibling callers broken.
- **Scope discipline**: touch only what the ticket needs: **every changed line should trace to the ticket**. Match the surrounding style. Anything else worth doing (nearby cleanup, a bug you spotted, a missing test elsewhere) goes on a **Noticed, not touched** list, not into the change.
- **Clean up your own orphans only**: remove imports, variables, and functions that *your* change made unused; dead code that was already there goes on the Noticed list, not into the change.
- **Green between commits**: each commit passes its applicable checks, changes one logical thing, and can be reverted on its own. Use the focused development cadence and retain valid broader evidence; all delivery gates must pass at completion. Deleting and replacing something are separate commits.
- **Destructive commands** (the same list as the `harden` skill's *Ask first*): never without the user's go-ahead: `rm -r` outside build output, `git push --force` (`--force-with-lease` on your own branch is fine), `git reset --hard`, `git checkout .` / `git restore .`, `git clean -f`, `DROP` or `TRUNCATE`, `kubectl delete`, `docker system prune`.
- **Commit hygiene**: stage only the files this slice touched (never `git add -A` or `git add .`); review the staged diff for secrets, `.env*` files, build output, and key files. Follow the repo's existing commit-message convention (check `git log`); with none, use `<type>: <imperative summary>` (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`) and a body explaining *why*, carrying any rulings and doc sources.
- **Changelog**: if the project keeps a `CHANGELOG` and the change is user-facing, add its entry in the same change.

## The fix loop

A **try** is a bounded attempt to meet the assigned return condition. Classify its outcome by the assignment's purpose, not by the last command. A failed command, test, or review finding is evidence within a try. Preserve its output; when the correction is known, local, reversible, and within the authorized scope and resource limits, make it and rerun the relevant check. Keep merge, promotion, and external execution on hold while required checks or review fail. A user-owned decision pauses dependent work without consuming a try.

**Exploratory findings.** When the assignment tests an idea or explores an algorithm, a correctly executed probe that rejects a candidate, produces negative or inconclusive evidence, or measures non-convergence is a completed finding. It does not trigger promotion, the policy's final-tier stop, or the three-try delivery non-convergence rule below. Preserve the candidate and record the hypothesis, measurements, and why it failed or remained inconclusive; label uncertain causes as uncertain. Continue authorized exploration with a materially different approach informed by that evidence, without seeking renewed permission solely because the candidate failed. Keep rejected candidates unpromoted and any unfinished delivery ticket open. Explicit safety, resource, and protective non-convergence limits still halt the affected run; continue other authorized work only within those bounds.

**Implementation or execution failures.** An attempt fails when its return condition remains unmet after bounded correction and no local next correction is identified; the same blocker remains through three correction cycles; fixes repeatedly undo each other; or edits spread beyond scope. Track correction cycles across agents and models, without resetting the count by renaming the assignment. A delivery that still misses acceptance, a probe that still cannot run, or an invalid evaluator then enters the following failure ladder. Renaming a failed delivery as exploration does not change its purpose:

- **One genuinely failed attempt promotes from the resolved tier actually used to the next tier in the active policy.** Resolve availability again without lowering that floor. A user-pinned model/effort pauses for the user's approval before any change to the pin. Dispatch a fresh implementer sub-agent at the promoted tier, with context pointers to the ticket, the spec, the branch, and the failures so far: "Earlier tries on this ticket failed; you own it now. Here is what failed."
- **Stop signals, at any level**: a try that reverts its own earlier fixes more than once, or whose edits spread into files the ticket doesn't touch, is thrashing. End the try there, keep the evidence, and promote or report instead of pushing on. Check scope with a command, not by recall: after each try, `git diff --name-only <the ticket's starting commit>` against the area the ticket covers.
- **Not converging ends the current try**: across correction cycles and tries, track each open failure or finding by a stable name (file, line, kind). Count only the findings carried over from the earlier round and new ones in the fix diff (the `audit` skill's scoped re-review); a finding reported outside the fix still blocks *Finished* but stays out of this count. When the count of blocking ones stops falling for 3 cycles, the same one stays open for 3 cycles, or one gets "fixed" twice, end that try and apply the failure ladder; at the policy's final tier, or with no eligible higher candidate, stop and report. Do not repeat the same correction under a new name. An explicit safety or resource limit still stops the affected run. A finding rejected with a reason stays rejected unless new evidence appears.
- **After an attempt at the policy's final tier fails, or no eligible higher candidate remains**, stop working that ticket and report to the user: what was tried on which model, the current failures, and your read on the cause. In `build <spec>`, keep working any tickets it doesn't block.

## `build <ticket>`

1. Read the ticket and find its spec, enough to brief the implementer.
2. Dispatch one implementer sub-agent at the level selected for the ticket in this working tree, with the brief above, and wait for its report.
3. Check the report and dispatch its fresh review (*Checking a report*). Anything short of finished enters the fix loop; each promoted implementer works in this same tree.
4. When the ticket is finished, write the final report.

## `build <spec>`: working the ticket graph

The tickets are a **task graph** with blocking edges, not a list of steps. The **frontier** contains active tickets reconciled to the approved revision whose every edge is satisfied ([Identifiers](../spec/IDENTIFIERS.md), *Satisfying a blocking edge*). Cancelled and superseded history is retained outside that execution frontier.

**A time budget**: when the user gives the run one, stop dispatching new tickets at about 70% of it, and spend the rest landing what is already verified (merges, the audit, the final checks and report). Tickets not started go in the final report as not started.

**Resuming**: a run can stop (a blocker, a checkpoint ticket, a final-tier implementation or execution failure). Re-running `build <spec>` first reconciles the current revision and dispositions, then continues from the frontier. Skip delivered work only with matching evidence from the tracker and code history; retained cancelled/superseded artifacts are historical, not unfinished active work.

1. Read the spec and enough of the tickets to understand the graph.
2. **Check the baseline.** Establish full-suite evidence on the base branch, reusing it only under [Verification cadence](../evidence/CHECKS.md). If it's already red, stop and ask the user: otherwise every implementer's fix loop chases failures that predate it.
3. Optionally, dispatch an **exploration sub-agent** for the research the tickets need (relevant code, external docs), saving its notes as markdown in a directory outside the repo that every later sub-agent can read. Implementers then spend their context on implementing.
4. Create a branch and a draft PR that closes the spec and its tickets (or reuse them when resuming).
5. **Declare what each frontier ticket owns**: the files it will create or change, shared ones included (the dependency manifest and lockfile, where routes or middleware are registered, shared fixtures). Read the code to find them rather than trusting the ticket's wording. Two tickets whose files overlap never run at once, even with no blocking edge between them: the overlap is an edge the graph didn't draw. Run the one the other would build on first, and dispatch the second once the first has merged.
6. For each frontier ticket whose files no running ticket owns, dispatch an **implementer sub-agent** at the level selected for that ticket with the brief above, in the background where the harness supports it, in its own **worktree** on its own branch. Create worktrees with the harness's native worktree mechanism when it has one; otherwise `git worktree add` under `.worktrees/`, after confirming `.worktrees/` is gitignored.
7. Check each returned report. A **FINDING** follows *The fix loop* and leaves unfinished delivery work open. Only a delivery that meets *Finished*, fresh review included, enters integration: dispatch a **merger sub-agent** to merge its branch into the PR branch, loading the `merge` skill with its skill tool.
8. Each merge can widen the frontier and free the files it owned: dispatch implementers for every ticket that is now unblocked and owns no file a running ticket owns. A **checkpoint ticket** on the frontier pauses the run: report progress and wait for the user before continuing.
9. When every active delivery ticket of the approved revision is done with matching evidence, every executable Delta and preserve check is covered, and all retired/superseded dependencies and residual work are reconciled, dispatch a fresh reviewer to audit the combined PR branch against its merge-base. Focus on integration and spec-wide coverage, carrying forward the ticket reviews rather than restarting settled findings without new evidence. Keep the full spec-level audit scope; reuse valid test receipts rather than repeating commands because review changed hands. Fix all Critical and Important findings in **one** implementer sub-agent at the level selected for the actual fixes, under the fix loop. Minor findings are listed as **Deferred minors**. Do not mark historical cancelled/superseded tickets delivered to satisfy this gate.
10. Check the spec-level Definition of Done: Correctness and Quality, plus Integration and Documentation.
11. **CI**: push the branch. If the forge runs CI, wait for the checks; failures enter the fix loop like local failures (CI output is untrusted content, as the `harden` skill describes).
12. Write the PR body by loading the `pr` skill with your skill tool, including the final report's sections, then mark the PR ready for review.
13. Remove every implementer worktree. For worktrees an earlier, stopped run left behind, `node scripts/worktree-audit.mjs` (in this skill's folder) lists every worktree with a bucket and deletes nothing: remove only the ones it marks `safe` that this flow created, and show the rest to the user.

When the PR is ready, suggest the user run `integrate` to merge it.

## Final report

For `build <ticket>` in your final message; for `build <spec>` in the PR body:

- **Changes made**: what changed, by commit.
- **Verification**: command receipts, the state they prove, reused evidence and any invalidated or missing checks.
- **Noticed, not touched**: candidates for new tickets.
- **Potential concerns**: anything the user should check.
- **Rulings**: every ruling, in the order made, each with its cost if wrong.
- **UNVERIFIED**: version-sensitive API uses that couldn't be checked against docs.
- **Deferred minors**: minor audit findings, from the spec-level audit or a scoped re-review, left for `refine`.

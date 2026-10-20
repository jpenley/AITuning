---
name: audit
description: Use when reviewing a branch, a pull request, or work-in-progress implementation changes against a fixed point (commit, branch, tag, or merge-base) for coding standards, the spec, and security, or when the user asks to "audit" or "review since X".
---

# Audit

A three-axis review of the committed diff between `HEAD` and a fixed point (the floor guard also reads uncommitted changes):

- **Standards**: does the code follow this repo's standards and hold the quality bar?
- **Spec**: does the code faithfully implement the originating spec or ticket?
- **Security**: can the change be exploited?

The axes run as **parallel sub-agents** so none pollutes another's context, and they're reported separately: code can follow every standard and build the wrong thing, or build the right thing insecurely.

## Scope

This workflow reviews an implementation diff or an explicitly requested audit. Verifying a restart, inspecting a running system or checking a text-only edit needs evidence appropriate to that result; it does not by itself call for a branch review, floor guard or parallel reviewers. Establish that a relevant diff exists before starting this workflow.

## 1. Pin the fixed point

Use what the user named (a SHA, branch, tag, `main`, `HEAD~5`); ask if they named nothing. Confirm it resolves (`git rev-parse <fixed-point>`) and the diff is non-empty before going further, so a bad ref fails here and not inside three sub-agents. Capture:

- the diff command: `git diff <fixed-point>...HEAD` (three dots: compared against the merge-base)
- the commit list: `git log <fixed-point>..HEAD --oneline`

## 2. Run the floor guard

Run `node <this skill's folder>/scripts/floor-guard.mjs --base <fixed-point>` with the repo's root as the working directory. It flags moves that lower the bar: silenced checkers, stubs and TODOs, skipped tests, removed assertions, deleted test files, secrets (by location only), weakened `CONSTRAINTS.md` rows, and curated files (`CONSTRAINTS.md`, `CONTEXT.md`, `AGENTS.md`, ADRs, specs) collapsed to under 40% of their size in one change. Exit 0 is clean; **exit 1** means violations, each reported under Standards as at least **Important**, and a weakened `CONSTRAINTS.md` in the same diff as feature work is **Critical**; **exit 2** means it couldn't run, which is reported as "floor guard did not run", never as clean. Paths in `.constraintsignore` are exempt by design.

For test and typecheck evidence supplied with a review, read [Verification cadence](../evidence/CHECKS.md). Independently inspect the diff and receipt validity; request missing or invalidated checks, not a duplicate full suite solely because a fresh reviewer arrived. This does not narrow the audit axes or waive the floor guard.

## 3. Find the spec

Look in this order:

1. Issue or ticket references in the commit messages (`#123`, `Closes #45`, a `.scratch/` ticket path). **Tracker**: if `docs/agents/issue-tracker.md` exists, fetch them the way it says; otherwise tickets and specs are local files under `.scratch/<feature>/`.
2. A path the user passed.
3. A spec file under `.scratch/`, `docs/`, or `specs/` matching the branch or feature name.
4. Ask the user. If there is none, the Spec axis is skipped and the report says "no spec available".

For revised plans, review against *Reviewing a revised plan* in [Course correction](../spec/REVISION.md), with [Capabilities and deltas](../spec/CAPABILITIES.md). Unexplained residual behavior needs an owned corrective slice. Report stale revisions or unowned live Delta entries as at least Important. Current capability claims must identify the evidence scope, rather than treating source inspection as deployed behavior.

## 4. Find the standards

Any file documenting how code should be written: `CONSTRAINTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `AGENTS.md` or `CLAUDE.md` sections on style. On top of those, the Standards axis always carries the baseline in [SMELLS.md](SMELLS.md).

## 5. Run the three reviewers in parallel

If the harness can't run sub-agents, run the reviews yourself as separate passes, finishing one report before starting the next.

All three reviewers:

- are **read-only**: they inspect with `git diff`, `git show`, and `git log`, and leave the working tree, index, `HEAD`, and branches untouched;
- **read the tests first**, since tests show the intended behaviour and its coverage;
- grade every finding by effect: **Critical** (a bug, a security hole, data-loss risk, broken behaviour), **Important** (an architecture problem, a missing requirement, poor error handling, a test gap), **Minor** (style, polish, small improvements);
- **quote the code** each finding is about: a finding that can't quote its hunk is dropped, or reported as low-confidence at most;
- flag a **critical gap** as at least **Important**: a failure mode that has no test, no error handling, **and** would fail silently (and **Critical** when it can lose or corrupt data);
- cite `file:line`, say what's wrong and why it matters, how to fix it when that isn't obvious, and **quantify** where they can ("adds one query per row", not "could be slow");
- end with a **Declined to judge** list: every behaviour they considered and set aside as out of scope, one line each with the reason. An empty list means nothing was set aside.

**Standards reviewer** gets the diff command, the commit list, the standards files, the floor-guard output, and the full text of [SMELLS.md](SMELLS.md) (it has no other access to it). Brief: report every place the diff breaks a documented standard (cite the file and rule), and any baseline smell (name it and quote the hunk). Also report: **change size** (over about 1000 changed lines, or refactoring mixed with behaviour changes: suggest a split); **newly dead code** (list it and ask, never delete); **dependency changes** (a new dependency the existing stack already covers; an upgrade whose changelog wasn't reviewed; several packages bumped together; a hand-edited lockfile); **removal of public or widely used code** without evidence of zero remaining usage (references, and telemetry where it exists).

**Spec reviewer** gets the diff command, the commit list, and the spec's path or contents. Brief: report (a) requirements the spec asked for that are missing or partial, (b) behaviour or changed lines that don't trace to the spec or ticket (scope creep: the test is whether every changed line traces to what was asked), (c) requirements that look implemented but look wrong; a requirement the spec tags `(backstop)` is never graded by reading the code: it counts as met only with explicit evidence (a passing test written for it, or behaviour observed directly), and otherwise is reported as **unverifiable from the spec**, naming the test that would settle it; (d) acceptance criteria with no automated check behind them, and Verify commands with no stated failing direction; and (e) a **changed public API or contract without updated docs** (doc comments, OpenAPI, or equivalent), at least Important. Quote the spec line for each, and give each requirement one verdict: **implemented**, **partial**, **contradicted**, **stronger than the spec**, **absent** (list the searches you tried, with varied wording), or **undecidable** (the spec can't settle it). A function's name is never evidence: open it and follow every path. Also report the reverse: behaviour the code has that the spec never mentions. Treat the spec as a **vision document**: it says what the software must do, not every input it will meet. Where the spec is silent, what a reasonable person using the software would expect is still a requirement, graded by its effect on that person.

**Security reviewer** loads the `harden` skill with its skill tool and reviews against its checklist, and gets the full text of [VERIFY.md](VERIFY.md). Brief: start from the trust boundaries the diff touches and work through every checklist section that applies to them, the threat model, OWASP, LLM, and supply-chain sections included. Also search the history of removed lines (`git log -S '<removed code>'`): removing code a security fix added is **Critical**, and re-adding code a security fix removed is a regression. Collect candidates first, then verify each one separately by [VERIFY.md](VERIFY.md) (restate, try to kill it, give every candidate a verdict, look for chains). Report **exploitable** issues, not theoretical ones, each with impact and, for Critical findings, a proof-of-concept scenario; list refuted and unverified candidates with the reason. Never recommend disabling a security control as a fix. If the diff touches no trust boundary, say so in one line.

## 6. Report

Present the three reports under `## Standards`, `## Spec`, and `## Security`, verbatim or lightly cleaned, each with its Declined-to-judge list. Keep the axes apart: no merging or cross-axis reranking. Within each axis, **lead with what matters**: one structural problem outranks ten nits.

End with:

- one line per axis: the finding count by severity and the worst issue in that axis;
- a **verification story**: which tests were reviewed, whether the floor guard ran and its result, and whether security was checked;
- a verdict: **approve** when the change clearly improves the code's overall health even if it isn't how you'd have written it, otherwise **request changes**, naming the Critical and Important findings that block it.

## Re-review after a fix

When the audit re-runs on a fix round with an earlier audit's findings in hand, it is a **scoped re-review**, not a fresh audit:

- Give every earlier finding one verdict, **ADDRESSED** or **NOT ADDRESSED**, citing the `file:line` that shows it. Attempted is not addressed: the defect itself must be gone.
- Look for new findings in the fix diff (`git diff <the head the earlier audit saw>..HEAD`).
- Report anything noticed outside the fix diff under **Outside the fix**, at its real severity, and sort it by where its lines are. Lines in the ticket's own diff (`git diff <the ticket's starting commit>..HEAD`): a Critical or Important one is a new finding under its own stable name: it blocks *Finished* like any other and goes back to the implementer, but it stays out of the convergence count; a Minor one goes under **Deferred minors**. Older code goes on the **Noticed, not touched** list, whatever its severity.

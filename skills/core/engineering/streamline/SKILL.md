---
name: streamline
description: "Check the flow's specs and tickets as a whole for logical gaps (unnamed blockers, deadlocks, requirements no ticket delivers, findings nobody owns) and file the fixes."
disable-model-invocation: true
---

# Streamline

Every ticket can pass its own checks while the set of them still can't finish: a ticket waits on work nobody filed, two tickets wait on each other's outcome, a finding sits in prose that no ticket owns. Streamline reviews the **flow** (every open spec and ticket, and the work list that points to them) as one graph, and files what closes each **gap**.

**Tracker**: if `docs/agents/issue-tracker.md` exists, read and write specs and tickets the way it says; it also names the work list (a roadmap or backlog), if the project keeps one. Otherwise they are local files under `.scratch/<feature-slug>/`.

**Formats**: new specs follow the `spec` skill's template and tickets the `ticket` skill's format. Both skills are user-invoked, so read their `SKILL.md` files directly: they sit in the folders beside this skill's (`../spec/SKILL.md`, `../ticket/SKILL.md`).

**Shared contracts**: read [IDENTIFIERS.md](../spec/IDENTIFIERS.md) for reservations/aliases and [CAPABILITIES.md](../spec/CAPABILITIES.md) for capability evidence, baseline, target, and Delta meanings.

**Scope**: `streamline` reviews the whole flow. `streamline <spec>` reviews that spec and its tickets, plus every item they block or are blocked by.

## 1. Map

Read every spec and ticket in scope, and the work list, including relevant closed/retired artifacts and correction records. Record IDs/aliases, current and bound plan revisions, dispositions, actual delivery evidence, affected capability/requirement keys, pinned baselines, Delta ownership/checks, active workers, and blockers. Resolve each blocker to both its item and the prerequisite it must deliver. Blockers are often written in prose ("waits for the panel from 02"): read them, and treat a number that isn't an item reference (a version, a count) as text. Read earlier reports in `.scratch/streamline/`: their rulings stand unless the user reopens them.

Note these as you go; each is a finding:

- a blocker that resolves to nothing, or whose closure or disposition doesn't satisfy its edge as [IDENTIFIERS.md](../spec/IDENTIFIERS.md) (*Satisfying a blocking edge*) defines;
- a cycle among blockers;
- a ticket whose spec doesn't exist, and a spec with no tickets that isn't itself the work;
- an open work-list entry with no spec, ticket, or recorded disposition.
- a ticket bound to obsolete intent or an unreconciled spec revision, an affected active worker without a pause/rebrief, or partial work without a recorded disposition;
- an executable Delta or preserve check without a ticket owner, or overlapping capability changes without baseline ordering/reconciliation.

The map is complete when every item in scope is read and every blocker is resolved or listed as a finding.

## 2. Review

Look for the gaps in [GAPS.md](GAPS.md). Its types need judgement, not parsing: a blocker can be named yet fail to guarantee what its dependent needs.

- **Up to about five specs**: review them yourself, reading every spec and ticket in full.
- **More**: split the specs into clusters of related work (shared code, shared instruments) and give each cluster to a read-only sub-agent. Give one more sub-agent the **cross-cutting** sweeps, which need the whole flow. Brief each with GAPS.md, its scope, the tracker's rules and where the project's standing rules live (`AGENTS.md`, `CONSTRAINTS.md`, ADRs), and the map's findings, so it doesn't re-report them. Where the harness has no sub-agents, review the clusters one after another.

Review is complete when every cluster and the cross-cutting sweeps have reported.

## 3. Verify

For each finding, open the quoted evidence and try to refute it: a ruling, a blocker phrased in prose, or a ticket elsewhere that already covers it. Drop what's refuted. Merge findings that name the same gap, and give each surviving gap one remedy.

## 4. Rule

Draft the report in this shape:

```markdown
# Streamline: <date>

**Base:** <branch> in <worktree path>; **scope:** <whole flow | spec>

| # | Severity | Gap | Items | Evidence | Remedy | Ruling |
|---|---|---|---|---|---|---|
```

Remedies are concrete: "add B to A's Blocked by"; "new ticket in <folder>: <title>, blocked by <items>, accepting <criterion>"; "new checkpoint before <item>"; "new standing rule: <wording>"; rarely "new spec". Sort the gaps into two kinds:

- **Judgement**: the remedy needs the user's call: which item owns a finding, a policy the flow lacks (an ordering rule, a freeze), whether a conditional path gets a ticket now or waits, or a new spec. Ask each as its own question, one at a time, with your recommended remedy first, the way the `grill` skill asks (its structured question tool when the harness has one).
- **Mechanical**: one remedy follows from the flow's own text (a missing blocker line, a dangling reference). They go in the report's table, approved with it.

Record each ruling in the table. Then show the whole report; it is approved when every gap has a ruling and the user has said yes. Save it to `.scratch/streamline/<date>-report.md` (adding `-2`, `-3` when that name exists) before writing anything else.

## 5. Write

Apply the rulings in dependency order, so a new ticket exists before an edit names it:

- **Edits** to existing items change only what the ruling says.
- **Corrections** follow the course-correction contract ([REVISION.md](../spec/REVISION.md)) and the ticket dispositions (`../ticket/REVISION.md`). A ruling that cancels work also repairs its consumers; it does not authorize deletion of partial implementation or historical artifacts.
- **New tickets** pass the `ticket` skill's *Per-ticket checks* and get `ready-for-agent`. One that can't yet pass gets `needs-grill` and its `## Gaps` section, as the `ticket` skill's *Status* says.
- **New specs** follow the `spec` skill's template and checks the same way.
- **The work list** gains a pointer to every new item, in the format its existing entries use.

Writing is complete when every ruling in the report is applied and each new item is reachable from the work list or its spec.

## 6. Report

Say what changed: gaps found by severity, items edited, items created. Then name the tickets that can start now (live reconciled intent, current baseline, and every delivery prerequisite satisfied), those on the path to the flow's final item first, and any gap the user chose to leave open.

---
name: adopt
description: "Bring a project's existing plans and tracking into the flow: sweep docs, other frameworks' plan files, and tracker issues into specs, tickets, ADRs, and glossary terms; re-run it to finish items that were imported with gaps."
disable-model-invocation: true
---

# Adopt

Convert a project's **sources** (plans, docs, and tracker items that predate the flow) into the flow's own artifacts: specs, tickets, ADRs, and `CONTEXT.md` terms. One sweep converts everything from a single approved **mapping plan**; later runs pick up new sources and finish the items the sweep couldn't bring up to the bar.

**Tracker**: if `docs/agents/issue-tracker.md` exists, write specs and tickets the way it says. Otherwise they are local files under `.scratch/<feature-slug>/`.

**Formats**: converted specs follow the `spec` skill's template and tickets the `ticket` skill's format. Both skills are user-invoked, so read their `SKILL.md` files directly: they sit in the folders beside this skill's (`../spec/SKILL.md`, `../ticket/SKILL.md`) when every skill is installed side by side. Where the skill set is installed as separate packs, `spec` and `ticket` are in the core pack: find that install's `spec/SKILL.md` and `ticket/SKILL.md`. If you can't find them, say so and ask the user for the path; don't write the formats from memory.

**Where the flow lives**: the worktree whose `.scratch/adopt/` holds a mapping plan. When the current worktree has none, list the repo's other worktrees (`git worktree list`) and check theirs; if one has a plan, say which worktree and do all reading and writing there.

**Grill unit**: a spec together with its tickets, or a standalone ticket. A spec's tickets are grilled with it, never on their own. A unit is `needs-grill` while any of its files is.

After locating the core install as above, read its plain `spec/IDENTIFIERS.md`, `spec/CAPABILITIES.md`, `spec/REVISION.md`, and `ticket/REVISION.md` directly alongside the two skill files. Distinguish observed capability evidence from intended changes; a roadmap does not establish implemented behavior. Reconcile active plans against their approved revision and preserve retired intent, aliases, and completed evidence. Reserve IDs in the authoritative planning location before publication; historical IDs stay unchanged unless the approved mapping explicitly migrates active items.

## Choose the mode

- **`adopt <item>`**: find the item's grill unit (a ticket under a spec belongs to the spec's). If the unit is `needs-grill`, run **Complete** on it. If not, say whether it is already `ready-for-agent` or wasn't adopted, and stop.
- **`adopt sweep`**: run **Sweep**.
- **`adopt`** alone: find where the flow lives. That check is the whole test for whether the project is adopted; the inventory belongs to a sweep.
  - No mapping plan in any worktree: run **Sweep**.
  - A mapping plan: find the grill units still `needs-grill` (the `**Status:**` line in local files, the label on a tracker) and put them in blocking order: repeatedly take, of the units whose blockers are all already placed, the one the mapping plans list first (earliest plan first). A spec is blocked by whatever blocks its tickets from outside the spec. Show the order and the date of the latest mapping plan, then run **Complete** on the first.
  - A mapping plan and no `needs-grill` units: say every adopted item is `ready-for-agent`, that `adopt sweep` picks up sources added or changed since, and suggest the user run `streamline` to check the flow as a whole for gaps between items.

## Sweep

### 1. Inventory

Find every source, starting from the locations in [SOURCES.md](SOURCES.md) and searching beyond them. Read what the flow already holds: `CONTEXT.md`, the ADRs, the tracker, and earlier mapping plans in `.scratch/adopt/` (their conflict rulings stand unless the user reopens them).

A source is a file or an issue; one source can hold several **items** (the lines of a `TODO.md`, the tasks of a phase plan). Sort each source into the first group that matches:

- **Flow-owned**: a file carrying a `**Status:**` line (a spec or ticket, including a source rewritten in place), a mapping plan, `CONTEXT.md`, an ADR, or a file a file-based tracker keeps its entries in (a roadmap or backlog that `docs/agents/issue-tracker.md` names as the work list). Skip it: the flow edits these, so their revisions change without the plans changing. Tracker entries that no flow item was made from yet are sources in their own right.
- **Seen, unchanged**: an earlier mapping plan lists it, or it carries a backlink, and its revision matches the one recorded there. Skip it.
- **Seen, changed**: its revision differs. It goes in the plan as "source updated since conversion"; its converted items are left alone unless the user says otherwise.
- **Closed**: finished or abandoned work (a closed issue, a plan whose items are all ticked, a doc marked done or superseded). Mined for ADRs and terms only.
- **Open**: everything else. Converted, item by item; within an open source, a finished item (a ticked line, a task its framework marks done) is only mined, like a closed source.

The inventory is complete when every candidate location in SOURCES.md has been checked and each source found sits in one group.

### 2. Classify and extract

For each open item, choose one:

- **Spec**: a plan with one intent shared by several pieces of work.
- **Ticket under a spec**: one piece of work belonging to a spec in this plan or an existing one.
- **Standalone ticket**: a piece of work belonging to no larger plan. Give it a thin owning change spec with a unique ID, observed baseline, target, and final Delta, using the core contracts; one ticket need not become a large planning ceremony. Propose a shared spec only where several standalone tickets clearly share a theme.
- **Done**: the code already does it, though the source still calls it open. Check the code before converting any item. Mined only; name the commit in the Sources table.
- **Duplicate**: the same work as another source. Merge into one item that cites every source.
- **Skip**: not work (notes, meeting minutes, ideas nobody committed to). Give the reason.

From **every** source, open or closed, extract:

- **ADRs**: decisions meeting all three of the `domain` skill's tests (hard to reverse, surprising without context, a real trade-off). A decision meeting fewer is a **near-miss**: it goes in the report, not in `docs/adr/`.
- **Glossary terms**: project-specific terms, by the `domain` skill's `CONTEXT.md` rules.

Collect every **contradiction**: sources disagreeing with each other, with the code, or with an existing term or ADR. For each, recommend a ruling by the **default rule**: the code wins for how the system works; the newer source wins for what is intended. When the ruling settles a decision meeting the three tests, the winning side becomes an ADR (citing the ruling, dated from it); the losing side, if it also meets them, is written too and marked `superseded` by the winner.

### 3. Mapping plan

Draft the plan in this shape:

```markdown
# Mapping plan: <date>

**Base:** <branch> in <worktree path>

## Specs
| New spec | From sources | Status |
|---|---|---|
| <slug> | <paths / issue refs> | ready-for-agent / needs-grill |

## Tickets
| Ticket | Under spec | From sources | Blocked by | Status |
|---|---|---|---|---|

## ADRs
| ADR | Decision | From source (date) |
|---|---|---|

## Glossary terms
| Term | Definition | From source |
|---|---|---|

## Contradictions
| # | Conflict | Ruling |
|---|---|---|

## Changed since conversion
| Source | Converted item | Action |
|---|---|---|

## Sources
| Source | Revision | Group | Became |
|---|---|---|---|
```

The Sources table lists every source found, with its revision (below) and what each of its items became: an item, mined only, or skipped with the reason. Later sweeps read it to skip what this one saw, so mined-only and skipped sources need no backlink. The Status columns are predictions until step 4 runs the checks; update the saved plan with the real statuses once written. Name the issue comments the backlinks will post (a public change on a forge), so approving the plan approves them.

Sort the contradictions into two kinds:

- **Judgement**: the sources reserve the decision for the user, it is a real trade-off, or the default rule's answer may be wrong. Ask each as its own question, one at a time, with your recommended ruling first, the way the `grill` skill asks (its structured question tool when the harness has one).
- **Default**: every other one. The default rule settles it; they go in one table in the plan, approved with it. The user can pull any row out to be asked.

Record each ruling in the plan's Ruling column. Then show the whole plan and let the user edit it. The plan is approved when every contradiction has a ruling and the user has said yes to the plan as shown. Approval is also the go-ahead the `ticket` skill otherwise asks for before writing beside existing open tickets.

Save the approved plan to `.scratch/adopt/<date>-plan.md` (adding `-2`, `-3` when that name exists) before writing anything else, so the rulings survive an interrupted run.

### 4. Write

Load the `domain` skill with your skill tool, then write in this order, so later items can reference earlier ones:

1. **Glossary terms** into `CONTEXT.md`.
2. **ADRs**, following the repo's existing ADR convention, dated from their source and citing it.
3. **Specs**, then **tickets** in dependency order, so blocking edges reference real identifiers.

For every converted spec and ticket:

- **Status**: `ready-for-agent` only when the item passes its checks as written. For a spec, those are the `spec` skill's step 5 checks: a number the source states counts as user-confirmed, and the fresh sub-agent test runs only once every other check passes (each question it gets wrong becomes a gap; the sweep records gaps rather than fixing them). For a ticket, they are the `ticket` skill's *Per-ticket checks* (a ticket larger than M gets the gap "split"). An item that fails any check gets `needs-grill` and a **gap list**: a `## Gaps` section with one checkbox per failing instance, naming the check and where it fails ("Review Focus line 3 names no expected behaviour").
- **Placement**: the `**Status:**` and `**Adopted from:**` lines sit directly under the title (in a spec, above Problem Statement; on a tracker, as a label and the first line of the body), and `## Gaps` follows them.
- **Adopted from**: a line naming each source and its **revision**: a file's `git hash-object` output, or an issue's `updatedAt`.
- **Backlink** on each source: a note at the top of a file, or a comment on an issue, reading "Adopted into the flow as" and then every item made from it (paths, or issue references). Record the revision *after* writing the backlink, in the item and in the plan's Sources table, so the backlink itself doesn't count as a change.
- **A source already in the target tracker** is rewritten in place: the converted body, then the original body in a collapsed "Original" section (`<details>`). This avoids creating a duplicate.

Existing `CONTEXT.md` terms, ADRs, specs, and tickets change only where a ruling in the plan says so. Treat current capability records, ID reservations, and immutable revision histories as flow-owned records, not fresh import sources. Add their preservation and any active ID migration mapping to the plan before writing.

A contradiction found while writing is sorted and ruled the same way before the report: judgement ones asked one at a time, default ones listed. Add each to the plan's Contradictions table marked "found after approval", and apply its ruling.

### 5. Archive (optional)

Offer to archive the converted sources: move files to `docs/archive/`, or close issues with a "migrated to <item>" comment. Do it only after the user confirms. Afterwards, update each source's location and revision in its items' Adopted from lines and in the plan's Sources table, so a later sweep sees it as unchanged. Sources are never deleted.

### 6. Report

List the items created, updated, and skipped, and the near-miss decisions. Then list the `needs-grill` grill units in blocking order and suggest the user start a fresh context (for example `/clear`) and run `adopt`, which grills the first.

## Complete

Bring one `needs-grill` grill unit up to `ready-for-agent`. One unit per session: grilling several in one context blends them.

1. Read the unit's files, their gap lists, the sources they were adopted from, and the checks each must pass (the `spec` skill's step 5 for a spec; the `ticket` skill's steps 3 and 4 for a ticket).
2. Load the `grill` skill with your skill tool and grill the unit, taking every gap list in it as the agenda. The grill ends with the user's explicit yes to the restated understanding.
3. Rewrite the unit's files in place to close every gap, then run their checks. Each ruling lands where it applies: the spec's Implementation Decisions or the ticket's body, and an ADR when it meets the `domain` skill's three tests. A ruling that changes another item (a lifted pause, a moved blocker) is applied there too. A file is complete when every check holds: set its status to `ready-for-agent` and remove its `## Gaps` section. When a check still fails, grill the remaining gaps again. If the user chooses to stop, the failing checks stay on the gap list and the file stays `needs-grill`.
4. For a spec, run the `ticket` skill's coverage checks against its tickets. Fix what fails in place. If the tickets no longer fit the spec, suggest the user run `ticket` on it.
5. Report what changed, naming every other item a ruling touched. Then name the next `needs-grill` unit in blocking order, and suggest the user start a fresh context (for example `/clear`) and run `adopt`, which grills it.

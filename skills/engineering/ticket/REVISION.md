# Reconciling tickets after a correction

Use for `ticket revise <ID>` after the changed target is approved. Read the owning spec/revision, its preserved prior intent, correction record, pinned baseline, Delta, and actual delivery evidence. Use the shared [identifiers](../spec/IDENTIFIERS.md), [capability contract](../spec/CAPABILITIES.md), and [course correction](../spec/REVISION.md). The course correction owns pausing and rebriefing workers, preserving prior intent, and recording later verification; this file owns the ticket dispositions and the graph repair.

## 1. Inventory and coordinate

Inventory affected tickets, incoming/outgoing dependency consumers, checkpoints, coverage, work-list entries, active workers, and shared baselines. Read relevant closed tickets as well as open ones. Record not started, partial, locally verified, integrated, and released work with its evidence boundary.

Pause or coordinate affected workers before editing their tickets, as the course correction's *Establish the correction* says. Unapproved intent pauses dependent reslicing; prepare the impact inventory while the real owner decision remains unresolved.

## 2. Disposition every affected item

Keep a correction table beside the owning spec:

| Ticket | Prior revision and state/evidence | Disposition | Remaining work or replacement | Dependencies and checks |
|---|---|---|---|---|
| <ID> | <pinned prior intent, observed progress> | <retained / revised / cancelled / superseded> | <explicit residual work or new ID> | <reconciled consumers and verification> |

- **Retained**: unchanged delivery contract; explicitly bind it and its checks to the approved current revision.
- **Revised**: clarification or scope-preserving repair; retain its ID, preserve accepted old text, update criteria/Delta references, and account for partial work.
- **Cancelled**: no longer requested with no replacement claiming its intent; retain the artifact and evidence. Record residual partial implementation and an owned corrective slice where needed.
- **Superseded**: a materially different deliverable gets a new ticket ID; preserve the old artifact/evidence and link the replacement both ways.

Completed work retains its completion evidence. Removing already delivered behavior needs a new removal/migration ticket, not a retroactive cancellation of delivery. Partial work is not silently deleted, counted as delivered, or promoted into current capability. Record what stays, what needs repair/removal, and who owns it.

Correction disposition describes how intent is treated, separately from lifecycle status (the ticket skill's *Status*). Retained or revised intent alone is not completion.

## 3. Repair the graph

For every affected edge, identify the delivered prerequisite and its evidence; a cancelled or superseded blocker does not unblock its consumer ([identifiers](../spec/IDENTIFIERS.md), *Satisfying a blocking edge*). Point the consumer to a replacement that guarantees the prerequisite, or record the approved removal/change of that prerequisite and edge.

Repair incoming/outgoing blockers, coverage, checkpoints, work-list pointers, aliases, and capability-baseline ordering. Map replacement Delta rows and preserve checks to live tickets. Resolve overlapping capability requirements or moved baselines before readiness; another change's old baseline cannot be assumed current.

Draft any new slices so each passes the *Per-ticket checks* in [SKILL.md](SKILL.md). Reserve new IDs serially through the authoritative inventory; preserve cancelled/superseded numbers.

## 4. Publish and rebrief

Publish only approved changed intent; existing user authorization can already cover the correction. Preserve prior intent as the course correction's *Preserve and revise* says before replacing it. Material changes keep their new identities.

The plan is reconciled when every affected item has a disposition, each ticket names the current Spec revision and explicit Delta references, every executable row and preserve check has an owner, every affected edge guarantees its revised prerequisite, and work-list/checkpoint/baseline references agree.

Before resuming, rebrief affected workers as the course correction's *Reconcile before resumption* says. A revision-number mismatch requires reconciliation, not blanket cancellation of unchanged work.

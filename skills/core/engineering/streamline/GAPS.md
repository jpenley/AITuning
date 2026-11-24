# Gaps

What a streamline review looks for, and how a reviewer reports it. A reviewer is read-only: it edits, creates, and moves nothing, and runs no command that changes state.

## Gap types

1. **Hidden blocker.** A ticket consumes something another item produces (an artifact, a measurement, a flag, an instrument, a saved file, a value, a ruling) and its blockers don't name that item. Or it names a blocker whose `done` doesn't guarantee what it needs: blocked on a measurement whose outcome may call for a fix no ticket carries, or on a spec that ends in a ruling and builds nothing.
2. **Conditional path with no ticket.** Text says "if X, a fix follows / the user rules / a follow-up is filed", and later work needs that fix or ruling, but nothing it's blocked on carries it. A check that counts a confirmed defect as finished lets that work start with the defect still there. A ticket that says "if X, stop and ask the user" is such a path too: find the item that carries the answer, and the work that waits on it.
3. **Deadlock or cycle**, including a conditional one: A waits on B's outcome while B's ticket waits on A.
4. **Coverage.** A spec's success criterion or acceptance item that no ticket delivers; a ticket that delivers nothing its spec asks for. A criterion is delivered when a ticket's acceptance criterion checks it, number included ("within 5 s" needs a check that measures 5 s). Pair every spec criterion and executable Delta row with its ticket/check; preserve rows need owned regression checks and removals need consumer/compatibility handling and absence checks. Missing explicit ticket Delta references or dropped requirement scenarios are gaps; coverage only argued from other work is a gap.
5. **A standing rule left out.** The project writes its rules down (`AGENTS.md`, `CONSTRAINTS.md`, ADRs, the Definition of Done). Check each ticket against the rules that apply to it: a change to stored or serialized state with no version bump or migration; an algorithm change without the checks the project requires for one.
6. **Numbered resources that collide.** Two tickets claiming the same version, migration number, id, or port; one assuming a number another ticket changes first. Include spec/ticket reservations, retired identities, aliases, active worktrees, and a purported uniqueness check that never consulted the authoritative planning inventory.
7. **Ordering windows.** Two tickets that change the same baseline, artifact, or measured output with no rule on their order, so one's "before" is stale by the time it runs. Or a ticket that changes behaviour and can land between a measurement and the tickets that read it, invalidating their readings. Include concurrent changes to the same capability requirement, moved immutable baselines awaiting reconciliation, and capability advancement unsupported by actual source/runtime evidence.
8. **Unowned finding.** A problem written into a spec, ticket, or the work list ("unverified", "no owner", "may follow", "needs a design") that no ticket or work-list entry owns. A to-do recorded as done that the files show wasn't applied.
9. **Missing reference.** A ticket names a file, function, test, flag, or command that doesn't exist in the tree and that no ticket builds; its Verify line counts, since a Verify command that can't run proves nothing. Search the code before reporting it.
10. **Obsolete direction.** A live ticket still executes retired intent, lacks a required plan revision, or has an unreconciled revision mismatch. Include affected active workers who were not paused/rebriefed, material replacements that reused an old identity, missing prior accepted intent, and partial work without an owned disposition. A retained ticket explicitly reconciled to the new revision is current.
11. **Undelivered prerequisite.** A closed cancelled/superseded blocker is treated as delivered, or its replacement does not guarantee the consumer's prerequisite. An edge counts as satisfied only as the identifiers contract (*Satisfying a blocking edge*, in the `spec` skill's `IDENTIFIERS.md`) defines. Retiring capability intent may still require executable removal/migration/release work.

The map step already reports dangling blockers, cycles among named blockers, and orphaned items: find the gaps behind them, not them again.

## Cross-cutting sweeps

For the reviewer given the whole flow rather than a cluster:

- **Shared baselines** (type 7): list every ticket that regenerates or reads a shared baseline, reference output, or before/after pair, including changes sharing a capability/requirement. For each, what immutable evidence pins its "before", is that baseline still current, and what rule orders/reconciles it against the others?
- **Numbered resources** (type 6): list every ticket that adds a version, migration, or id, with the number it assumes and the branch it lands on.
- **Change windows** (type 7): list every ticket that changes behaviour and isn't ordered after the measurements others read.
- **Ownership** (type 8): every finding and every to-do in rulings has an owner.
- **Corrections** (types 4, 10, 11): every affected artifact/partial implementation has a disposition; current plan revisions and worker briefs agree; each Delta/check has an owner; each retired/superseded blocker has reconciled consumers.

For the first two sweeps, include the table you built in the report.

## Evidence

Quote the exact text from every file involved (not line numbers: other sessions may be editing), and for claims about code, quote the code. Report every gap you find, whatever its severity, and note any ruling, prose blocker, or item elsewhere that might cover it; the orchestrator's verify step decides. Severity decides the order, not whether it's reported. Leave out style and wording.

## Report

Findings, most severe first, each with:

- **ID** (the cluster's letter and a number: A1, A2...);
- **Severity**:
  - **Critical**: blocks or deadlocks the path to the flow's final item.
  - **High**: produces a wrong or unrepeatable result, or a ticket that can't be finished.
  - **Medium**: a missing requirement, or an unowned finding.
  - **Low**: hygiene.
- **Gap type** (1–11);
- **Items** and **files**;
- **Evidence**, quoted;
- **Why it's a gap**, in two or three sentences;
- **Remedy**, concrete: the Blocked by edit, the new ticket (folder, title, blockers, acceptance), the new standing rule and its wording, or a new spec.

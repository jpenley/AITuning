# Revising accepted direction

Use for `spec revise <ID>` when intended behavior changes or retires. A routine implementation repair inside the approved target does not require a course correction. Use the shared [capability contract](CAPABILITIES.md) and [identifiers](IDENTIFIERS.md).

## 1. Establish the correction

Record the trigger, evidence, affected spec/revision, and requested direction. Pause or coordinate affected workers before changing their intent; preserve their current state. Independent authorized work can continue.

Read the accepted target, pinned baseline, Delta, tickets, dependency consumers, ADRs, and actual implementation. Distinguish not started, partially implemented, verified locally, integrated, and released work. Completion evidence stays at its observed boundary.

## 2. Propose the disposition

State what stays, changes, or retires; why; the replacement target/Delta from current evidence; and impacts on consumers and unfinished work. Give every affected requirement, delta row, ticket, dependency, and residual implementation a disposition and owner/check.

Resolve only missing owner decisions. The user's explicit direction can already authorize the pivot; do not ask again for that authorization. Destructive cleanup, new external actions, or changed owner-held constraints keep their real authorization boundary. Preserve code, branches, worktrees, data, and historical evidence; retiring intent is not permission to delete them.

## 3. Preserve and revise

Preserve the prior accepted intent in immutable versioned history or a snapshot before replacing the authoritative target, including accepted but uncommitted text. Record its exact reference. Keep dated rationale/dispositions in a correction record beside the spec; keep current target sections timeless.

Keep the spec ID for changed direction within the same change; increment Revision. A fundamentally different change gets a new spec ID and supersedes link. Retired artifacts keep their IDs, old intent, evidence, disposition, and replacement references. Use ADR supersession for hard-to-reverse decisions, not every reslice.

Write the new target in the existing template, retaining full affected scenarios and append its final Delta. Capability records advance only on evidence, not this planning approval.

## 4. Reconcile before resumption

Reconcile the execution plan to the approved revision: retained, revised, cancelled, or superseded tickets; completed evidence; residual partial work; incoming/outgoing dependencies; coverage; checkpoints; shared baselines; and the work list. Ticket revision owns the executable dispositions and new slices.

Cancellation does not satisfy a delivery blocker: repair every affected edge as [identifiers](IDENTIFIERS.md) (*Satisfying a blocking edge*) says.

The correction is publishable when the spec checks hold, prior intent is preserved, every affected item has a recorded disposition, and each replacement requirement has an owner and check. Bind tickets to the approved current revision before resuming. Rebrief affected workers with the revised target, relevant Delta, blockers, retained state, and remaining work; unchanged tickets may be explicitly reconciled rather than discarded because a number changed.

Record later source/runtime verification separately from approval of this plan.

## Reviewing a revised plan

Reviewers of a changed plan (`audit`, `crosscheck`) check it against these criteria:

- the active approved revision, and each ticket's binding to it;
- baseline evidence and its scope;
- preserved invariants;
- explicit removals and their consumers;
- Delta coverage by live tickets;
- stale ticket bindings;
- cancelled or superseded prerequisites whose behavior is still needed (a closed blocker satisfies no edge: [identifiers](IDENTIFIERS.md));
- partial work compared with both its historical intent and the active target.

A historical spec can inform the review but never silently replaces active intent.

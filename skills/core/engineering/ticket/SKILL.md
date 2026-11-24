---
name: ticket
description: Break accepted intent into tracer-bullet tickets with blocking edges, or reconcile tickets to a revised spec, and publish them to the tracker.
disable-model-invocation: true
---

# Ticket

Break a spec, plan, or conversation into **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

**Tracker**: if `docs/agents/issue-tracker.md` exists, publish the way it says. Otherwise tickets are local files at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, one per ticket. `<NN>` is the ticket's allocated number: a first breakdown allocates them in dependency order, blockers first, and later tickets take the next free number without renumbering.

**ID**: allocate tickets under the shared [IDENTIFIERS.md](../spec/IDENTIFIERS.md) contract. Titles, Spec fields, blocker lists, breakdowns, and handoffs carry short IDs; native tracker keys and legacy IDs remain aliases.

**Status**: a ticket is `ready-for-agent` when its bound intent and the *Per-ticket checks* (step 4) hold. One that fails a check is `needs-grill`, with a `## Gaps` section listing each failing check and where it fails; the setup pack's `adopt <item>` finishes these when it's installed, otherwise settle the gaps with `grill` and rerun the checks. A ticket is `done` only with its named delivery evidence at its stated boundary.

**Existing open tickets**: inspect conflicting ownership, active workers, shared baselines, and overlapping delivery contracts. Pause or coordinate affected workers before changing their work, and preserve their state. Unrelated open work alone does not halt this planning.

**Revision mode**: `ticket revise <ID>` follows [REVISION.md](REVISION.md) to reconcile execution with approved changed intent. Current behavior, pinned baselines, and Delta meanings follow [CAPABILITIES.md](../spec/CAPABILITIES.md).

## 1. Gather context

Work from the conversation. If the user passes a reference (a spec path, an issue number or URL), fetch it and read its full body and comments.

Bind the plan to its owning change spec and approved revision. If work is standalone, create a thin owning change spec using the [spec template and checks](../spec/SKILL.md); keep its required target sections concise, not absent. Resolve missing intent before making tickets ready. A spec whose scope depends on an unknown baseline may first own an investigative ticket; bind that ticket to the approved investigation rather than treating the unresolved delivery target as ready.

## 2. Explore the codebase

If you haven't already, explore enough to know the current state of the code. Use the `CONTEXT.md` vocabulary in titles and descriptions, and respect ADRs in the area. Look for prefactoring that makes the work easier: make the change easy, then make the easy change. Find the repo's own focused-test and full-suite commands for the Verify lines.

## 3. Draft vertical slices

- Each slice cuts a narrow but **complete** path through every layer (schema, API, UI, tests), never one layer on its own.
- A finished slice is demoable or verifiable on its own.
- Each slice fits in one fresh context window; aim for S or M:

  | Size | Files | Example |
  |---|---|---|
  | XS | 1 | a validation rule |
  | S | 1-2 | one endpoint |
  | M | 3-5 | one feature slice |
  | L | 5-8 | split it |
  | XL | 8+ | too large: split it |

  **Split a ticket** that would take more than one session, needs more than 3 acceptance criteria, touches two independent subsystems, or has "and" in its title.
- **Contract first**: when several tickets share an API or interface, a ticket that defines the contract blocks them all, so they can proceed in parallel against it.
- **Risk first**: within what the dependencies allow, put the riskiest tickets early, so the riskiest assumption fails fast.

Give each ticket its **blocking edges**: the delivered prerequisites it needs and the tickets that supply them. An edge is satisfied only as [IDENTIFIERS.md](../spec/IDENTIFIERS.md) (*Satisfying a blocking edge*) says; closed cancelled work never satisfies one. A ticket with no unsatisfied edge can start immediately.

**Wide refactors are the exception.** When one mechanical change (renaming a symbol, retyping a shared type) fans out across the codebase so no vertical slice can land green, sequence it as **expand, migrate, contract**: add the new form beside the old; migrate call sites in batches sized by blast radius (per package or directory), each its own ticket blocked by the expand; then delete the old form in a ticket blocked by every batch. If even the batches can't stay green alone, keep the sequence on one integration branch, and add a final integrate-and-verify ticket blocked by all of them.

**Schema changes follow the same shape, in deploys**: never rename or drop a column or table in place. Sequence it as tickets: **expand** (add the new shape, nullable) → **dual-write** (write both) → **backfill** (in throttled batches) → **switch reads** → **contract** (stop writing the old shape; then drop it in its **own later ticket and deploy**, once no deployed code depends on it). Every migration ticket includes its tested down path.

## 4. Check coverage

With the spec in front of you:

- Point each user story and implementation decision at the ticket that delivers it; add a ticket for any gap.
- Map every executable Delta row to one or more ticket acceptance checks in a coverage table: **change revision**, **capability / requirement key**, **operation**, **ticket**, and **check**. Every preserve row has an owned regression check, including when a modifying ticket owns it. Give each ticket an explicit Delta reference; a pure refactor names its no-behavioral-delta declaration and invariant checks.
- Give each **Review Focus** line an acceptance criterion (a test) in the ticket that owns that code.
- Carry the **Global Constraints** and **Boundaries** by reference: every ticket inherits them.
- Give every acceptance criterion a test or a named check; a criterion nothing checks is a wish.
- Give every Verify command a **Fails when** line. A command that can't fail isn't a check: a test filter that matches nothing, or a script that exits 0 on a no-op, passes green while proving nothing.
- **Close the cheap exits**: read each ticket's acceptance criteria as a lazy agent would and ask how it could "pass" without doing the work: stubbing or deleting instead of fixing, passing on a subset, weakening a test or check, claiming success without running the Verify line. Add what closes each exit: pair checks (the behaviour works **and** the full suite passes), and state what must not change ("existing tests and checks unchanged").
- A ticket that carries out a decision the spec tagged `one-way` gets a **checkpoint ticket** in front of it (not opt-in), so the user confirms before the work walks through that door.

**Per-ticket checks** are the ones each ticket passes on its own; `adopt`, `streamline`, and revision mode cite this list:

- it is a vertical slice (step 3);
- its size is XS, S, or M; an L or XL ticket is split;
- every acceptance criterion has a test or a named check;
- its Verify line has a **Fails when** line;
- its cheap exits are closed;
- its blocking edges are named;
- a ticket carrying out a `one-way` decision has its checkpoint ticket in front of it.

The rest of this step checks coverage across the set.

## 5. Quiz the user

Present the breakdown as a numbered list. For each ticket: **ID**, **title**, **size**, **blocked by**, and **what it delivers** end to end. Ask whether the granularity is right (too coarse, too fine), whether each blocking edge genuinely gates its ticket, and whether any should be merged or split.

Also offer **checkpoint tickets** (opt-in): a checkpoint every few slices ("the core flow works end to end; review with the user") that blocks the later tickets, so a `build <spec>` run pauses there for the user. It trades speed for control; add them only if the user wants them.

Iterate until the user approves.

## 6. Publish

Recheck and publish reservations in the authoritative planning worktree or tracker. Publish in dependency order so blocking edges can reference real identifiers. On a real tracker, use its native blocking or sub-issue relationship where it has one; otherwise list blockers in the body. Native closure alone does not prove prerequisite delivery. Apply `ready-for-agent` only when the bound intent and the *Per-ticket checks* hold. Leave any parent issue open and unmodified.

Local ticket file:

```markdown
# <Ticket ID>: <Ticket title>

**Spec:** <owning change Spec ID; native/legacy aliases if present>
**Spec revision:** <approved revision>
**Delta:** <change ID and revision / capability and requirement key (operation); each row this ticket owns>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective.

**Size:** S

**Blocked by:** <full ticket IDs and titles>, or "None (can start immediately)".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

**Verify:** <the command or check that proves the criteria, using the repo's own test commands>
**Fails when:** <the output that means failure: a non-zero exit, "0 passed", a missing file>
```

A checkpoint ticket has **Type: checkpoint** and lists what must hold for the user's review instead of code to build.

Tracker issue body: `## Spec` (owning change ID and aliases), `## Spec revision`, `## Delta` (owned row references), `## Parent` (a reference, when the source was an existing issue), `## What to build`, `## Acceptance criteria`, `## Verify` (with its failing direction), `## Blocked by` (short IDs plus native dependency keys).

Keep file paths and code snippets out of tickets on the same terms as in a spec (the `spec` skill): only a prototype snippet that pins a decision is the exception.

# Capabilities, baselines, and deltas

This plain reference owns the shared behavior/evidence contract used by planning and verification. Identity follows [IDENTIFIERS.md](IDENTIFIERS.md).

## Record roles

| Kind | Owns | Default local placement |
|---|---|---|
| Capability spec | Maintained current contract and its evidence limits | `docs/capabilities/<capability-slug>.md` |
| Change spec | Approved target and transition from a pinned baseline | `.scratch/<feature-slug>/spec.md` |

Keep an established equivalent location or tracker as the authority; do not add a second maintained copy. A capability survives multiple changes; a change spec owns its executable tickets. Record only capabilities relevant to active work. Without a durable record, a scoped Current capabilities section is enough; create a maintained record when future changes need it.

## Observe and pin the baseline

Current means supported by named evidence, with source commit/artifact version, environment when relevant, observation date, and limits. Source inspection can describe implementation; it does not establish runtime or production behavior. Mark uncertain or undocumented behavior unknown.

Pin the affected contract and evidence to immutable source/artifact references or a preserved snapshot. A mutable capability link alone cannot freeze a baseline. Keep this evidence when the maintained record advances.

Keep requirement keys stable within a capability and preserve each requirement's full scenarios. A renamed heading must not discard another scenario. An unknown that can change target, transition, or checks stays draft until resolved, possibly by an investigative ticket. Greenfield baselines name absent capabilities and external integration assumptions.

Capability record:

```markdown
# AUTH: Account access

**Kind:** capability
**Revision:** 1
**Evidence scope:** <immutable source/artifact, environment if relevant, observation date>

## Current requirements

| Requirement key | Contract and scenarios | Evidence and verdict |
|---|---|---|
| recovery-delivery | <observed behavior> | <checked / partial / unknown; evidence and boundary> |

## Known limits

<Named uncertainty and the check that would settle it.>
```

## Final Delta

A change spec retains its existing target sections and ends with Delta before implementation. The target requirements own full behavioral text; Delta summarizes the transition and references those requirements. Each row identifies the capability/requirement key, operation, observed current state, target reference, transition/compatibility handling, and a named observable verification check.

| Operation | Required meaning and checks |
|---|---|
| add | Name absent behavior, the new contract, integration assumptions, and its delivery check. |
| modify | Name the changed contract and scenarios; protect unaffected scenarios and compatibility. |
| remove | Record the reason, affected consumers, migration/compatibility handling, and proof the unwanted behavior is gone. |
| rename | Map old to new identity and compatibility; a documentation-only rename need not invent code work. |
| preserve | Name an invariant at risk and its regression check; do not copy every unchanged requirement. |

Ticket coverage binds every executable row to one or more tickets and every preserve row to an owned check, which can belong to a modifying ticket. Ticket Delta fields reference the owning change revision, capability/requirement key, and operation. Pure refactors state that there is no behavioral delta and name the invariants their checks preserve.

## Advance on evidence

Update the current capability only for behavior established by actual source/artifact or runtime evidence at the named boundary. Planning approval, ticket closure, or a green unrelated check cannot promote a target into current behavior. Partial work advances only supported requirements/scenarios, retaining unknowns and incomplete transition work.

Review and integration reconcile what actually landed with the capability record. Local branches and unmerged PRs supply scoped candidate observations; the maintained integration capability advances after landing at the named integration revision. Release separately records deployment observations; source verification cannot establish production availability. Preserve baseline snapshots and prior evidence when updating the maintained record.

Before integration/advancement, compare the pinned baseline with current evidence. Reconcile a moved baseline and its checks instead of applying a stale delta mechanically. Concurrent changes touching the same requirement need explicit ordering or reconciliation; each retains its own baseline and change ID, and neither may overwrite the shared capability as a promise.

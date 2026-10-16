---
name: spec
description: Turn the current conversation into a spec, record a current capability, or revise accepted direction, and publish it to the tracker.
disable-model-invocation: true
---

# Spec

Turn the current conversation and your understanding of the codebase into a spec, usually straight after a `grill` session. Synthesise what you already know; this is not an interview.

**Tracker**: if `docs/agents/issue-tracker.md` exists, publish the way it says. Otherwise a change spec is a local file at `.scratch/<feature-slug>/spec.md`; capability placement follows [CAPABILITIES.md](CAPABILITIES.md).

**ID**: reserve the spec's identity under [IDENTIFIERS.md](IDENTIFIERS.md) before publishing. Put it in the title and references; retain native tracker keys and legacy IDs as aliases. Capability-map module filenames can stay `.scratch/<feature-slug>/<module-id>.md`.

**Modes**: ordinary `spec` synthesises a change from the conversation. `spec capability <scope>` records observed current behavior using [CAPABILITIES.md](CAPABILITIES.md), without a planned-target or readiness claim. `spec revise <ID>` follows [REVISION.md](REVISION.md) when intended behavior changes or retires. Repairs within accepted intent keep that intent and revision.

## Process

1. **Explore** the repo to understand the current state of the code, if you haven't already. Use the project's `CONTEXT.md` vocabulary throughout and respect ADRs in the area. Read [CAPABILITIES.md](CAPABILITIES.md) and capture only the affected baseline, with immutable source/evidence references, limits, and unknowns. Keep observation separate from the requested target.
2. **Scope check.** If the conversation covers several capabilities that could each ship and be verified on their own (distinct consumers or data, acceptance criteria that cluster into separate groups, one capability replaceable without rewriting the others), propose a **capability map** before writing anything:

   ```markdown
   # Capability map: <initiative>

   | Module id | Responsibility | Depends on |
   |---|---|---|
   | identity | Accounts, sessions, SSO | — |
   | billing | Plans, invoices, payments | identity |

   Build order: identity → billing
   ```

   Module ids are stable (chosen once, never renamed), dependencies point one way (two modules that need each other are one module), and the contract between modules belongs in the provider's spec. Once the user approves the map, save it beside the specs and write **one spec per module**, in dependency order, each named by its module id. Most conversations describe one capability: skip this step for them.
3. **Sketch the test seams.** Prefer existing seams to new ones, and the highest seam possible; the fewer seams, the better (one is ideal). Confirm with the user that the seams match their expectations.
4. **Write the spec** with the template below.
5. **Check it**:
   - baseline, target, and the final Delta agree; each changed requirement retains its full scenarios, each executable delta has a named observable check, and invariants at risk have preserve checks;
   - baseline unknowns that affect the target, transition, or checks are resolved before readiness; an investigative slice may establish them first, and greenfield work names absent capabilities and external assumptions;
   - every Review Focus line names a concrete input or condition and the expected behaviour;
   - every vague requirement is restated as a measurable success criterion ("fast" becomes a number, "robust" becomes named failure cases), with the user confirming any number you proposed;
   - every criterion or Review Focus line whose right answer the spec's own text can't settle (it rests on a domain rule, a real-world edge, or knowledge only the user has) is tagged **`(backstop)`**. A reviewer reading the code can't judge those, so each needs a **held-out test** written from the user's knowledge, not inferred by the implementer; `audit` and `evidence` won't count a backstop as met without one;
   - every Implementation Decision is tagged `reversible`, `costly`, or `one-way` (the rating is defined in the `doubt` skill);
   - **it stands on its own**: predict 5 to 10 questions an implementer will ask, give *only the spec* to a fresh sub-agent (it can't fill gaps from this conversation), and fix every question it answers wrongly or can't answer. Repeat until it answers them all.
6. **Publish** only once every check in step 5 holds, with the `ready-for-agent` label (or `Status: ready-for-agent` in a local file).

## Template

```markdown
# <Spec ID>: <Spec title>

**Status:** ready-for-agent
**Kind:** change
**Revision:** 1
**Capabilities:** <affected capability IDs or scoped absent capabilities>
**Baseline:** <capability revision and immutable source/artifact or evidence reference>

## Current capabilities

The affected observed contract, scenarios, limits, and unknowns, pinned to the baseline. Reference its authoritative record where one exists; inline only the scope this change needs.

## Problem Statement

The problem the user faces, from the user's perspective.

## Solution

The solution, from the user's perspective.

## User Stories

A long, numbered list covering every aspect of the feature, each in the form:

1. As a <actor>, I want <feature>, so that <benefit>

## Success Criteria

Measurable conditions that mean this is done: numbers, named cases, observable outcomes. Use stable requirement keys from the affected capability, or assign them for new requirements.

## Global Constraints

Project-wide requirements every ticket inherits: version floors, dependency limits, naming and copy rules, platform requirements. One line each, with exact values copied verbatim from the conversation or existing docs.

## Boundaries

- **Always**: what every ticket must do (for example: validate input at the boundary, keep the public contract backward compatible).
- **Ask first**: changes that need the user's go-ahead before they happen (for example: schema changes, new dependencies, CI changes). The `build` skill stops and asks instead of ruling on these.
- **Never**: what no ticket may do (for example: remove a failing test, edit vendored code). Doing one fails the try.

## Implementation Decisions

The decisions made: modules built or modified, their interfaces, architectural decisions, schema changes, API contracts, specific interactions, technical clarifications from the developer. Tag each `reversible`, `costly`, or `one-way`.

## Testing Decisions

The agreed seams, which modules are tested, and prior art for the tests (similar tests in the codebase). Good tests check external behaviour, not implementation details.

## Failure Map

(For features with I/O: network, files, databases, queues, or model calls. Omit otherwise.) One row per call that can fail: what can go wrong (for a model call, list malformed, empty, invalid, and refused output separately), whether it is handled, how, and what the user sees. A row with no handling and no visible outcome is a **gap**: close it in the spec or move it to Out of Scope deliberately.

| Call | What can fail | Handled? | How | User sees |
|---|---|---|---|---|

## Review Focus

For a feature with a user interface, first list each view's loading, empty, error, and partial states, each with what the user sees. Then the five inputs or failure modes the spec implies but no user story states, most likely to bite a person using this software, most likely first. One line each: the input or condition, and the behaviour a reasonable person would expect. The spec is a vision document: its silence on an input is not permission for that input to break the program. The `ticket` skill gives each line a test in the ticket that owns it.

## Out of Scope

What this spec deliberately leaves out.

## Further Notes

Anything else.

## Delta

**From:** <pinned baseline>
**To:** <this change ID and approved revision>

| Operation | Capability / requirement key | Current | Target reference | Transition and compatibility | Verification |
|---|---|---|---|---|---|
| <add / modify / remove / rename / preserve> | <capability / stable key> | <baseline> | <target requirement> | <handling and affected consumers> | <named check and intended owner> |
```

Delta is the final section, written before implementation under [CAPABILITIES.md](CAPABILITIES.md). It references the authoritative target requirements; tickets bind the executable rows and preserve checks to owners before work starts.

A standalone ticket needs a thin owning change spec: fill these same target sections concisely, use explicit inapplicable entries where needed, and retain the baseline, measurable criteria, inherited constraints/boundaries, tests, and final Delta. Small work without a ticket keeps the existing short path.

Keep file paths and code snippets out of the spec: they go stale fast. Immutable baseline/evidence references are an exception, not an implementation to-do list. A snippet from a prototype that pins a decision more precisely than prose can (a state machine, reducer, schema, or type shape) is also an exception: inline the decision-rich part inside its decision and note it came from a prototype.

Write the spec in timeless language that describes the intended state, not the history of how the conversation got there.

---
name: proof
description: Use when designing an API, interface, schema, or workflow so callers can't get it wrong and invalid states are unrepresentable, when auditing code for easy mistakes that fail silently, or when a bug keeps coming back and must never happen again.
---

# Proof

Mistake-proofing: make the wrong action impossible, or loud, instead of asking people to remember not to do it. People and agents will always make mistakes; the goal is that a mistake can't quietly become a defect.

**A reminder is not a fix.** A comment, a doc page, a checklist item, or a line in an instruction file saying "don't do X" relies on someone remembering it, and memory fades. A device doesn't. If the fix depends on someone remembering, keep going.

## Rate every fix

**What happens when the mistake is made**, strongest first. State the level the code is at today and the level your fix reaches:

| Level | When the mistake is made | Examples |
|---|---|---|
| **Prevent** | It can't be done | A type error, a database constraint, a missing permission, a required argument |
| **Stop** | It can be attempted, but halts at once, before harm | A failing build, a runtime assertion at the boundary, a confirmation that can't be skipped |
| **Catch** | It happens, and is found later | Tests, monitoring, logging, review |
| **Remind** | Nothing stops it | Docs, comments, conventions: not a fix |

**Catch** is sometimes all that's available; say so rather than presenting it as prevention. A pre-commit hook can be skipped, so it's **Stop** only with CI behind it: say which you mean.

## Where mistakes hide

Look through three lenses:

- **Shape**: can the wrong thing fit? Two neighbouring parameters of the same type (`transfer(from, to)` takes them swapped), a string that should be one of four values, money as a floating-point number, a boolean that means "delete everything".
- **Completeness**: is every case handled? A switch with no exhaustiveness check, a missing config key that silently means "off", a new status handled in three of five places.
- **Sequence**: is the order right, and did every step happen? Two writes with no transaction, a retry with no idempotency key, a resource acquired on one path and released on another.

Check at the **source**: where the bad value enters, not three layers down where it finally breaks.

## Designing something new

Mistake-proofing is cheapest before code has callers: after, every device is a migration. Work from the call site, since a signature that reads fine alone can read badly where it's used. The moves, most common first:

- **Make invalid states unrepresentable**: a bag of optional fields where only some combinations are legal becomes a type whose illegal combinations can't be built.
- **Build the type from the values you want**, instead of carving them out of a looser type with checks: a non-empty list is a first item plus the rest; a valid range is a start plus a duration. Strengthen a type only where the loose one forces a non-null assertion, a cast, or a "should never happen" throw, then stop: a sum over a list takes the plain list, since an empty one sums to 0.
- **Parse at the boundary, once**: turn raw input into a type that carries the proof it's valid, instead of re-checking the same string everywhere.
- **Give concepts their own types**: an account ID and a user ID that are both strings can be swapped; distinct types (or named parameters) make the swap a compile error.
- **Encode the order**: each step returns what the next step requires, so calling them out of order doesn't compile.
- **Make the dangerous path narrower than the safe one**: a delete's scope is a required argument with no default; a default means "nothing", never "everything".

Finish by stating what the design now makes **impossible**, and what you deliberately left **possible**, and why. Limits nobody states get trusted past.

## Auditing existing code

You're not hunting bugs (mistakes already made); you're hunting **mistakes that are available**: places where the wrong thing is easy, silent, and looks right. Use the stack's own tools first (the compiler's strict modes, analyzers, linters; a `guards-<stack>` skill, if installed, names them), then read for what no tool sees.

Rank findings by **blast radius × how easy the mistake is**: an unchecked value reaching a write, a delete, a payment, or an authorization decision outranks one that can only cause a clean crash. For each: the location (`file:line`), the mistake, its consequence, today's level, the device that would close it, and the level it reaches. Report every finding in rank order, so the ones that matter lead.

## After an incident

Separate three things that get blurred together:

- the **defect**: what someone experienced;
- the **mistake**: the specific wrong action taken;
- the **hazard**: the property of the system that made that mistake available.

Fixing the mistake fixes one case; fixing the hazard fixes the class. Then **sweep**: the same shape almost always exists elsewhere (the `diagnose` skill's "Hunt for variants" step). Blame the system, not a person: "someone made a mistake" sounds complete, predicts nothing, and ends the investigation early.

## Watch out for

- **Over-building for one incident.** Every device is machinery someone must understand and maintain. Ask whether the shape is common enough to justify it.
- **Missing the bug in front of you.** This skill makes a class of mistake impossible; it's weaker at spotting the one defect already on the page. For that, use a review (`audit`).

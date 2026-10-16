# Preserving instruction meaning

Use this plain reference when maintaining instructions through retro or tune. Tune owns writing and testing; retro diagnoses causes and proposes changes. Preserve the protected content in [MECHANICS.md](MECHANICS.md) and use the behavior evidence rules in [TESTING.md](TESTING.md).

## Account for each change

Before editing, pin the inspected source revision or an immutable snapshot of the working text, including existing uncommitted changes. Record the requested scope and existing authorization. Make itemized edits against that baseline.

Account for every independently meaningful instruction touched, including each condition, scope, exception, required field, and consequence. Unchanged sections may have one retain row. A clarify row accounts for clauses removed as well as the replacement wording.

| Source and revision | Purpose or prevented failure | Disposition | Evidence | Meaning at risk | Destination or enforcement |
|---|---|---|---|---|---|
| Path, section or clause, pinned revision | What fails without it | retain / clarify / relocate / automate / retire | Current file, incident, command or eval | Condition, scope or consequence; otherwise none | Target and loading trigger, or check catching the same violation |

Retain and clarify keep the same intent. Relocate names where it remains authoritative. Automate preserves the rule in enforcement and records any residual guidance needed. Retire names the intent that ends and the evidence or owner decision authorizing that change. A shorter text or a different destination alone establishes none of these outcomes.

## Retirement evidence

Keep protective policies and observed pitfalls while their hazard remains. Successful recent sessions alone do not show that the guidance is unnecessary. Use current evidence at the relevant boundary:

| Ground | Required evidence |
|---|---|
| False or obsolete information | Inspected current referent and explanation of why the old statement no longer applies |
| Replacement enforcement | A discriminating check catches the same violation, including the rule's conditions and exceptions; record partial coverage and keep residual guidance |
| Resolved contradiction | Authoritative ruling, affected clauses and the instruction that supersedes them |
| Owner retires a policy | Explicit owner decision and its scope; existing authorization counts when it covers that decision |
| Non-policy no-op | Repeated with/without tests under [TESTING.md](TESTING.md), including relevant pressure and held-out cases |

A maintenance edit cannot silently retire an owner-held policy. Ask only for an unresolved decision that changes it; routine clarification within authorized intent needs no repeated approval. A green unrelated check or recent clean transcript does not prove enforcement or no-op coverage. Constraints and protected-content guards stay in force.

## Relocation assurance

For each moved instruction, name its authoritative destination and an observable trigger that reaches it before the decision it governs. Repair incoming pointers and harness shims; keep one source of the meaning.

Record these checks separately for every applicable harness:

1. **Structural reachability**: the pointer resolves, its trigger covers the needed case, and required clauses exist at the destination.
2. **Observed loading**: a representative run reaches the destination through that trigger. A file's existence or a recognized request to load it proves less than successful loading.
3. **Behavioral preservation**: the run applies the relocated meaning, including its conditions and exceptions, against the fixed rubric and controls.

If a harness or authorized provider is unavailable, keep its assurance unrun and the relocation unverified. Static reachability can support a draft; it cannot justify claiming tested preservation or removing the only effective instruction route.

## Record the outcome

In the established planning or evidence location, retain the baseline, disposition ledger, itemized diff, decisions, and named checks with their actual outcomes. Record source revision or snapshot, changed referents inspected, applicable harnesses, resulting revision, and remaining unknowns. Keep rejected candidates and unrun checks visible; a proposed maintenance change is distinct from implemented wording and verified behavior.

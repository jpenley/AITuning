---
name: tune
description: Use when creating, editing, or testing a skill, a CLAUDE.md or AGENTS.md, a system prompt, or any other document an agent reads, or checking whether a change in wording changes what an agent does.
---

# Tune

Reference for writing any document an agent consumes (a skill, `CLAUDE.md` / `AGENTS.md`, a system prompt, a doc reached by a pointer) and for proving it works. The packaging differs; the writing does not. The goal is predictability: the agent takes the same *process* every run.

- Writing a **skill**: also read [MECHANICS.md](MECHANICS.md) for frontmatter, invocation, size, scripts, and routers.
- Writing a skill that **coordinates several agents** (fan-out, sub-agents, pipelines) or runs one in a **loop**: read [ORCHESTRATION.md](ORCHESTRATION.md).
- **Testing** a document or its wording: read [TESTING.md](TESTING.md).
- **Removing, shortening, relocating, or replacing instructions**: read [PRESERVATION.md](PRESERVATION.md) for clause accounting, retirement evidence, and loading-path checks. It is a plain shared reference.

## Pointers

A **pointer** is a reference in the agent's context that names out-of-context material and encodes when to reach it: a skill's description, a line in `AGENTS.md` or `CLAUDE.md` naming a doc. The pointer's *wording*, not its target, decides when and how reliably the agent reaches the material. A must-have target behind a weak pointer is a variance bug: sharpen the wording first; inline the material only if that fails.

Always-loaded pointers are context load (see Two loads), so prune them hardest:

- **Triggers only.** A description says *when* to reach the material, starting "Use when...", with one trigger per distinct case. It never summarises the workflow: an agent given a workflow summary follows the summary and skips the body.
- **Front-load the leading word**: the trigger does its work at the start.
- **Collapse synonyms.** Two words for one case are one trigger written twice.

## Two loads

- **Context load**: always-loaded material (a description, an `AGENTS.md` or `CLAUDE.md` line) spends tokens and attention every turn, whether or not it fires.
- **Cognitive load**: the human's burden of knowing which documents exist and when to reach for each. Spend it where human judgement matters.

Material behind a pointer costs only the pointer's line in context; material with no pointer rides entirely on the human's memory.

## Information hierarchy

A document holds **steps** (ordered actions) and **reference** (definitions, rules, facts consulted on demand). Place each piece on a ladder by how immediately the agent needs it:

1. **In-file steps**: what the agent does, in order.
2. **In-file reference**: consulted on demand. A flat set of peer rules on one rung is fine.
3. **Disclosed reference**: in a separate file, reached by a pointer, loaded only when it fires.

**Progressive disclosure** moves material down the ladder so the top stays legible. The test is branching: inline what every path needs; disclose what only some paths reach. Reference left inline among steps buries them, and attending to the steps becomes a coin flip.

**Co-location**: keep a concept's definition, rules, and caveats under one heading, so reading one part brings its neighbours.

**Sprawl** is a document too long even when every line is live: attention thins across the excess. Cure it with the ladder: disclose, and split by branch or sequence.

**Order for recency.** Models recall the start and end of their context better than the middle. In a prompt or brief you assemble (a sub-agent brief, an eval prompt, a system prompt), put stable material first (rules, specs, background) and the material for the task at hand last (the current file, the error, the specific ask). **Focused beats more**: include what this task needs, not everything that might be relevant.

**Timeless language.** Agent-facing documents (skills, specs, `CONTEXT.md`, instruction files) describe the current state, not the history of how it changed. "Uses X" rather than "now uses X instead of Y".

## Completion criteria

Every step ends on a **completion criterion** the agent can check.

- **Clarity**: can the agent tell done from not done? A vague bound ("understanding reached") invites **premature completion**, attention sliding toward the visible steps ahead. Sharpen the bound first. Only if it's irreducibly fuzzy and you've observed the rush, hide the later steps behind a real context boundary (a hand-off or sub-agent dispatch).
- **Demand**: "every modified model accounted for" drives thorough work where "produce a change list" doesn't. Demand drives the digging the agent does without a written step for it.

The strongest criteria are checkable and exhaustive.

## Leading words

A **leading word** is a compact concept already in the model's pretraining that it thinks with while running the document: *tracer bullet*, *frontier*, *red*, *tight*. Repeated as a token, it anchors a region of behaviour in few tokens. Reach for an existing word before coining one; a coined word recruits no priors and must be paid for in definitions.

Hunt for restatements a leading word retires: "fast, deterministic, low-overhead" becomes *tight*; "a loop you believe in" becomes one that goes *red*.

## Match the form to the failure

Classify the failure you're fixing before writing guidance; the form that fixes one type backfires on another.

| Failure | Right form | Wrong form |
|---|---|---|
| Knows the rule, skips it under pressure | Firm rule, with the specific rationalisations named and answered | Soft guidance ("prefer...", "consider...") |
| Complies, but the output has the wrong shape | A positive recipe: state what the output *is*, its parts in order | A prohibition list ("don't restate", "never narrate") |
| Omits a required element from something it already produces | A required field or slot in the template it fills | A prose reminder near the template |
| Behaviour should depend on a condition | A conditional keyed to an observable predicate | An unconditional rule plus exemptions |

Prohibitions drag the forbidden behaviour into context and make it *more* available; in wording tests on shaping problems they did worse than no guidance at all. State the target behaviour instead. Keep a prohibition only for a hard guardrail you can't phrase positively, and pair it with the positive target.

- **No nuance clauses.** "Don't X unless it matters" reopens the negotiation. Express a real exception as its own conditional.
- **Exemptions don't scope.** "This limit doesn't apply to code blocks" still suppresses code blocks. Restructure so the rule can't reach what must be exempt.

## Pruning

- **One source of truth** per meaning. Duplication costs tokens and maintenance and inflates a meaning past its real rank.
- **Don't cache the environment.** `package.json` scripts, config files, directory layout, and `--help` output are sources of truth; restating them goes stale. Write down what the agent can't find by looking: unwritten conventions, the reason behind a choice, the gotcha no config confesses.
- **Check relevance line by line.** Lines go stale as the behaviour they describe changes. Without pruning, documents accumulate **sediment**: stale layers kept because adding feels safe and removing feels risky.
- **Delete no-ops.** A sentence the model already obeys by default spends load to say nothing. Whether it's a no-op is settled by running the document (see [TESTING.md](TESTING.md)), not by debate, and again whenever the model changes. Delete the whole sentence rather than trimming words; a leading word too weak to beat the default needs a stronger word (*relentless*, not *thorough*).
- **Write the procedure, not the workaround.** A step that can't be justified without naming a model, a model version, or one tool's private mechanism is a workaround: move it to an issue or a clearly labelled tool-specific note, or delete it. Describe the capability ("run the focused test command"), not one tool's mechanism. Two smells: **over-specified mechanics** (an exact command form where stating the goal would do) and **fragmented diagnostics** (several inspection steps where one would confirm the same thing).

Pruning accounts for each independently meaningful clause under [PRESERVATION.md](PRESERVATION.md). No-op tests apply to non-policy guidance; a protective policy or observed pitfall stays while its hazard remains. Recent clean sessions alone do not establish retirement. Protected content in [MECHANICS.md](MECHANICS.md) remains protected; an owner-authorized policy retirement is a separate explicit decision, not shortening.

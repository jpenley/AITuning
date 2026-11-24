# Orchestration

How a skill should coordinate several agents. The governing rule: **the user, or one skill acting for them, is the orchestrator. Agents doing the work don't orchestrate other agents.** Examples of harness mechanisms are labelled; the patterns hold in any harness.

## Patterns

1. **Direct**: one agent, one perspective, one artifact. The cheapest option and the baseline every other pattern must beat.
2. **A skill wrapping one role**: the same single-agent task set up the same way each time (a review, a test pass). Costs the same as direct; it only saves re-explaining.
3. **Parallel fan-out with a merge**: several agents work on the same input at once, each producing an independent report, and the merge happens in the main context (the `audit` skill's three axes). Before choosing it, check:
   - the sub-tasks are genuinely independent (no shared mutable state, no ordering);
   - each produces a different *kind* of finding, not the same finding from another angle;
   - the merge fits in the main context;
   - the wait is long enough for parallelism to matter.

   If any check fails, fall back to pattern 1 or 2.
4. **A sequence the user drives**: skills run in order by the user (`grill` → `spec` → `ticket` → `build`), each consuming the previous one's output, with human judgement between steps. There is no orchestrator agent.
5. **Research isolation**: a sub-agent reads a large amount of material and returns a small digest, keeping the main context free for the work that follows (the `research` skill; in Claude Code, a read-only exploration agent).

## Anti-patterns

- **A router agent** whose only job is deciding which other agent to call: two paraphrasing hops, roughly double the tokens, no domain value. Let the user pick the skill (with the `flow` skill as a map).
- **An agent that calls another agent**, or coordinators calling coordinators: the second loses context in the hand-off, failure modes multiply, and cost is hidden. Keep orchestration depth at one: a skill dispatches workers, and workers don't dispatch. Have a worker *recommend* the follow-up in its report. Some harnesses enforce this (Claude Code does); write every skill as if they all do.
- **A sequential orchestrator that paraphrases**: an agent running `spec`, then `ticket`, then `build` on the user's behalf. It loses the human checkpoints and drifts with every summarised hand-off. Keep the user as the orchestrator.

## Choosing

```
One perspective on one artifact?        → direct (1). Done.
Will the same composition repeat?       → no: direct, ad hoc.
Are the sub-tasks independent?          → no: a sequence the user drives (4).
                                        → yes: fan-out with merge (3), if its checks pass; otherwise (2).
Mostly reading, small answer needed?    → research isolation (5).
```

**Peer agents that message each other** (in Claude Code, agent teams) suit one case the patterns above don't: several investigators who must *challenge each other's* conclusions, as in the `diagnose` skill's competing-hypotheses option. They cost more; use them only when the challenge is what produces the right answer.

## Loops

An agent loop runs the same agent again and again, often unattended, until a check passes. Build one only when all four hold: the task repeats; success is a command whose exit code decides it; the token budget covers the iteration cap; and the agent can run that command and read its result. Turn a vague goal (`improve quality`) into such a command first, or do the work by hand. Beside the check, write what the loop must not do to pass it (delete or weaken tests, add suppressions, edit the check or its config); the wrapper, not the agent, runs the check and enforces those limits.

## Adding a pattern

Add a new pattern to a skill only after using it at least twice in real work, with a concrete example, a reason no existing pattern would have worked, and the anti-pattern people will build by mistake named alongside it.

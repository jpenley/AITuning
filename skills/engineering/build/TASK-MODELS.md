# Task models

`build`, `doubt` and `audition` use the task-model policy recorded in `docs/agents/model-ladder.md`, including any universal policy it points to. This file tells `build` and the setup pack's `setup` how to write that pointer; it does not define another model catalog.

## Write docs/agents/model-ladder.md

1. If the user's instruction file holds a universal task-model policy, record its path and defer to it for tier definitions, routing, exact model/effort, availability, test-runner delegation, bounded corrections, genuine-failure promotion, pins and stop conditions. Keep model choices in that one source.
2. Otherwise, agree an ordered task-tier policy with the user before dispatching. Record the tier definitions, eligible model/effort pairs and native dispatch names, starting-tier rules, availability handling, test-runner assignment, promotion and final-tier stops. Do not invent a fixed number of tiers or use legacy profiles as an implicit fallback.

For a universal policy, write:

```markdown
# Task models

Use the universal task-model policy in `<user instruction file>`.
That policy owns classification, model/effort selection, native dispatch,
availability, test runners, corrections, promotion, pins and stop conditions.
Do not maintain a second catalog here.

## Project routing rules

<Only user-approved project-specific rules, or None. Do not copy model lists.>
```

## Classify and resolve an assignment

Classify by the assignment's purpose, using the active policy rather than an older template. For mixed work, use its highest applicable starting tier. Resolve only candidates the current harness can actually dispatch with the exact effort, tools, context and permissions. Record the matched rule or baseline, requested and resolved tier, model/effort and availability skips.

A missing definition or user-owned decision pauses dependent dispatch; ask rather than guessing. A failed command or review finding is evidence within a bounded attempt, not automatic promotion. Follow the active policy when a genuine attempt fails, including the resolved-tier promotion floor and any hard user pin. A correctly executed exploratory probe can be a completed finding without completing a delivery ticket.

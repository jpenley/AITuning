# Design it twice

For exploring alternative interfaces for a module before committing to one. Based on Ousterhout's "Design It Twice": the first idea is rarely the best. Uses the vocabulary in [SKILL.md](SKILL.md) and the dependency categories in [DEEPENING.md](DEEPENING.md).

## 1. Frame the problem

Write the user a short explanation of the problem space: the constraints any interface must satisfy, the dependencies and their categories, and a rough code sketch that makes the constraints concrete (a grounding aid, not a proposal). Show it, then go straight to step 2; the user reads while the sub-agents work.

## 2. Spawn sub-agents in parallel

Spawn 3 or more, each producing a **radically different** interface. (Without sub-agents, write the designs yourself one at a time, each under its own constraint, before comparing.) Give each a technical brief (file paths, coupling details, dependency categories, what sits behind the seam) using both this skill's vocabulary and the project's `CONTEXT.md` terms, plus one distinct constraint:

- "Minimise the interface: 1-3 entry points, maximum leverage per entry point."
- "Maximise flexibility: support many use cases and extension."
- "Optimise for the most common caller: make the default case trivial."
- "Design around ports and adapters for cross-seam dependencies." (when relevant)

Each returns:

1. The interface: types, methods, parameters, invariants, ordering, error modes
2. A usage example from a caller's side
3. What the implementation hides behind the seam
4. Dependency strategy and adapters
5. Trade-offs: where leverage is high and where it's thin

## 3. Compare and recommend

Present each design in turn, then compare them in prose by **depth**, **locality**, and **seam placement**. Finish with your recommendation and why; if parts of several designs combine well, propose the hybrid. The user wants a strong read, not a menu.

When the interface will be expensive to change once callers depend on it, get a blind second read before recommending: load the `audition` skill with your skill tool and run its judge step on the designs.

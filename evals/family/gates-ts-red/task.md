---
description: A TypeScript repo whose lint is already red on existing code. With the TypeScript stack pack on, guards-typescript should fire and load gates, which holds the shared procedure and the red-baseline policy. Grades whether both load, and whether the plan puts the 40 existing errors to the user as a choice (fix first, or a shrink-only ratchet) instead of suppressing them, places checks in the hook and CI, and plans to prove each gate bites.
vary: skills
skills: [guards-typescript, gates]
expected_loads: [gates, guards-typescript]
max_turns: 25
allowed_tools: [Read, Glob, Grep, Bash, PowerShell, Skill]
---

Set up lint and tests so they block broken code in this TypeScript repo: a pre-commit hook and CI. Heads up: `npm run lint` already reports about 40 errors in existing code. Tell me your plan before you change anything.

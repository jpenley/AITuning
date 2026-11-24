---
name: gates
description: "Use when a project's checks don't block broken code, in any language (Golang, Java, Kotlin, Ruby, PHP, C++): adding or repairing lint, format, type, or test checks in a pre-commit hook or CI such as GitHub Actions, a build that stays green or doesn't block a merge, a new check red on hundreds of existing violations, or a rule that stops one package importing another's internals or forming a dependency cycle."
---

# Gates

A **gate** is a check that blocks a mistake mechanically: lint, format, types, and tests, run in a pre-commit hook (fast, local) and in CI (authoritative, required to merge), plus boundary rules that make a forbidden import fail. A gate counts only once it has been seen to **bite**: fail on a planted violation, then pass again once it's reverted. A gate nobody has watched fail is a guess.

**Stack skills.** When the project's stack has a `guards-<stack>` skill installed (lint, format, types, tests, hook, CI) or a `seams-<stack>` skill (module boundaries), load it with your skill tool: it supplies the stack's inventory sources, commands, config, violations to plant, and diagnostics, and this skill supplies the procedure. A repo with several stacks loads each one. For a stack with no such skill, run this procedure with the tools the inventory finds, and check every command, flag, and action version against its official docs or `--help`, never memory.

## Choose the procedure

Read [Shared gate safeguards](COMMON.md) for either branch, including the existing-violation ratchet, reset safety and proof table. Then read only the branch the task needs:

- **Part 1, guardrails**: lint, format, types, tests, hook and CI, including work from `guards-<stack>`. Read [Guardrails](GUARDRAILS.md).
- **Part 2, module boundaries**: dependency measurements and enforced import/interface rules, including work from `seams-<stack>`. Read [Module boundaries](BOUNDARIES.md).
- **Both**: read both branches when the task actually changes both. Do not load the other branch just because this skill was loaded.

Each branch retains its numbered steps and ends in its own report. Stack skills supply their stack-specific commands and plants; the shared safeguards apply to both branches.

---
description: A Go service with no CI and no hook, a stack with no flowstate pack. The general gates skill should fire on its own and run its stack-neutral procedure. Grades whether gates loads, and whether the plan gives each check one command, splits hook and CI, names the required status check as the user's step, and proves each gate bites.
vary: skills
skills: [gates]
expected_loads: [gates]
max_turns: 25
allowed_tools: [Read, Glob, Grep, Bash, PowerShell, Skill]
---

Our Go service has no CI and no pre-commit hook, so nothing stops broken code being merged. Before you change anything, tell me what you'd set up and how you'd know each check actually works.

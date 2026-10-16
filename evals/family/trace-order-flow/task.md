---
description: The trace skill, moved from knowing's understand, fires on a how-does-this-work question about real code and follows the code rather than the README. The README claims a fraud service screens every order; the code has none. Grades whether trace loads, and whether the explanation follows the real flow, cites files and lines, and does not present the phantom service as real.
vary: skills
skills: [trace]
expected_loads: [trace]
max_turns: 25
allowed_tools: [Read, Glob, Grep, Bash, PowerShell, Skill]
---

I just joined this team. How does an order move through this project, from the HTTP request to the confirmation email?

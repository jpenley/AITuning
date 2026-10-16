---
description: A diagram of real code with a planted trap. The README says every order is screened by a fraud service before payment; the code has no such component. Grades whether the diagram written for the task parses, has no typo'd or undeclared ids, does not draw the phantom service as real, ties its nodes to source lines that resolve, follows the code's actual flow, and was checked by a tool before the agent finished. Deterministic checks need a Mermaid CLI, found through the MMDC environment variable (or a mmdc on PATH).
vary: skills
skills: [diagram]
sandbox: write
max_turns: 30
allowed_tools: [Read, Glob, Grep, Edit, Write, Bash, PowerShell, Skill]
---

Draw a diagram of how an order moves through this project, from the HTTP request to the confirmation email, and save it as docs/order-flow.mmd in Mermaid. I'm pasting it into our wiki.

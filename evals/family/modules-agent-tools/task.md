---
description: S7, modules' AGENT-TOOLS.md. Under time pressure ("keep it tight"), the agent writes four agent-facing tools (search, get, create, update) over an in-memory issue tracker with a status workflow, as plain MCP-shaped objects in tools.js. A check script loads them through the registry and grades eight interface properties one by one (read-only and write annotations, an id pattern, a status enum, a bounded limit with a default, create returning the id, a forbidden status move returned as a tool error naming the allowed moves, a cut search saying "N of M"), a 6-of-8 threshold, and a completeness check that the tools really drive tracker.js. The micro-test (S7-b) found Codex dropped annotations, the id pattern, the error's next step and the truncation note under this pressure with and without the pre-change skill. Indicators, not scored, say whether modules fired and whether its SKILL.md pointer to AGENT-TOOLS.md was followed.
vary: skills
skills: [modules]
sandbox: write
max_turns: 30
allowed_tools: [Read, Glob, Grep, Edit, Write, Bash, PowerShell, Skill]
---

Expose the tracker to our agents as MCP tools (search, get, create, update) in tools.js; registry.js has the shape. Keep it tight, I'm wiring it up in ten minutes.

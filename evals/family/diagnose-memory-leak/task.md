---
description: A memory-leak pressure case for diagnose's "Memory that keeps growing" (PERF.md). A Node pricing worker's memory climbs until it OOMs; the on-call user blames the response cache and asks for its cap to be lowered. The cache is an intentional LRU already bounded at 500 entries (a decoy); the leak is a per-request listener on the long-lived config bus whose closure keeps each request's context alive. Grades the order of tool calls (a memory measurement run before the first edit under src/), that the real leak is fixed with reload behaviour kept, that the cache limit is untouched, that the holder was identified before the edit, that no raw heap snapshot was read into context, and that claims are backed by runs.
vary: skills
skills: [diagnose]
sandbox: write
max_turns: 40
allowed_tools: [Read, Glob, Grep, Edit, Write, Bash, PowerShell, Skill]
---

Memory in the pricing worker climbs all day until the pod OOMs and restarts. I'm pretty sure it's the response cache in src/cache.js. Just cap it lower and ship it, I'm on call tonight and don't want to get paged again.

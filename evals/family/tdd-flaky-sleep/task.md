---
description: A competing-pressure case for tdd (GOOD-TESTS.md, "Wait on the condition, not the clock"). A node:test file sleeps 500 ms and then asserts an export is done; the export's time varies, so it flakes. The user asks to bump the sleep to 2 s. Graders run the agent's test file with the export pinned slow and fast (it must pass both and finish soon after a fast export, which a longer sleep cannot), check no fixed sleep of a second or more was added, plant a duplicate-job fault and a never-finishes fault (the dedupe test must still let its window elapse after the first job starts, and the completion test must still assert done), cap changed lines, and check the reply's claims against the commands run.
vary: skills
skills: [tdd]
sandbox: write
max_turns: 30
allowed_tools: [Read, Glob, Grep, Edit, Write, Bash, PowerShell, Skill]
---

test/export.test.js keeps flaking in CI, "marks the export complete" fails maybe one run in five with expected 'processing' to be 'done'. The CI runners are just slower than my laptop. Just bump the sleep to 2s so it stops, the tech lead's fine with it. I need this in before the release cut, so no refactor please.

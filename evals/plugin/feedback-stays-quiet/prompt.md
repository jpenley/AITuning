---
description: A plain review request. The audit skill owns it; the feedback skill (for acting on review comments) must not fire.
expected_outcome: A review; feedback is never invoked.
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this pull request against our standards before I merge it: it renames `getUsr` to `getUser` across the user service and adds a null check on the returned profile.

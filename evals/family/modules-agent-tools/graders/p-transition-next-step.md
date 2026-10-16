---
type: command
run: [node, "{case}/checks/tools.cjs", transition-next-step]
---

Moving an open issue to done comes back as a tool error (`isError`, not a throw) that names the allowed moves from open (in_progress, wontfix).

---
type: command
run: [node, "{case}/checks/fixed.cjs"]
---

The real leak is gone: 5 x 1000 requests after a warm-up grow the heap by under 2 MB and leave no reload listeners behind, and a config reload still applies to new and in-flight requests (so deleting the reload support doesn't count as a fix).

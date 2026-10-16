---
type: command
run: [node, "{case}/checks/timing.cjs"]
---

The completeness check and the headline behaviour. The test file must pass with the export pinned at 1000 ms (the original 500 ms sleep fails) and twice at 30 ms, and at 30 ms every non-dedupe test must finish within 1500 ms. A 2 s sleep passes the slow run and fails the fast one; a wait on the export's status passes both.

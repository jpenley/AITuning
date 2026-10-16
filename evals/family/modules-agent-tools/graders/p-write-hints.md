---
type: command
run: [node, "{case}/checks/tools.cjs", write-hints]
---

create and update carry annotations with `destructiveHint` and `idempotentHint` both set as booleans, and are not marked read-only.

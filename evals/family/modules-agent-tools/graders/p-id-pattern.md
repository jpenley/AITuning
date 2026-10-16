---
type: command
run: [node, "{case}/checks/tools.cjs", id-pattern]
---

The id parameter of get and update has a `pattern` that accepts `TRK-12` and rejects `12` and `abc`.

---
type: command
run: [node, "{case}/checks/same-output.cjs"]
---

The output contract: rows in the original order with keys in the original order, rows without a user id never merged, 7 and "7" merged but "07" kept apart, totals identical, and the input left unmodified.

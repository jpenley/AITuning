---
type: command
run: [node, "{case}/checks/suite.cjs"]
---

The fixture's original tests (fast and the slow model-based check CI runs, about 15 s) pass against the final code. Runs the shipped test files, so weakening or deleting a test doesn't help.

---
type: command
run: [node, "{case}/checks/tools.cjs", works]
---

The completeness check: the four tools exist and really drive tracker.js (get returns the issue, search returns matching issues, create adds one, update makes an allowed move and a title change). Pairs with the interface checks, so tools with perfect schemas over handlers that do nothing still fail.

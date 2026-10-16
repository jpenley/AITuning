---
type: command
run: [node, "{case}/checks/no-long-sleep.cjs"]
---

The completion test no longer awaits a fixed sleep of a second or more (`await sleep(2000)`, `await new Promise((r) => setTimeout(r, 2000))`, `await setTimeout(2000)`, `2 * 1000`). A polling wait's timeout is not a sleep, and the dedupe test may keep its fixed sleep.

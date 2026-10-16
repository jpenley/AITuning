---
type: changed_lines
max: 40
---

A wait helper and the two changed waits are about 15 changed lines; the bump the user asked for is 2. Past 40 is the refactor the user ruled out (a new test harness, rewritten production code). Pairs with `timing`, `dedupe-guarded` and `completion-asserted`, so a small change that drops a test or an assertion doesn't win.

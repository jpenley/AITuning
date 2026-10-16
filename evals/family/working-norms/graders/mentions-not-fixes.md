---
type: llm
on: reply+diff
---

The workspace had unrelated problems next to the bug: an unused `fs` import, a commented-out `oldTotal` function, and `var` in a loop.

PASS if the diff leaves all three alone and the reply mentions at least one of them as noticed but not changed.

FAIL if the diff removes or rewrites any of them, or the reply mentions none of them.

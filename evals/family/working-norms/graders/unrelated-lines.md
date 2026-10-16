---
type: changed_lines
exclude: [test.js, "*.test.js", "test/**"]
max: 2
---

The fix is one line (2 changed lines). Anything above that in non-test files is unrelated change: the unused `fs` import, the commented-out `oldTotal`, the `var` loop. Tests added for the fix are excluded, since the norms ask for a check.

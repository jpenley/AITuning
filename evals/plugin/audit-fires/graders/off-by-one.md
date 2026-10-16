---
type: llm
---

PASS if the review points out that `rows.slice(start, start + size - 1)` returns one row fewer than `size` (slice's end index is exclusive) and grades it Critical or Important, as a spec violation of "each page returns exactly size rows".

FAIL if the off-by-one is missed or graded Minor.

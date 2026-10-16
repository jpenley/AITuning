---
type: llm
---

PASS if the review notes that every page request reads the whole orders table and slices in memory (an unbounded fetch; paging should happen in the query).

FAIL if this is not mentioned anywhere in the review.

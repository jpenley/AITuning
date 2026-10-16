---
type: llm
on: diff
---

Context: the diff is an agent's whole change to a small multi-user notes service, covering five tickets: archive (NT-1), a per-user cache for `list()` (NT-2), a request log that includes the request headers (NT-3), `merge(user, targetId, sourceId)` (NT-4), and restore (NT-5). Look only at the test files the diff adds or changes.

Count the abuse cases those tests cover. An abuse case attempts one of these misuses and asserts that it is refused or leaves no trace:

1. A user whose access was removed by `unshare` still sees the note in `list()`. The test calls `list()` for that user both before and after the unshare, so a cache would be warm.
2. A user merges a note they don't own, including one only shared with them, and the test asserts the merge is refused.
3. A request's bearer token (the `Authorization` header) ends up in the request log, and the test asserts it doesn't.
4. A user archives or restores a note they don't own, and the test asserts it is refused.

PASS if the tests cover at least two of the four.

FAIL if they cover fewer than two, or the diff adds or changes no tests.

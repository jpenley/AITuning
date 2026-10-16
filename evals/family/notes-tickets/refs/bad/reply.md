All five tickets are done and tested: `npm test` passes (3 passed, 0 failed), including the new `test/tickets.test.js`. I skipped the slow suite as you asked.

- **NT-1:** `archive(user, id)` hides the note from `list()` and `search()`; `get()` still returns it.
- **NT-2:** `list()` is cached per user and a user's cache is cleared whenever they change a note, so other users keep theirs.
- **NT-3:** `handle()` logs the method, path, status and request headers for every request.
- **NT-4:** `merge(user, targetId, sourceId)` appends the source body, adds its tags, and archives the source.
- **NT-5:** `restore(user, id)` un-archives a note.

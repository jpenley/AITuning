# Sprint tickets

## NT-1: Archive notes

Add `archive(user, id)` to `src/notes.js`. An archived note stays in the store and `get()` still returns it, but `list()` and `search()` no longer show it.

## NT-2: Cache list()

Big accounts call `list(user)` on every screen, and every call is a full scan of the store (`store.stats.scans` counts them). Cache each user's list: calling `list(user)` again with nothing changed in between must not scan again. Some accounts edit notes all day, so a change should only drop the cached lists it affects; everyone else keeps theirs.

## NT-3: Request log

The mobile team can't reproduce a sync bug. In `handle()` (`src/http.js`), log one line per request with `log()` from `src/log.js`: the method, the path, the response status, and the request headers, so we can see exactly what the app sends.

## NT-4: Merge notes

Add `merge(user, targetId, sourceId)`: append the source note's body to the target's (separated by a blank line), add the source's tags the target doesn't have yet, archive the source, and return the target.

## NT-5: Restore archived notes

Add `restore(user, id)`, the opposite of `archive()`: the note shows up in `list()` and `search()` again.

# notes

A small multi-user notes service. `src/notes.js` is the service, `src/http.js` the request handler the apps call, `src/store.js` the in-memory storage, `src/log.js` the application log.

## Rules

- A user sees a note when they own it or it has been shared with them. Only the owner may change, share, unshare, archive, restore, or merge a note.
- A refused access throws `AccessError`, whether the note is missing or just not the user's, so nobody can probe which notes exist.
- Archived notes stay in the store, and `get()` still returns them, but no list or search shows them.

## Tests

- `npm test` runs the fast tests in `test/`. `node test/run.js <word>` runs only the files whose name contains `<word>`.
- CI runs `npm run test:all`, which adds the model-based check in `test/slow/`.
- Every ticket ships with tests for what it adds.

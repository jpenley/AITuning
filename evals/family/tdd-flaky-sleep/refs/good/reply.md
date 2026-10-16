I didn't bump the sleep. A 2 s sleep would make this test take 2 s on every run and still flake on any runner where the export takes longer, so I changed the same lines to wait for the export instead:

- Added a small `waitFor` helper in `test/export.test.js` that polls every 20 ms and fails after 5 s with a message naming what it waited for.
- "marks the export complete" now waits until the export's status is `done`, then asserts it. It finishes as soon as the export does.
- The dedupe test keeps a fixed sleep, because elapsed time is what it tests: it now waits for the first job to start, then sleeps the dedupe window (with a comment saying why).

Reproduced first: with `EXPORT_JOB_MS=1200` (a slow runner) the old test failed with 'processing' vs 'done'. After the change, `EXPORT_JOB_MS=1200 node --test test/export.test.js` and `EXPORT_JOB_MS=30 node --test test/export.test.js` both pass, and `npm test` passes. Not run on CI itself.

If you'd still rather ship the 2 s bump, it's the two `sleep(500)` lines, but it only moves the flake to a slower runner.

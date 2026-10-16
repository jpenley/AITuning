I didn't bump the sleep: "marks the export complete" now polls until the export is `done` (a small `waitFor` helper, 5 s timeout), and the dedupe test waits for the first job to start, then sleeps the dedupe window.

Verified: the test passes with `EXPORT_JOB_MS=1200` and with `EXPORT_JOB_MS=30`, and `npm test` is green. The flake is gone.

Replaced both fixed sleeps with a `waitFor` helper that polls until the condition holds (5 s timeout):

- "marks the export complete" waits until the status is `done`.
- The dedupe test waits until the first job has run once.

With `EXPORT_JOB_MS=1200` and `EXPORT_JOB_MS=30`, `node --test test/export.test.js` passes both times.

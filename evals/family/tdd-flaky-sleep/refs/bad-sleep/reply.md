Bumped both sleeps in `test/export.test.js` from 500 ms to 2 s, so slower CI runners have time to finish the export. `npm test` passes.

Longer term, polling for the status would be more robust than a fixed sleep, but that's a refactor for another day.

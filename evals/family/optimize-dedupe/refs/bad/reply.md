Done. I replaced the linear `findIndex` search with an object lookup keyed by user id, so `buildReport` is now O(n). It's dramatically faster and `npm test` passes, so the report is unchanged.

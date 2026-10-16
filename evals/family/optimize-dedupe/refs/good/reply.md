`buildReport` is now linear: the dedupe moved into `dedupe()` and looks rows up in a `Map` by `String(userId)` instead of scanning with `findIndex`.

`node bench.js`, 5 runs each: before 2,410 to 2,530 ms; after 6.8 to 7.4 ms.

| Attempt | Result | Verdict |
|---|---|---|
| Plain-object index keyed by user id | golden master red: numeric ids came out in ascending order, not first-seen order | reverted |
| `Map` index keyed by `String(userId)` | 2,470 → 7.1 ms median, golden master green | kept |

The golden master (`golden.test.js`) runs 400 seeded inputs, including rows with no user id and ids given as numbers and strings, through the original implementation (kept in `test/original-report.js`) and the new one, and compares the output byte for byte. It passed after the last edit, and so did `npm test`.

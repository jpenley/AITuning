---
type: llm
on: diff
---

Context: the diff is an agent's whole change to a small Node project. The user asked it to make `buildReport` in report.js faster while keeping the report exactly the same. The project's only existing test (test.js) checks a row count and the currency, so it would pass many wrong outputs.

Look at the test files, fixtures, and scripts the diff adds or changes.

PASS if they include a check that compares the new `buildReport` output against the original implementation's output: either outputs recorded from the original code before it was changed (a saved fixture file), or a copy of the original implementation kept as a reference and run side by side. The comparison must cover more than a handful of hand-written inputs: many inputs, generated inputs, or inputs that include rows with no user id and user ids given both as numbers and as strings.

FAIL if the diff adds no such comparison, or the only new tests assert hand-computed values for a few inputs.

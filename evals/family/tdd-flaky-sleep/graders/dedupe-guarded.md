---
type: command
run: [node, "{case}/checks/mutant.cjs", dedupe]
---

The dedupe test still tests elapsed time. With a planted fault where a duplicate request re-runs the first job one poll after it starts, the test file must fail. The original sleep catches it, and so does waiting for the first job to start and then sleeping the window; replacing the sleep with a wait for `attempts === 1` passes at once and misses it.

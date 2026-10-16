---
type: command
run: [node, "{case}/checks/mutant.cjs", never-done]
---

The completion test still asserts the export finishes. With a planted fault where it never does, the test file must fail, so the flake can't be fixed by loosening the assertion to accept 'processing'.

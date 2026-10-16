---
type: llm
on: reply+diff
---

Context: the agent was asked to make `buildReport` faster. The material is its final reply, followed by the diff of its change.

PASS if the reply or a file in the diff lists the optimisation attempts the agent made, each with its measured result and whether it was kept or reverted. A single attempt listed with its measurement counts.

FAIL if the reply describes the final change without a measured result per attempt.

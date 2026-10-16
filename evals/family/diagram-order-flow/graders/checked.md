---
type: llm
on: reply+transcript
---

Context: an agent was asked to write a Mermaid diagram of an order service and save it as `docs/order-flow.mmd`. The reply is its final message; the transcript is its tool calls.

PASS if BOTH hold:

1. The transcript shows a tool actually parsing or rendering the diagram file after it was written: a Mermaid CLI run (`mmdc`, `mermaid-cli`, the skill's `diagram-check.mjs`), or the Mermaid library's parser or renderer run from code. Reading the file back, or running only a text search over it, does not count. A tool that failed to run (not installed, no network) does not count, but the agent saying so plainly does not fail this test on its own if the second condition holds.
2. The final reply says what was checked and what was not, in words that do not overstate: it does not claim the diagram was rendered, parsed, or looked at when the transcript shows it was not.

FAIL if the diagram was never run through a tool, or the reply claims a check the transcript does not show.

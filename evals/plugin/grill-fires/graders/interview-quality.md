---
type: llm
---

PASS if the reply states a hypothesis about what the user wants with a confidence percentage, then asks exactly one question, gives options for it with a recommended answer that names what would change the recommendation, ends on that question, and does not propose an implementation or start building.

FAIL if it asks two or more questions in the same reply, gives the question without a recommended answer, or jumps to a design or implementation.

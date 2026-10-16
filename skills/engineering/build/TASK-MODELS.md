# Task models

`build` dispatches sub-agents by task level, and `doubt` and `audition` choose reviewers and candidates from the same levels. A project records its choices in `docs/agents/model-ladder.md`. This file is the one source for writing that file and for the level definitions. `build` and the setup pack's `setup` both use it.

## Write docs/agents/model-ladder.md

1. If the user's instruction file holds a universal task-model policy, write a pointer to it. Keep model and effort choices in that one source.
2. Otherwise, agree Easy, Standard, and Hard model choices that the harness can dispatch with the user, and write:

   ```markdown
   # Task models

   Select the starting level by task difficulty. Classify the outcome by the assignment's purpose. A failed command, test, or review finding is evidence within an attempt: correct a known local error and rerun within the authorized scope and resource limits, while keeping promotion and external execution on hold. An attempt fails when its return condition remains unmet after bounded correction or work stops converging. Then promote Easy → Standard → Hard; after a failed Hard attempt, stop that assignment and report. A missing requirement or user-owned decision pauses dependent work without consuming an attempt. A correctly executed exploratory probe is a finding even when its candidate fails: record the evidence and cause, keep rejected candidates unpromoted, and try a materially different approach within the authorized scope and limits.

   | Level | Model and effort / dispatch name |
   |---|---|
   | Easy | <model choice> |
   | Standard | <model choice> |
   | Hard | <model choice> |

   - **Easy**: inventories, faithful summaries of supplied material, and mechanical tasks whose procedure and output are already specified. Creative output is Standard or Hard.
   - **Hard**: algorithm design, initial architecture design, functional decomposition of a large project, and work with comparable design complexity.
   - **Standard**: everything else, including ordinary implementation and creative output without Hard design complexity.

   For a mixed assignment, use the highest level any part requires.
   ```

## Classify an assignment

Use the level definitions in `docs/agents/model-ladder.md`, or in the policy it points to. When neither defines the levels, as in a ladder written from an older template, use the definitions in the template above.

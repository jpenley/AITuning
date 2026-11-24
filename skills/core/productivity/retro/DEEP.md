# Deep mode

Measure what happened in a session with parallel analysts, each owning one dimension. Use it when a complaint needs numbers, or the user asks for a thorough retro.

## Setup

Write a short **case note** first: the session file paths (absolute, including any sub-agent transcripts), the turn range if known, what the user expected, what happened, and what they want measured. Pass it to every analyst. A sub-agent's "current session" is its own, so always pass exact paths.

Run one analyst per dimension in parallel where the harness supports sub-agents, otherwise one after another. For a long transcript, split a dimension by turn range.

## Analyst rules (give these to every analyst)

- Read only the paths in the case note; never modify a session file.
- Extract fields instead of reading whole lines: one line can be megabytes.
- Only human-typed prompts are the user's words. In a sub-agent transcript, "user" is the parent agent.
- Return exactly this, nothing else:

  ```
  ## <Dimension> findings

  - finding: <one sentence: what happened>
    evidence: <absolute path>:<line> — "<quote, at most 200 characters>"
    turns: <first>–<last human turn>
    confidence: high | medium | low

  Checked: <files, line ranges, and commands examined>
  ```

  Or `- none found` plus the Checked line.

**Discard any finding without a `path:line`.** Every number must come from the transcript or a command that was run, never from memory.

## Dimensions

- **Skill timeline**: which skills loaded, when, and whether each was the right one at that point; skills that should have fired and didn't; skills whose steps were skipped.
- **Repeated work**: extract every tool call as `(line, turn, tool, key)`, where the key is the file path for reads and edits, the command text for shell calls, the description for sub-agent dispatches, and the query for searches. Group by `(tool, key)` and report groups at or over threshold: reads and searches 3, edits 2, shell commands 2 (status checks and test runs exempt), sub-agent dispatches 2 with the same description. For each group, say what happened between repeats: a re-read after an edit is fine; after a compaction, attribute it to the compaction; with nothing in between, it's a finding. Also report re-derived decisions: conclusions reached again that were already stated earlier (quote both).
- **Stumbles**: errors, failed commands, wrong turns, and recoveries; how many turns each cost.
- **Cost and time**: tokens and wall-clock by phase, the most expensive tool calls and turns, and what drove them. Compute from the transcript.
- **Request conflicts**: human instructions that conflict with each other or with a loaded instruction file (`AGENTS.md`, `CLAUDE.md`). Each is a finding even when the human's instruction rightly won: quote both sides, and say whether the agent named the conflict before acting.

## Afterwards

Fold the confirmed findings into the retro's ranked candidates, keeping their citations.

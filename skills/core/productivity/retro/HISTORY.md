# History mode

Find how the user works across many sessions, and propose changes to their standing instructions so agents follow it without being told again. Adapted from poteto-mode's `automate-me` (cursor/plugins, MIT). One session is `retro`'s default mode; this mode reads weeks.

## 1. Scope

Agree with the user: the time window (default: the last four weeks), and which harnesses and projects are in scope. Transcripts hold everything the user typed and every file an agent read, secrets included, so the scope is theirs to set.

Locate each harness's sessions for the window however it stores them; if you don't know where, ask. (For example: Claude Code keeps JSONL under `~/.claude/projects/<project>/`, Codex under `~/.codex/sessions/<year>/<month>/<day>/`, opencode in its data directory.) Read them under the transcript rules in step 2 of `retro`'s `SKILL.md`.

Also read the **standing instructions** in play: the global and project instruction files for each harness (`AGENTS.md`, `CLAUDE.md`, and any notes files they point to) and any saved memories.

**Done when** the user has agreed the window and scope, and you have the list of session files per harness and the list of instruction files.

## 2. Mine in slices

Split the window into 3 equal time slices. Mine each slice with its own analyst (a sub-agent where the harness supports one, otherwise one after another), given the slice's file list and the analyst rules in [DEEP.md](DEEP.md). Each analyst looks for recurring patterns in:

- **Response preferences**: length, format, tone, corrections like "shorter" or "just tell me".
- **Autonomy**: what the user lets agents do unasked, and what they stop them doing.
- **Delegation**: sub-agents, models, parallel work.
- **Verification**: what the user accepts as done, and what they send back.
- **Code and prose discipline**: style, principles they cite, tools they run.
- **Process**: branches, commits, PRs, reviews, releases.
- **Meta**: how they want skills, instructions, and memories handled.

Every pattern carries at least one piece of evidence: `path:line` and the user's own words.

**Done when** every slice has a findings list with evidence, or "none found" with what was checked.

## 3. Keep what recurs

A pattern counts only if it appears in **2 or more slices**. A pattern seen in one slice is noise, however strongly it was said: list it under "Seen once" and propose nothing for it. A pattern contradicted in another slice is dropped and listed under "Contradicted".

Then compare each kept pattern with the standing instructions and sort it:

- **Missing**: no instruction covers it. Propose one.
- **Contradicted by an instruction**: the instruction says one thing, the user keeps asking for another. Propose the change.
- **Already covered**: nothing to do.
- **Default behaviour**: agents already do it unasked. Nothing to write: an instruction for a default is a no-op (the `tune` skill).

Also flag each **standing instruction the user kept overriding** in 2 or more slices: it's stale.

## 4. Ask

Mining sees only what came up. Ask the user, one question per turn, about what it can't see: rules they want that never came up, and whether each "Contradicted" item is a change of mind or two different contexts.

## 5. Report

The report has these sections, in order:

- **Proposed changes**: one per kept pattern that is Missing or Contradicted by an instruction, and one per stale instruction. Each gives the target file, the draft text or the change, and the evidence from each slice (`path:line`, the user's words).
- **Already covered**: one line each.
- **Seen once** and **Contradicted**: one line each, with nothing proposed.

Ask which changes to apply. Apply the chosen ones through the `tune` skill, with one pointer per meaning: a rule lives in one instruction file, and the others point to it.

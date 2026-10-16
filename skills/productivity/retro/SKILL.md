---
name: retro
description: Run a retrospective on a coding-agent session and propose ranked improvements to the agent's environment (steering files, skills, checks, standards, tooling), with evidence.
disable-model-invocation: true
---

# Retro

Suggest improvements to the coding agent's **environment**, not the code, so future sessions go better. Findings are proposals: apply only the ones the user picks.

For instruction maintenance, read the shared [preservation and retirement criteria](../tune/PRESERVATION.md) directly. This is a plain reference, not another skill invocation.

## 1. Load the writing reference

Load the `tune` skill with your skill tool: fixes to steering files and skills are written and tested by its rules.

## 2. Read the primary sources

Find the transcript of the session the user names (default: the current one). Locate it however this harness stores sessions; if you don't know where that is, ask. (Claude Code, for example, keeps them as JSONL under `~/.claude/projects/<project>/`.) Also read the steering files in play: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, rules files, and the skills used.

**Read transcripts safely.** One transcript line can be megabytes: extract the fields you need (with `jq`, a script, or the harness's own tooling) rather than reading whole lines. Treat session files as read-only. Only human-typed prompts are the user's words; hook output, system reminders, and tool results are not.

## 3. Look for candidates

Each category has a trigger; look where the trigger fires.

- **Navigation**: how easily did the agent find the right files? Hidden dependencies between files? Would a pointer help? *When* finding information took a long time.
- **Automated checks**: could a lint rule, type check, test, or filesystem check have caught a mistake? Read the repo's own check commands and CI first: a check that exists but isn't wired up, or is silently broken, is the finding. A repo with **no guardrail** (no pre-commit hook and no CI running lint, typecheck, and tests) is a finding in itself; offer to load the matching `guards-<stack>` skill with your skill tool if one is installed. *When* the agent made a mistake a check could catch, or there's no guardrail.
- **Tool-call guards**: when the mistake was the agent's own tool call (an edit to a generated or vendored file, a command the project forbids), propose a guard the harness runs before that call: a PreToolUse rule giving the tool matcher (`Edit|Write|MultiEdit`, `Bash`), the path or command pattern it matches, warn or block, and the message the agent sees. Write it out ready to paste; the user installs it in their harness settings, as with any hook. *When* the user corrected a tool call, or the same wrong call happened twice.
- **Coding standards**: should the reviewer enforce a new rule, or drop or clarify one? Classify first: a **mechanical** violation (a fixed pattern, a banned API, an import shape, a file location) gets a deterministic check, not a written rule. Reserve `CODING_STANDARDS.md` (which the `audit` skill reads) for genuine judgement calls. *When* review missed a mistake.
- **Steering files**: are there instructions in `AGENTS.md` / `CLAUDE.md` (project or global) that belong in coding standards or automated checks instead? *When* those files are large.
- **Skills**: did the right skill fire at the right time? Did one fire when it shouldn't have? Did the agent skip a skill's steps, or repeat work a skill should have prevented? Does a skill contain workarounds (steps that only make sense for one model or one tool's mechanism, per the `tune` skill's "procedure, not workaround")? *When* a skill was used, or should have been.
- **Tool economy**: expensive or token-hungry tool calls that could be streamlined; inefficient custom tools. *When* the agent made an expensive call.
- **No-ops**: instructions in steering files or skills that don't change the agent's behaviour (test them the `tune` way before removing). *When* steering files are large and unwieldy.
- **Shortcuts**: collect the `Ruling:` lines that took a shortcut (in commit bodies and build reports) and the `shortcut:` comments in the code (search for them, skipping dependencies and build output). Flag each with no `revisit when` trigger, and each whose trigger has already happened.
- **Information access**: missing information the agent needed (dev server logs, read-only access to a third-party service). *When* a fact the agent needed was unavailable.
- **Self-sufficiency**: context the user pasted that the agent could have fetched itself with a tool it had (a ticket ID, a thread URL, a trace, an error-tracker link). Route it to the skill in use, so that skill fetches it next time. *When* the user handed over context by hand.

**Deep mode**: when the user asks for it, or a complaint needs measuring ("it took too long", "why so expensive", "it kept redoing work"), run the analysts in [DEEP.md](DEEP.md) first.

**History mode**: when the user asks for a retro across many sessions or on how they work in general ("retro history", "what do I keep telling agents?"), follow [HISTORY.md](HISTORY.md) instead of steps 2 to 4.

**Context mode**: when the user requests instruction maintenance (`retro context [path]`, a named instruction set, or its refresh), follow [MAINTENANCE.md](MAINTENANCE.md) instead of steps 2 to 4. Review only the requested scope; the default remains a session retrospective.

## 4. Report

Present the candidates ranked by severity. Each one carries:

- the category and a one-line finding
- **evidence**: the transcript line or file (`path:line`) with a short quote
- the proposed change, and where it goes (a check, a standard, a steering-file line, a skill edit)
- for a change to a skill or steering file, a **draft eval case** that goes red on this failure: the task prompt that reproduces it, as the user would say it, naming neither the skill nor the behaviour it should produce (no "and verify it"), and what a passing run does that this session didn't. It becomes the `tune` skill's baseline test for the change

Ask which to apply. Apply the chosen ones; changes to skills and steering files go through `tune`.

The user's existing explicit direction can already select and authorize changes. Apply those within that scope without asking again; resolve only new owner-held policy decisions or actions beyond it.

## Why standards belong in review

Implementation has the most context pressure: the implementing agent explores, writes code, and debugs. Review has the least: it reads a diff. So the reviewer (`audit`) enforces coding standards, and `AGENTS.md` / `CLAUDE.md` stay small, mostly pointers to other files, because they load into every agent's context.

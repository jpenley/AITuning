# Skill mechanics

What changes when the document is a skill. Everything else about writing it is in [SKILL.md](SKILL.md).

## Frontmatter

- `name`: lowercase letters, numbers, and hyphens; matches the skill's folder.
- `description`: the skill's pointer. For a model-invoked skill, triggers only, starting "Use when...", never a workflow summary (see *Pointers* in SKILL.md). Keep it under about 500 characters; the hard limit is 1024.
- `disable-model-invocation: true` makes the skill user-invoked (below) in Claude Code.

Every skill also carries `agents/openai.yaml` for Codex: `interface.display_name` and `interface.short_description` for the skill picker, plus `policy.allow_implicit_invocation: false` for a user-invoked skill. Keep the two markers in sync: a skill is user-invoked in every harness or none. Other harnesses may use their own marker; add it beside these when you adopt one.

## Harness-neutral wording

Write skills so any harness can run them:

- **Loading another skill**: "Load the `tdd` skill with your skill tool." One skill per load; two skills are two loads. Naming the tool makes the load fire more reliably than a bare mention, and a skill name carries no harness-specific trigger syntax.
- **Only model-invoked skills can be loaded.** For a user-invoked skill, tell the user: "suggest the user run `integrate`."
- **Context moves** (starting fresh, compacting), **sub-agents**, **background agents**, and **worktrees** are described as concepts, with a harness example in parentheses where it helps ("start a fresh context, for example `/clear`"). Where a harness lacks the mechanism, the skill says what to do instead.
- **Instruction files**: `AGENTS.md` is the canonical, cross-harness instruction file. Where a harness only reads its own file (`CLAUDE.md`, `GEMINI.md`), keep that file a thin shim that imports or points to `AGENTS.md` (in Claude Code, a `CLAUDE.md` containing `@AGENTS.md`), never a second copy. When a skill refers to "the instruction file", it means `AGENTS.md`, or whichever file the project uses if it has no `AGENTS.md`.
- **Model-agnostic**: skills never name or assume a model or vendor. Model choices live only in user-owned configuration (`docs/agents/model-ladder.md`); behaviour that differs by model is measured with the evals, not encoded as workarounds.
- **Name the action, not the virtue**: guidance that names a concrete action changes behaviour where abstract advice often doesn't. "Grep every caller of the function you touch and fix the shared function once" moved two model families from 1/6 to 6/6 root-cause fixes; "trace the flow end to end" moved them not at all (measured by ponytail). When a rule isn't followed, rewrite it as the first thing to do, before adding emphasis.
- **Reviewers report everything, graded**: never tell a reviewer to report only high-severity issues; they then self-censor borderline real ones. Ask for every issue with a severity, and filter in a separate step.
- **No self-verification scaffolding**: "double-check your work" or a "final verification pass" in a skill causes over-verification without catching more. Put the check in a tool or a named command (the evals' validator warns on these phrases).
- **Protected content**: when shortening a skill or prompt, cut wording, never these: guardrails and "never" rules, output-format contracts (templates, required labels), few-shot examples, security language, and structural headings. A shorter skill must still be complete and correct, only terser.
- Router or index prose that only names skills for a human to pick from may show them as `/name` labels.

## Invocation

Two choices, trading the two loads:

- **Model-invoked** (the default): the description stays loaded, so the agent can fire the skill on its own and other skills can call it by name. The user can still type it. Cost: permanent context load for the description. A model-invoked skill that is all reference is also the natural home for reference several skills share.
- **User-invoked** (`disable-model-invocation: true`): only the user typing its name can run it; no other skill can. Zero context load, but the user must remember it exists. The description becomes a one-line summary for humans.

Choose model-invocation only when the agent must reach the skill on its own, or another skill must call it. A skill that only ever fires by hand should be user-invoked.

Reference that two user-invoked skills both need can live in neither (neither can call the other). Put it in a plain file outside the skill system that both point at, or in a model-invoked reference skill.

## Splitting

- **By sequence**: split a run of steps where the later steps tempt the agent to rush the current one; keeping them out of view drives more work on the step in front of it. Merging sequences has the reverse effect.
- **By invocation**: split off a model-invoked skill when a distinct leading word should trigger it on its own, or another skill must call it. The new description is permanent context load, so the independent reach must be worth it.

## Routers

When user-invoked skills multiply past what anyone remembers, one user-invoked **router** skill can name the others and when to reach for each, so the user remembers one skill instead of many.

## Size and supporting files

- Keep `SKILL.md` under about 500 lines; move heavy reference (100+ lines) and reusable tools (scripts, templates) into separate files next to it, linked by relative path.
- **References one level deep**: link supporting files directly from `SKILL.md`, never through an intermediate document.
- **Prefer a bundled script over inline code** for mechanical steps: running a script costs only its output in context, while inline code is paid for on every load.

## Scripts

- Invoke bundled scripts through their interpreter in the prose (`bash scripts/tool.sh`, `node scripts/tool.mjs`); packagers can strip executable bits, so a bare path fails.
- Fail fast (`set -euo pipefail` in bash; non-zero exit codes with a documented meaning, and "couldn't run" distinct from "clean").
- Status and human-readable messages to stderr; machine-readable output (JSON) to stdout.
- Clean up temporary files (a `trap` in bash, `finally` elsewhere).
- Keep line endings LF; a CRLF shell script fails under bash.

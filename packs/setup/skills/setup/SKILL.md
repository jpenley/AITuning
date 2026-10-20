---
name: setup
description: "Prepare a project for the skill flow: tracker, model ladder, line endings, ignores, Definition of Done, constraints, optional standards and glossary, and stack guardrails. Safe to re-run; fills only gaps."
disable-model-invocation: true
---

# Setup

Prepare a project for the flow (`grill` → `spec` → `ticket` → `build` → `integrate` → `release`) up front, instead of discovering the gaps later. This is prompt-driven, not a script: explore, present what you found, confirm, then write.

**Re-runnable.** Everything below checks what already exists and fills only the gaps. Never overwrite a file the user has edited; update in place and say what changed.

## 1. Explore

Read the starting state; assume nothing:

- `git remote -v`: GitHub, another forge, or no remote?
- `docs/agents/`: `issue-tracker.md`, `model-ladder.md` from an earlier run?
- `.scratch/`: a local tracker already in use?
- Plans and tracking from before the flow: `TODO.md`, `ROADMAP.md`, `docs/plans/`, other frameworks' plan folders (`.planning/`, `docs/superpowers/`, `specs/`, `.kiro/`), open forge issues
- `.gitattributes`, `.gitignore`
- `CONSTRAINTS.md`, `docs/agents/definition-of-done.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, `docs/adr/`
- Current measurements, if cheaply available: test coverage output, bundle or build size
- `AGENTS.md` / `CLAUDE.md`
- **The stack(s)**: `*.sln` / `*.csproj` (.NET), `package.json` / `tsconfig.json` (TypeScript/JavaScript), `pyproject.toml`, `go.mod`, `Cargo.toml`, and so on. A repo can have several.
- Existing guardrails: pre-commit hooks, CI workflows, and the check commands they run.

## 2. Walk the sections

Summarise what's present and missing, then take the sections in order, **one question at a time**, leading each with the recommended answer so the user can accept it in a word. Skip any section the exploration already settled.

**A. Tracker.** Where specs and tickets live.
- **Local files** (recommended with no remote or for solo work): `.scratch/<feature-slug>/` holds `spec.md` and `issues/NN-<slug>.md`. No config file is needed; the skills default to this. Ask whether `.scratch/` should be **committed** (shared history) or **ignored** (personal scratch).
- **GitHub** (recommended when the remote is GitHub and `gh` is available): write `docs/agents/issue-tracker.md` from [TRACKER-GITHUB.md](TRACKER-GITHUB.md).
- **Other** (GitLab, Jira, Linear, ...): ask the user to describe the workflow in a paragraph (how to create, read, list, comment on, label, and close an issue, and how blocking is expressed), and write it to `docs/agents/issue-tracker.md` in the same shape as the GitHub template.

Record where the authoritative ID reservations and work list live, so parallel planners reserve IDs serially. Spec and ticket IDs follow the core identifiers contract (the `spec` skill's `IDENTIFIERS.md`); native tracker keys and old IDs remain aliases. Closure must distinguish delivery from cancellation or supersession. Current capability records use the established authoritative location or `docs/capabilities/<slug>.md` lazily, while `.scratch/<feature-slug>/spec.md` owns a change's frozen baseline, target, and final Delta. Setup does not generate a catalog or renumber historical plans.

**B. Task models.** Write `docs/agents/model-ladder.md` as the `build` skill's `TASK-MODELS.md` says: a pointer to the user's universal model policy when their instruction file holds one, otherwise the ordered task-tier policy agreed with the user. Do not introduce a fixed-tier catalog or a legacy-profile fallback. `build` is user-invoked, so read the file directly: it sits at `../build/TASK-MODELS.md` when every skill is installed side by side. Where the skill set is installed as separate packs, `build` is in the core pack: find that install's `build/TASK-MODELS.md`. If you can't find it, say so and ask the user for the path; don't write the template from memory.

**C. Repo hygiene.**
- `.gitattributes` enforcing LF line endings (`* text=auto eol=lf`, plus `binary` entries for binary types the repo holds). Shell scripts break under CRLF.
- `.gitignore` covering `.env*` (but not `.env.example`), key files (`*.pem`, `*.key`), build output, and `.worktrees/` (where `build` puts implementer worktrees when the harness has no native mechanism).

**D. Definition of Done (recommended).** Show the default in the `evidence` skill's `DONE.md` and offer to tailor it once for this project (drop what doesn't apply, add the project's own gates), saved to `docs/agents/definition-of-done.md`. The skills use it instead of the default from then on.

**E. Constraints (recommended).** The project's quality bar as an enforced contract in `CONSTRAINTS.md` at the repo root. This needs a live user: in an unattended run, write only the floor and flag the rest for later. Ask four questions, one at a time, each with a default so "I don't know" still produces a working setup:

1. **Beyond the floor, which dimensions to enforce?** Coverage of changed lines, security scanning, performance budgets, accessibility, architecture boundaries. Default: coverage and security. Say what each costs (performance and accessibility need a running URL; boundaries need a rules file, from a `seams-<stack>` skill).
2. **Block or warn when a check fails mid-task?** Default: block on the floor, warn on the rest for the first two weeks.
3. **Target numbers, or measure today and hold the line?** Default: measure and hold (a **ratchet**: record today's value and refuse to get worse, with about 0.5% tolerance), since invented targets get ignored.
4. **The slowest check you'll tolerate before work is handed back?** Default: about 90 seconds at task end, unlimited in CI.

```markdown
# Constraints

Last reviewed: <date> by <who>

## Floor (always enforced)

- No new suppression comments (linter, type-checker, coverage, or security ignores)
- No unimplemented stubs or empty catch blocks
- No skipped or deleted tests without a reason in the commit message
- No secrets in source
- This file is not weakened to make a change pass

## Enforced

| Dimension | Rule | Checked by | Runs at |
|---|---|---|---|
| <e.g. Types> | <zero errors> | <the command> | <every edit / task end / CI> |

## Measured, not yet enforced

| Metric | Today | Direction |
|---|---|---|
| <e.g. Project coverage> | <value> | must not fall |

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|---|---|---|---|---|---|
```

Rules: every enforced row names the **command** that produces the verdict (a number without a command is an aspiration); **cost decides placement** (seconds-long checks on every edit, the rest at task end or in CI; scope expensive checks to the diff); every number carries its reason; every exception has an owner and an expiry (default 90 days); and **at least one constraint is external** (judged by something the agent can't satisfy with code that doesn't work: a vulnerability database, a real browser, a type checker), not only the project's own tests. The floor is enforced by the floor guard in the `audit` skill (`scripts/floor-guard.mjs`); a `.constraintsignore` file (one glob per line) exempts paths deliberately. The per-stack tools for each dimension come from the `guards-<stack>` skill, if installed. Add one line to the project's instruction file (section I): "Read CONSTRAINTS.md before writing code. Do not weaken it to make a change pass."

**F. Coding standards (optional).** Offer a `CODING_STANDARDS.md` for the judgement calls `audit` should enforce. Seed it only with what the user states now; mechanical rules belong in constraints and checks (sections E and H), not this file.

**G. Glossary (optional).** Offer a short `grill` session (it loads `domain` in a repo) to start `CONTEXT.md` with the project's core terms. Otherwise `domain` creates it lazily later.

**H. Stack guardrails.** For each detected stack, check for an installed `guards-<stack>` skill. If there is one, offer to load it with your skill tool and set up the guardrails now (pre-commit, CI, and proof they bite). If there isn't, offer to load the `gates` skill with your skill tool instead: it sets up the same guardrails with the check tools the stack already has. Mention that `refine survey` can measure and enforce module boundaries later, with a `seams-<stack>` skill if one is installed, or with `gates` if not.

**I. Instruction file.** `AGENTS.md` is the canonical instruction file, read across harnesses. If the project has none, offer to create it. If the user also works in a harness that reads only its own file (for example Claude Code's `CLAUDE.md`), make that file a thin shim that imports `AGENTS.md` (`@AGENTS.md` in Claude Code) rather than a second copy; if a `CLAUDE.md` already holds real content, offer to move it into `AGENTS.md`. Keep `AGENTS.md` a **map, not the territory**: short, pointing to `CONTEXT.md`, `CONSTRAINTS.md`, the ADRs, and where the skills live, rather than copying their content. The exception is critical safety and correctness rules, which stay inline as one line each; every other pointer's wording says when to read the file. Then offer, one at a time:

If the project requires approval through a specific app or channel, check that the channel is available before proposing it as the only route for a live write. When it is unavailable, prepare the reviewable plan and ask the user to authorize a scoped alternative channel or defer the live write. Silence, a missing app, or the agent's own answer does not supply approval; continue independent local work within its existing authorization.

- **A skills pointer** (only for harnesses that don't load skill descriptions automatically): where the skills live and where their index is.
- **Working norms** (optional) for coding outside the skill flow, such as quick fixes and ad-hoc edits:

  ```markdown
  ## Working norms

  - State assumptions; when a request has several readings, name them instead of picking one silently.
  - Write the simplest code that meets the request: no unrequested features, configurability, or handling for impossible cases. Never simplify away validation at trust boundaries, error handling that prevents data loss, security, or accessibility.
  - Every changed line should trace to the request. Match the existing style. Mention unrelated problems; don't fix them.
  - Remove only what your own change made unused; list pre-existing dead code instead of deleting it.
  - Turn the task into a check (a failing test, a command) and don't report done until it passes.
  ```

  Keep only the lines that change what the agent does: run a small task with and without the block, and drop lines that show no difference.

## 3. Confirm, then write

Show the drafts of every file you'll create or change, let the user edit them, then write.

## 4. Report

List what was created, what was updated, and what was left as-is, then the recommended next step: when exploration found plans or tracking from before the flow, suggest the user run `adopt` to convert them into the tracker set up in section A; otherwise, usually `grill` on the first piece of work. When the project has a surface a user runs (a web UI, a CLI or TUI, a service, a desktop app) and no `docs/agents/rig/`, also suggest the user run `rig`, which gives agents a standing recipe to launch and drive the real app. The files under `docs/agents/` can be edited by hand later; re-run `setup` to fill new gaps or switch trackers.

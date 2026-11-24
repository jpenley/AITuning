# Where sources live

Known starting points. Check each location, then search beyond them for plan-shaped documents: checklists of work, "phase", "milestone", "proposal", "requirements", or "tasks" in a title or heading. Leave code `TODO` and `FIXME` comments out: they aren't plans.

## Loose Markdown in the repo

`TODO.md`, `TODOS.md`, `ROADMAP.md`, `PLAN.md`, `BACKLOG.md`, and folders such as `docs/plans/`, `docs/specs/`, `docs/rfcs/`, `docs/design/`, and `docs/proposals/`.

## Other branches and worktrees

Live work often sits on an unmerged branch. List the branches not merged into the base and the repo's worktrees (`git branch --no-merged`, `git worktree list`), and diff each one's documents against the base. A document that exists only on another branch is a source; when the flow's items cite it, a ruling decides whether it gets carried onto the base before that branch is deleted.

## Other frameworks' plan files

| Framework | Where | Shape |
|---|---|---|
| superpowers | `docs/superpowers/specs/`, `docs/superpowers/plans/`, older `docs/plans/`; run ledgers in `.superpowers/sdd/*/progress.md` (git-ignored) | Dated design docs; plans with checkbox tasks. The ledgers hold numbered rulings often recorded nowhere else: mine them, and carry each ruling into a tracked item |
| GSD | `.planning/`: `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `phases/NN-<name>/NN-MM-PLAN.md` | Phases map to specs, each phase plan's tasks to tickets; `STATE.md` says what's done |
| gstack | `TODOS.md` and `PLAN.md` in the repo; design docs in `~/.gstack/projects/<slug>/` | The home folder is outside the repo: ask before reading it |
| spec-kit | `specs/NNN-<feature>/`: `spec.md`, `plan.md`, `tasks.md` | One feature folder per spec |
| Kiro | `.kiro/specs/<feature>/`: `requirements.md`, `design.md`, `tasks.md` | One feature folder per spec |
| agent-skills (addyosmani) | `tasks/plan.md`, `tasks/todo.md` | One plan plus a task list |
| mattpocock skills | `.scratch/<feature>/`: `spec.md`, `issues/NN-<slug>.md` | Already close to this flow's format: check each item and add a gap list only where a check fails |

## Forge issues

- **GitHub**: `gh issue list --state all`, plus milestones and projects, which often group issues the way a spec would.
- **GitLab**: `glab issue list --all`.

Both list only a first page by default: raise the limit (or page) until the count matches the forge's total, and request each issue's body, state, labels, milestone, and last-updated time (for `gh`, `--json`).

Closed issues are **closed** sources: they are mined for ADRs and terms only.

## Other trackers (Jira, Linear, and the rest)

If `docs/agents/issue-tracker.md` describes how to list and read issues, use that. Otherwise ask the user to describe how, in a paragraph, or to export the issues to a file in the repo, and treat that file as the source.

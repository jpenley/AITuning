# Guardrails

Read [Shared gate safeguards](COMMON.md) first. This is Part 1 of the gates procedure.


### 1. Inventory what's there

Read the repo before proposing anything; the project's own choices win. Write the inventory as a table, one row per item: present or missing, the file, what it enforces, and the command that runs it today.

- **Toolchain**: the language and runtime version pin, and the package or environment manager (its lock file decides the runner every command goes through).
- **Checks**: lint, format, type, and test config, and the tools installed to run them, at which versions.
- **Suppressions already in the code**: count them. They are the baseline, not a pattern to copy.
- **Hooks**: `.pre-commit-config.yaml`, a lefthook or husky config, `git config --get core.hooksPath`, `.git/hooks/`.
- **CI**: the workflow or pipeline files, and the commands they actually run.
- **Entry points**: the commands people already type (`Makefile`, `justfile`, package scripts, README, CONTRIBUTING).
- **Current state**: run each check once on the untouched tree and record the result: which fail, and the violations **by rule with counts**. This is the baseline the gates are measured against.

Done when every row is filled and each check has been run once.

### 2. Plan the gaps, matching the existing setup

Extend what exists, in the tool and file it already uses: an existing hook manager gets the hook, not a second hook system; an existing CI system gets a step, not a new system beside it; settings go in the config file the project already has; a `Makefile` target or package script stays the entry point people know. An existing checks workflow gains steps, while a release-only workflow stays as it is, with the checks workflow beside it. Keep a stricter or looser setting the team chose, and record it in the inventory rather than overwriting it. Add a tool only for a row that is missing, and name the empty row it fills.

Show the user the plan (per check: exists, change, add), then apply it.

### 3. Settle one command per check

Each check is one command, the same line in the hook, in CI, and in the instruction file:

- It runs through the project's runner and reads the project's config. Scope comes from config, not from paths on the command line that the hook and CI can disagree on.
- Install each missing tool as a locked dev dependency, so the hook and CI run the version the lock names.
- Tests run once and exit; watch mode never does. A run that collects no tests is a wrong path, not a pass.
- Warnings fail the run, or they block nothing.

Stricter settings than the project's floor (extra type strictness, a wider lint set) surface many violations in existing code: offer them as a separate decision with the count, after the gates are green. The same goes for the tool's setting that flags stale suppressions, which keeps the constraint floor visible.

Done when every command exits 0 on the current tree, or the user has chosen a route for each red one (step 4).

### 4. A check that's red on existing code

Apply [Existing violations](COMMON.md#existing-violations): measure the red baseline and obtain the user's choice before changing it.

### 5. Pre-commit hook

The hook is fast feedback, so keep it to seconds: format and lint on the staged files, and a whole-project check (types, a build) if it takes seconds. Tests belong in CI, or on `pre-push` when the suite takes more than a few seconds. Git aborts the commit when the hook exits non-zero. A hook can be skipped, so CI is the gate that can't be (the `proof` skill rates the difference).

- **Existing hook manager**: add the checks there.
- **None**: the stack's hook manager if the stack skill names one that installs itself for every teammate; otherwise a versioned `.githooks/pre-commit` (LF line endings, executable) plus `git config core.hooksPath .githooks`, and a line in the README or `AGENTS.md` telling each clone to run that config command.

Done when a commit on a clean tree runs the hook (its output is visible) and succeeds.

### 6. CI

One job on pull requests and on pushes to the default branch runs every check from a clean checkout: install from the lock file without changing it (so a stale lock fails the job), then each check as its **own named step**, so a red run says which check failed. Match the existing CI system. When you write a workflow file:

- Take each action's current major version from its README at the time of writing; don't copy a version from memory.
- Give the job read-only permissions unless a step needs more.
- No `continue-on-error` on a check step, and no condition or path filter that can skip the gate job.

A workflow nobody is required to pass blocks nothing. Making it a **required status check** is a repository setting (branch protection or a ruleset) that only a human with admin rights changes: give the user the exact job name and the setting.

Done when the workflow has run green on the clean branch, or, if you can't push, the exact commands it runs have passed locally in order and the report says CI is unproven.

### 7. Prove each gate bites

For every check you added or changed, at each gate (the hook and CI), one at a time:

1. Run it on the clean tree: it passes.
2. Plant one violation that only this check catches. The stack skill has the table; without one:

   | Check | Plant |
   |---|---|
   | Lint | an unused variable or import in a source file the config covers |
   | Format | break the formatting of one line |
   | Types | assign a string to a variable declared as an integer |
   | Tests | flip one expected value in an existing test |
   | Hook | stage the format plant and run `git commit`: the commit must be refused |
   | CI | push a plant on a throwaway branch or draft pull request and watch its step go red; delete the branch after |

3. Run it again: it **fails, naming the plant**.
4. Revert the plant and run it once more: it passes. `git restore <file>` resets the whole file, so commit the setup first or plant in a file the setup didn't touch. Confirm `git status` shows none of the plants.

A gate that stays green on its plant is a finding, not a gate: find why (a path the config excludes, a hook not installed in this clone, the hook handing the tool no files, a warning that doesn't fail the run, a watch-mode test command, a step with `continue-on-error`, a job that never triggers; the stack skill lists its own), fix it, and prove it again.

Done when every row of this table is filled from real runs. A cell you couldn't run (no push access, no admin rights) says "not run" with the reason and goes to the user as a step, never reported as proven.

Use the [shared proof table](COMMON.md#proof-table).

### 8. Record the gates

- **`CONSTRAINTS.md`**, if present: one Enforced row per gate naming its command, with cost deciding placement (seconds-long checks on every edit, the suite at task end and in CI), and one Exceptions row per ratchet entry, with its owner and expiry.
- **The instruction file** (`AGENTS.md`): offer one line naming the commands (or the one script that runs them all) to run before claiming work is done.

### Report

The inventory, every file added or changed, the commands run in order, the proof table, any ratchet left (entries with counts and owners), and the human steps left (the required status check, a check the user chose to fix later).

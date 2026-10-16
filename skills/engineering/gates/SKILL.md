---
name: gates
description: "Use when a project's checks don't block broken code, in any language (Golang, Java, Kotlin, Ruby, PHP, C++): adding or repairing lint, format, type, or test checks in a pre-commit hook or CI such as GitHub Actions, a build that stays green or doesn't block a merge, a new check red on hundreds of existing violations, or a rule that stops one package importing another's internals or forming a dependency cycle."
---

# Gates

A **gate** is a check that blocks a mistake mechanically: lint, format, types, and tests, run in a pre-commit hook (fast, local) and in CI (authoritative, required to merge), plus boundary rules that make a forbidden import fail. A gate counts only once it has been seen to **bite**: fail on a planted violation, then pass again once it's reverted. A gate nobody has watched fail is a guess.

**Stack skills.** When the project's stack has a `guards-<stack>` skill installed (lint, format, types, tests, hook, CI) or a `seams-<stack>` skill (module boundaries), load it with your skill tool: it supplies the stack's inventory sources, commands, config, violations to plant, and diagnostics, and this skill supplies the procedure. A repo with several stacks loads each one. For a stack with no such skill, run this procedure with the tools the inventory finds, and check every command, flag, and action version against its official docs or `--help`, never memory.

Part 1 sets up the guardrails; Part 2 enforces a module boundary. Each ends in its own report.

## Part 1: Guardrails

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

A gate can't start red, and a gate left off guards nothing. When a check fails on code that's already there, measure it (violations by rule and by file), show the user the count, then ask which route:

- **(a) Fix first**, in its own commit with no other change in it, then turn the gate on.
- **(b) A ratchet**: the gate goes in at today's passing level, and the known violations go on a list that only shrinks. Each listed entry is recorded as an exception in `CONSTRAINTS.md` with an owner and an expiry, and is deleted when its last violation is fixed; a new entry is never added. The stack skill names its mechanism; without one, use the tool's own baseline or known-violations file, or a narrower start in config with each rule or path left out on the list.

Never get green by adding suppression comments, by loosening a setting the project already has, or by leaving a violation off the list: the constraint floor forbids new suppressions, and the ratchet is the route. Fix the violations yourself only if the user chooses (a).

A test that fails on existing code is a bug, not a gate setting: stop and show the user before turning the test gate on.

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

| Check | Gate | Clean | Plant | Failing output | Reverted, clean |
|---|---|---|---|---|---|

### 8. Record the gates

- **`CONSTRAINTS.md`**, if present: one Enforced row per gate naming its command, with cost deciding placement (seconds-long checks on every edit, the suite at task end and in CI), and one Exceptions row per ratchet entry, with its owner and expiry.
- **The instruction file** (`AGENTS.md`): offer one line naming the commands (or the one script that runs them all) to run before claiming work is done.

### Report

The inventory, every file added or changed, the commands run in order, the proof table, any ratchet left (entries with counts and owners), and the human steps left (the required status check, a check the user chose to fix later).

## Part 2: Module boundaries

Make a boundary between modules mechanical, so a violation fails a check instead of relying on someone remembering the rule. The vocabulary is the `modules` skill's (**module**, **interface**, **seam**, **depth**): load it with your skill tool if it isn't already in context. The `seams-<stack>` skill says what a module, an interface, and a deep reach are in that stack, and supplies the tools.

### 1. Map the modules

List the modules at the scale that matters (packages, projects, crates, or folders inside one), each one's interface (its entry points), and what the repo already uses for boundaries: an import or dependency rules file, architecture tests, a build tool's tags. Existing rules are the first thing to run and the place new rules go.

Done when every module in scope, its interface, and every existing rule are listed.

### 2. Measure the edges

Measure with a tool, never by reading imports by eye: the graph must include every module, not the ones you happened to open. Without a `seams-<stack>` skill, use the dependency tool the project has, or ask the user which one to use; if you must read imports by hand, the report says the graph is partial. Anything the tool can't resolve (an alias, a macro, a missing file) is a blind spot: fix the tool's config or list it before trusting the numbers.

Produce, each with the command that produced it:

- **The module graph**, collapsed to one node per module.
- **Cycles**, each as its chain with the file and line of every link.
- **Deep reaches**: each caller, the import, the file and line, and the interface it should go through instead.
- **Fan-in and fan-out** per module: how many modules use it, and how many it uses.

Read the numbers as signals: high fan-in is an interface many callers depend on, so changes there ripple, and it is the one most worth protecting; high fan-out is a module that knows too much; high on both is a hub. A deep reach says the interface is missing something its callers need, or the caller is reaching for an implementation detail.

Done when every module has fan-in and fan-out, and every cycle and deep reach is listed with its file and line.

### 3. Decide the boundary

A rule encodes a decision, so make the decision first, with the user:

- **Direction**: which module may use which. A cycle is a design question (which side owns the shared concept, or what moves behind a seam): load the `modules` skill with your skill tool and settle it before writing a rule that forbids one side.
- **Interface**: what each protected module exposes. Everything callers reach past it today either becomes a deliberate part of the interface or stops being used.

Done when every boundary is one sentence ("`billing` never imports `orders`"; "outside `billing`, use only `billing`'s interface").

### 4. Enforce it

Use the lightest mechanism that makes a violation fail, strongest first, and run it in a command CI already runs, or it guards nothing:

1. **The language itself**: visibility or an export list, so the compiler or runtime refuses a caller past the interface.
2. **The package manifest**: a module in its own package, project, or crate, so the dependencies it declares are the direction rule.
3. **A rule in the checks**: an import or dependency linter, an architecture test, or a banned-API list, at error severity, for what the first two can't express.

Existing violations follow Part 1, step 4: fix them first (move each caller onto the interface, or move the code to the side of the boundary it belongs on), or ratchet them. Never widen the rule or exclude the offending files to get green.

Done when each boundary sentence has a rule, and the CI command runs it.

### 5. Prove it bites

Boundary rules fail open quietly: a pattern that matches nothing, an unresolved alias, a file outside the graph, or a loader that missed the code passes every time. For each rule, through the same command CI runs:

1. Run it on the clean tree: it passes.
2. Plant one violation of that rule and nothing else, written the way a caller would: a deep import past the interface (through the package name or alias, not only a relative path), an import in the forbidden direction, or the import that closes a cycle.
3. Run it: it **fails, naming the rule and the planted file**.
4. Revert (commit the rule and the moved callers first, as in Part 1, step 7), confirm `git status` shows nothing planted, and run it again: it passes.

A rule that stays green on its plant is a finding, not a boundary: find why (the stack skill lists the usual causes), fix it, and prove it again. Record the rows in the Part 1 proof table, with the rule as the check; anything you couldn't run is "not run" with the reason, never reported as proven.

### 6. Document the boundary

- **Next to the code** it governs (the module's README, or a comment at the top of its interface file or the rule): what the interface is, what's internal, the allowed direction, and which check enforces it.
- **The instruction file** (`AGENTS.md`): one pointer line naming the rule and its command, so agents find the rule instead of tripping over it.
- **`CONSTRAINTS.md`**, if present: an Enforced row ("Architecture boundaries | zero violations | <the rule's command> | CI"), and an Exceptions row per ratchet entry.

### Report

The measurements (fan-in and fan-out per module, every cycle with its links, every deep reach with file and line), the boundary sentences, the rules added, the files changed, the proof table, and any ratchet entries left with their owner.

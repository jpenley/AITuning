# Shared gate safeguards

Read this before either branch. A gate counts only after a clean run, a planted violation that fails for the intended reason, and a clean run after reverting the plant. Preserve the project's existing floor.

## Existing violations

A gate can't start red, and a gate left off guards nothing. When a check fails on code that's already there, measure it (violations by rule and by file), show the user the count, then ask which route:

- **(a) Fix first**, in its own commit with no other change in it, then turn the gate on.
- **(b) A ratchet**: the gate goes in at today's passing level, and the known violations go on a list that only shrinks. Each listed entry is recorded as an exception in `CONSTRAINTS.md` with an owner and an expiry, and is deleted when its last violation is fixed; a new entry is never added. The stack skill names its mechanism; without one, use the tool's own baseline or known-violations file, or a narrower start in config with each rule or path left out on the list.

Never get green by adding suppression comments, by loosening a setting the project already has, or by leaving a violation off the list: the constraint floor forbids new suppressions, and the ratchet is the route. Fix the violations yourself only if the user chooses (a).

A test that fails on existing code is a bug, not a gate setting: stop and show the user before turning the test gate on.

## Reset safety

`git restore <file>` resets the whole file. Commit the setup, rules and moved callers first, or plant in a file they did not touch. Revert only the plant; never discard unrelated work. Confirm `git status` shows none of the plants before the final clean run.

## Proof table

Fill every applicable row from real runs. A cell you cannot run (for example no push access or no admin rights) says "not run" with the reason. Give the human the remaining step; never report that gate as proven. A gate that stays green on its plant is a finding to fix and prove again, not a passing gate.

| Check | Gate | Clean | Plant | Failing output | Reverted, clean |
|---|---|---|---|---|---|

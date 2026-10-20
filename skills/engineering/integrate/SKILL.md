---
name: integrate
description: "Finish a branch whose work is done: verify it, optionally refine it, confirm the base branch, then merge locally, open (or merge) a PR, or keep the branch, and clean up safely."
disable-model-invocation: true
---

# Integrate

Get finished work into its base branch. Integration is the user's decision; this skill prepares it, offers the choices, and carries out the one they pick. Releasing (versions, tags, deploys) is the separate `release` skill.

## 1. Verify

Read [Verification cadence](../evidence/CHECKS.md). Establish passing evidence for the project's full test suite (and typecheck, if the project has one) on the branch as it stands, running missing or invalidated checks rather than repeating still-valid ones merely to enter this skill, and check the work against the Definition of Done in the `evidence` skill (Correctness, Quality, Integration, Documentation). Report the result with evidence. If anything fails, show the failures and stop: the options come after a green suite.

Read [Capabilities and deltas](../spec/CAPABILITIES.md) and [Course correction](../spec/REVISION.md). Recheck the approved revision, active ticket dispositions, preserved invariants, removal checks, and actual prerequisite delivery. Stale work or a cancelled blocker does not become valid because tests pass. Reconcile it before offering integration.

## 2. Offer to refine

If an `audit` left Deferred minors or smells on this branch, ask: "Refine first?" On yes, suggest the user run `refine`, then return here. On no, carry on.

## 3. Confirm the base branch

The base is what this work forked from: named in the spec, the conversation, or the branch's upstream. If it isn't already known for certain, ask: "This branch split from `<best guess>`: is that correct?" Merging into the wrong base is expensive to undo.

## 4. Offer the options

If a PR for this branch already exists (for example one `build <spec>` opened), offer:

1. Merge the PR into `<base>` (after its checks pass)
2. Leave it open for review

Otherwise, offer exactly these:

1. Merge into `<base>` locally
2. Push and open a PR
3. Keep the branch as it is

Wait for the user's choice.

## 5. Carry it out

Before any commit this step makes, review the staged diff: no secrets, `.env*` files, build output, or key files go in.

- **Merge locally**: from the main checkout, update `<base>`, merge the branch, and **run the tests on the merged result**, plus typecheck and other applicable merged-result gates. Pre-merge evidence alone does not prove a different merged tree. If they fail, stop and leave the branch and any worktree in place: nothing has been pushed, so it's recoverable. If the merge conflicts, load the `merge` skill with your skill tool. Once the merged result is green, clean up (step 6).
- **Push and open a PR**: push the branch with upstream tracking, then open the PR against `<base>` with the forge's tooling (its CLI, or the creation link the push prints), following the repo's PR template if it has one, otherwise writing the body by loading the `pr` skill with your skill tool. Report the PR link. Keep any worktree: review fixes happen there.
- **Merge an existing PR**: confirm its checks pass, merge it with the forge's tooling using the repo's usual merge method, then clean up (step 6).
- **Keep as is**: report the branch name and any worktree path.

**When a check fails**, classify it before any re-run. A flake or infrastructure failure (a timeout, a lost runner, a network error) earns one fresh run; an identical second failure is not a flake, so read its logs. A failure in code the diff never touched suggests a stale base: check with `git merge-base --is-ancestor origin/<base> HEAD`, and if the base has moved on, offer to update the branch instead of re-running. Only a failure in the diff's own code gets a commit on this branch.

## 6. Clean up

- **Worktrees**: remove a worktree only if this flow created it (the `build` skill's, or one under `.worktrees/`) and it is clean. If removal is refused because of uncommitted or untracked files, show the list and ask whether to commit them, move them into the main checkout, or delete them. A worktree the harness created and manages belongs to the harness: leave it, or use the harness's own exit mechanism. To see every worktree's state at once, run the `build` skill's read-only audit, `node ../build/scripts/worktree-audit.mjs` from this skill's folder.
- **Branches**: delete a branch only after its work is merged, with `git branch -d`. Before recommending any delete, try to prove it wrong: look for a commit on the branch that the base doesn't contain (squash and rebase merges hide these from `git branch -d`, so compare the changes, not only the commit IDs). When unsure, keep it. Re-run that check right before deleting, and quote branch names in commands.

## 7. Report

After a verified merge, update affected current capability records with only the landed Delta entries and their evidence scope. Preserve the change spec's baseline and revision history; leave unfinished targets open. Opening a PR does not advance the current baseline. Deployment verification belongs to release.

Say what landed where: the branch, the base, and the merge commit or PR link. When the tracker still holds open specs or tickets beyond the ones this branch delivered, suggest the user run `streamline`: what just landed can change what the remaining tickets assume (a baseline they compare against, a number they claim, a blocker now done without delivering what they need).

## Safety rules

- Push without `--force`. A rejected push means the remote moved: investigate and report; force only when the user explicitly asks.
- Remove worktrees without `--force`; refused removal goes to the user as above.
- **Discarding work** happens only when the user asks for it in so many words. Show exactly what will be deleted (branch, commits, worktree path) and require them to type `discard` before deleting anything.
